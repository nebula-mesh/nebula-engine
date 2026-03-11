import "@opentelemetry/api-logs";
import { LoggerProvider } from "@opentelemetry/sdk-logs";

export function instrumentationLogger(provider: LoggerProvider) {
  // Get a logger instance
  const logger = provider.getLogger("default", "1.0.0");

  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  // Map severity levels
  const SeverityNumber = {
    DEBUG: 5,
    INFO: 9,
    WARN: 13,
    ERROR: 17,
  };

  // Override console methods
  console.log = function (...args: any[]) {
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg) : String(arg),
      )
      .join(" ");

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: message,
      attributes: {},
    });

    originalConsole.log.apply(console, args);
  };

  console.info = function (...args: any[]) {
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg) : String(arg),
      )
      .join(" ");

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: message,
      attributes: {},
    });

    originalConsole.info.apply(console, args);
  };

  console.warn = function (...args: any[]) {
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg) : String(arg),
      )
      .join(" ");

    logger.emit({
      severityNumber: SeverityNumber.WARN,
      severityText: "WARN",
      body: message,
      attributes: {},
    });

    originalConsole.warn.apply(console, args);
  };

  console.error = function (...args: any[]) {
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg) : String(arg),
      )
      .join(" ");

    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: message,
      attributes: {},
    });

    originalConsole.error.apply(console, args);
  };

  console.debug = function (...args: any[]) {
    const message = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg) : String(arg),
      )
      .join(" ");

    logger.emit({
      severityNumber: SeverityNumber.DEBUG,
      severityText: "DEBUG",
      body: message,
      attributes: {},
    });

    originalConsole.debug.apply(console, args);
  };
}
