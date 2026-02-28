import { AsyncLocalStorage } from "async_hooks";
import {
  TRACE_HEADERS,
  type RequestContextData,
  type TraceContext,
} from "./types";

const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  get(): RequestContextData | undefined {
    return requestContextStorage.getStore();
  },

  run<T>(context: RequestContextData, fn: () => T): T {
    return requestContextStorage.run(context, fn);
  },

  setCacheInfo(hit: boolean): void {
    const ctx = requestContextStorage.getStore();
    if (ctx) {
      ctx.cache = { hit };
    }
  },

  getCacheInfo(): { hit: boolean } | undefined {
    const ctx = requestContextStorage.getStore();
    return ctx?.cache;
  },
};

export function parseTraceContext(
  headers: Record<string, string>,
): TraceContext | null {
  const lowerHeaders: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    lowerHeaders[key.toLowerCase()] = headers[key];
  }

  const traceId = lowerHeaders[TRACE_HEADERS.TRACE_ID.toLowerCase()];
  if (!traceId) {
    return null;
  }

  return {
    traceId,
    spanId: lowerHeaders[TRACE_HEADERS.SPAN_ID.toLowerCase()] || "",
    parentId: lowerHeaders[TRACE_HEADERS.PARENT_ID.toLowerCase()] || undefined,
  };
}

export function createTraceContext(
  headers: Record<string, string>,
  generateId: () => string,
): TraceContext {
  const parsed = parseTraceContext(headers);

  if (parsed) {
    return {
      traceId: parsed.traceId,
      spanId: generateId(),
      parentId: parsed.spanId,
    };
  }

  return {
    traceId: generateId(),
    spanId: generateId(),
  };
}
