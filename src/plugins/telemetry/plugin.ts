import { Microservice } from "../../core/engine";
import logger from "../../core/logger";
import {
  HandlerMetadata,
  Plugin,
  PluginModuleOptionsSchema,
  PluginPriority,
} from "../../core/types";
import {
  type TelemetryPluginOptions,
  type TelemetryModuleOptions,
  type TelemetryPluginConfig,
  type TelemetryExporter,
} from "./types";
import { createTelemetryWrapper } from "./wrappers";
import { Sampler } from "./sampler";
import { SpanCollector } from "./collector";

export class TelemetryPlugin implements Plugin<TelemetryModuleOptions> {
  public readonly name = "telemetry-plugin";
  public readonly priority = PluginPriority.LOGGING;

  private options: TelemetryPluginOptions;
  private config!: TelemetryPluginConfig;
  private sampler!: Sampler;
  private collector!: SpanCollector;
  private engine!: Microservice;

  constructor(options: TelemetryPluginOptions) {
    this.options = options;
  }

  getModuleOptionsSchema(): PluginModuleOptionsSchema<TelemetryModuleOptions> {
    return {
      _type: {} as TelemetryModuleOptions,
      validate: (options) => {
        if (
          options.samplingRate !== undefined &&
          (options.samplingRate < 0 || options.samplingRate > 1)
        ) {
          return "samplingRate must be between 0 and 1";
        }
        return true;
      },
    };
  }

  onInit(engine: Microservice): void {
    this.engine = engine;
    this.config = this.buildConfig(engine);

    this.sampler = new Sampler(this.config.samplerOptions);

    this.collector = new SpanCollector(
      this.config.exporter,
      this.config.collectorOptions,
    );

    logger.info("TelemetryPlugin initialized", {
      serviceName: this.config.serviceName,
    });
  }

  private buildConfig(engine: Microservice): TelemetryPluginConfig {
    const serviceName =
      this.options.serviceName || engine.options.name || "unknown-service";
    const serviceVersion =
      this.options.serviceVersion || engine.options.version;

    return {
      serviceName,
      serviceVersion,
      exporter: this.options.exporter,
      collectorOptions: {
        batchSize: this.options.batch?.size ?? 50,
        flushInterval: this.options.batch?.flushInterval ?? 5000,
      },
      samplerOptions: {
        rate: this.options.sampling?.rate ?? 1.0,
        minDuration: this.options.sampling?.minDuration,
      },
      collectOptions: {
        params: this.options.collect?.params ?? true,
        result: this.options.collect?.result ?? false,
        maxParamSize: this.options.collect?.maxParamSize ?? 1024,
        maxResultSize: this.options.collect?.maxResultSize ?? 2048,
      },
    };
  }

  onHandlerLoad(handlers: HandlerMetadata[]): void {
    const actionHandlers = handlers.filter((h) => h.type === "action");

    for (const handler of actionHandlers) {
      handler.wrap(
        createTelemetryWrapper(
          handler,
          this.engine,
          this.config,
          this.sampler,
          this.collector,
        ),
      );
    }

    logger.info(
      `TelemetryPlugin wrapped ${actionHandlers.length} action handler(s)`,
    );
  }

  onAfterStart(engine: Microservice): void {
    this.collector.startFlushTimer();
  }

  async onDestroy(): Promise<void> {
    await this.collector.close();
    logger.info("TelemetryPlugin closed");
  }
}
