import type { TraceSpan, CollectorOptions, TelemetryExporter } from "./types";

export class SpanCollector {
  private exporter: TelemetryExporter;
  private spans: TraceSpan[] = [];
  private batchSize: number;
  private flushInterval: number;
  private timer: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;

  constructor(exporter: TelemetryExporter, options: CollectorOptions) {
    this.exporter = exporter;
    this.batchSize = options.batchSize;
    this.flushInterval = options.flushInterval;
  }

  startFlushTimer(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.flush().catch((error) => {
        console.error("[Telemetry] Flush error:", error);
      });
    }, this.flushInterval);
  }

  stopFlushTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  collect(span: TraceSpan): void {
    this.spans.push(span);

    if (this.spans.length >= this.batchSize) {
      this.flush().catch((error) => {
        console.error("[Telemetry] Flush error:", error);
      });
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.spans.length === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      const spansToExport = [...this.spans];
      this.spans = [];

      await this.exporter.export(spansToExport);
    } catch (error) {
      console.error("[Telemetry] Export error:", error);
    } finally {
      this.isFlushing = false;
    }
  }

  async close(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
    if (this.exporter.close) {
      await this.exporter.close();
    }
  }

  getQueueSize(): number {
    return this.spans.length;
  }
}
