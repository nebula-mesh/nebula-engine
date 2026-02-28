import type { PluginModuleOptionsSchema } from "../../core/types";

export const TRACE_HEADER_PREFIX = "X-Trace-";

export const TRACE_HEADERS = {
  TRACE_ID: `${TRACE_HEADER_PREFIX}TraceId`,
  SPAN_ID: `${TRACE_HEADER_PREFIX}SpanId`,
  PARENT_ID: `${TRACE_HEADER_PREFIX}ParentId`,
} as const;

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentId?: string;
}

export interface RequestContextData {
  trace: TraceContext;
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
  };
  cache?: {
    hit: boolean;
  };
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentId?: string;
  serviceName: string;
  serviceVersion?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  moduleName: string;
  actionName: string;
  params?: any[];
  result?: any;
  cacheHit?: boolean;
  success: boolean;
  error?: string;
}

export interface TelemetryPayload {
  spans: TraceSpan[];
  resource: {
    serviceName: string;
    serviceVersion?: string;
  };
  timestamp: number;
}

export interface TelemetryExporter {
  export(spans: TraceSpan[]): Promise<void>;
  close?(): Promise<void>;
}

export interface TelemetryPluginOptions {
  serviceName: string;
  serviceVersion?: string;
  exporter: TelemetryExporter;
  batch?: {
    size: number;
    flushInterval: number;
  };
  sampling?: {
    rate: number;
    minDuration?: number;
  };
  collect?: {
    params: boolean;
    result: boolean;
    maxParamSize: number;
    maxResultSize: number;
  };
}

export interface TelemetryModuleOptions {
  samplingRate?: number;
  collectParams?: boolean;
  collectResult?: boolean;
}

export interface SamplerOptions {
  rate: number;
  minDuration?: number;
}

export interface CollectorOptions {
  batchSize: number;
  flushInterval: number;
}

export interface TelemetryPluginConfig {
  serviceName: string;
  serviceVersion?: string;
  exporter: TelemetryExporter;
  collectorOptions: CollectorOptions;
  samplerOptions: SamplerOptions;
  collectOptions: {
    params: boolean;
    result: boolean;
    maxParamSize: number;
    maxResultSize: number;
  };
}
