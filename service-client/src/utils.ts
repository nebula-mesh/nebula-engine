// deno-lint-ignore-file ban-unused-ignore no-explicit-any
import ejson from "ejson";
import { DEFAULT_RETRY_DELAYS } from "./constants.ts";
import { ClientError, ConnectionError, TimeoutError } from "./errors.ts";
import type { RetryOptions } from "./types.ts";

export function exponentialDelay(
  retryCount: number,
  baseDelay: number
): number {
  return baseDelay * Math.min(Math.pow(2, retryCount), 5);
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delays = DEFAULT_RETRY_DELAYS,
    shouldRetry = (error) =>
      error instanceof ConnectionError || error instanceof TimeoutError,
  } = options;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!shouldRetry(lastError) || attempt >= maxAttempts - 1) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw lastError || new ClientError("Retry failed");
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * 尝试从缓冲区中找到并解析第一个完整的 JSON 对象
 * 这个函数用于处理流式响应中可能被分割的 JSON 数据
 * 
 * @param buf 缓冲区内容
 * @returns 如果找到完整对象，返回 { data, remaining }，否则返回 null
 * 
 * @example
 * ```typescript
 * const result = tryParseCompleteJson('{"value":1,"done":false}\n{"value":2');
 * // result = { data: { value: 1, done: false }, remaining: '{"value":2' }
 * 
 * const result2 = tryParseCompleteJson('{"value":1,"test":"sss');
 * // result2 = null (不完整的 JSON)
 * ```
 */
export function tryParseCompleteJson(
  buf: string
): { data: any; remaining: string } | null {
  // 跳过前导空白字符
  let start = 0;
  while (start < buf.length && /\s/.test(buf[start])) {
    start++;
  }
  if (start >= buf.length) {
    return null;
  }

  // JSON 对象必须以 { 或 [ 开头
  const firstChar = buf[start];
  if (firstChar !== "{" && firstChar !== "[") {
    return null;
  }

  // 使用括号匹配找到完整的 JSON 对象
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let end = start;

  for (let i = start; i < buf.length; i++) {
    const char = buf[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === firstChar) {
        depth++;
      } else if (
        (firstChar === "{" && char === "}") ||
        (firstChar === "[" && char === "]")
      ) {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
  }

  // 如果没有找到完整的对象，返回 null
  if (depth !== 0) {
    return null;
  }

  // 尝试解析找到的 JSON 对象
  try {
    const jsonStr = buf.slice(start, end);
    const data = ejson.parse(jsonStr);
    const remaining = buf.slice(end).trimStart();
    return { data, remaining };
  } catch {
    // 解析失败，返回 null
    return null;
  }
}
