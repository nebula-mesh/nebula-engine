import { nebulaId } from "../../core/nebula-id";
import type { HandlerMetadata, Microservice } from "../../core/types";
import type { TraceSpan, TelemetryPluginConfig } from "./types";
import { RequestContext } from "./context";
import type { Sampler } from "./sampler";
import type { SpanCollector } from "./collector";

function truncateData(data: any, maxSize: number): any {
  if (data === null || data === undefined) {
    return data;
  }

  const str = JSON.stringify(data);
  if (str.length <= maxSize) {
    return data;
  }

  return `[truncated ${str.length} -> ${maxSize}]`;
}

export function createTelemetryWrapper(
  handler: HandlerMetadata,
  engine: Microservice,
  config: TelemetryPluginConfig,
  sampler: Sampler,
  collector: SpanCollector,
) {
  const { serviceName, serviceVersion, collectOptions } = config;

  const moduleMetadata = engine
    .getModules()
    .find((m: any) => m.clazz === handler.module);
  const moduleName = moduleMetadata?.name || handler.module.name;

  return async function telemetryWrap(
    next: () => Promise<any>,
    instance: any,
    ...args: any[]
  ) {
    const ctx = RequestContext.get();
    if (!ctx) {
      return next();
    }

    if (!sampler.shouldSample(ctx)) {
      return next();
    }

    const span: TraceSpan = {
      traceId: ctx.trace.traceId,
      spanId: nebulaId(),
      parentId: ctx.trace.parentId,
      serviceName,
      serviceVersion,
      startTime: Date.now(),
      moduleName: moduleName,
      actionName: handler.methodName,
      params: collectOptions.params
        ? truncateData(args, collectOptions.maxParamSize)
        : undefined,
      success: true,
    };

    try {
      const result = await next();
      span.result = collectOptions.result
        ? truncateData(result, collectOptions.maxResultSize)
        : undefined;
      return result;
    } catch (error) {
      span.success = false;
      span.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      const cacheInfo = RequestContext.getCacheInfo();
      if (cacheInfo) {
        span.cacheHit = cacheInfo.hit;
      }

      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;

      collector.collect(span);
    }
  };
}
