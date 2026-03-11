import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { FetchInstrumentation } from "opentelemetry-instrumentation-fetch-node";
import { Microservice } from "../../core/engine";
import { Plugin, PluginPriority } from "../../core/types";
import { instrumentationLogger } from "./log";
import type { TelemetryModuleOptions, TelemetryPluginOptions } from "./types";

export class TelemetryPlugin implements Plugin<TelemetryModuleOptions> {
  public readonly name = "telemetry-plugin";
  public readonly priority = PluginPriority.LOGGING;

  private options: TelemetryPluginOptions;
  private sdk!: NodeSDK;

  constructor(options: TelemetryPluginOptions = {}) {
    this.options = options;
  }

  private getEnv(key: string): string | undefined {
    return process.env[key];
  }

  onInit(engine: Microservice): void {
    const endpoint =
      this.options.endpoint || this.getEnv("OTEL_EXPORTER_OTLP_ENDPOINT");

    // 配置 Tracing Exporter
    const traceExporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    });

    // 配置 Logs Exporter
    const logExporter = new OTLPLogExporter({
      url: `${endpoint}/v1/logs`,
    });

    const loggerProvider = new LoggerProvider({
      processors: [new BatchLogRecordProcessor(logExporter)], // Configure batch processor
    });

    instrumentationLogger(loggerProvider);

    this.sdk = new NodeSDK({
      serviceName: engine.options.name,
      traceExporter: traceExporter,
      instrumentations: [
        new FetchInstrumentation({ enabled: true }),
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-http": { enabled: true },
        }),
      ],
    });

    this.sdk.start();
  }
}
