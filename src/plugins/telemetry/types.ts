import { SpanExporter } from "@opentelemetry/sdk-trace-base";

export interface TelemetryPluginOptions {
  exporter?: SpanExporter;
  endpoint?: string;
  headers?: Record<string, string>;
  insecure?: boolean;
}

export interface TelemetryModuleOptions {}
