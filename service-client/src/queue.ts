// deno-lint-ignore-file no-explicit-any
import { TimeoutError } from "./errors.ts";

export interface QueuedRequest {
  promise: Promise<any>;
  abort: () => void;
}

export class RequestQueue {
  private queue = new Map<
    string,
    {
      promise: Promise<any>;
      abort: () => void;
      reject: (error: Error) => void;
    }
  >();
  private concurrency: number;
  private running = 0;
  private pendingRequests: Array<{
    key: string;
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout?: number;
    url?: string;
  }> = [];

  constructor(concurrency = 10) {
    this.concurrency = concurrency;
  }

  async add<T>(
    key: string,
    fn: () => Promise<T>,
    timeout?: number,
    url?: string
  ): Promise<T> {
    // 如果已经达到并发限制，将请求加入等待队列
    if (this.running >= this.concurrency) {
      return new Promise<T>((resolve, reject) => {
        this.pendingRequests.push({ key, fn, resolve, reject, timeout, url });
      });
    }

    return await this.executeRequest(key, fn, timeout, url);
  }

  private async executeRequest<T>(
    key: string,
    fn: () => Promise<T>,
    timeout?: number,
    url?: string
  ): Promise<T> {
    this.running++;
    const controller = new AbortController();

    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = timeout
        ? new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              controller.abort();
              reject(new TimeoutError(`Request timeout for ${url}`));
            }, timeout);
          })
        : null;

      let rejectFn: (error: Error) => void;
      const promise = new Promise<T>((resolve, reject) => {
        rejectFn = reject;
        fn().then(resolve).catch(reject);
      });

      this.queue.set(key, {
        promise,
        abort: () => {
          controller.abort();
          if (timeoutId) clearTimeout(timeoutId);
          rejectFn(new TimeoutError(`Request aborted for ${url}`));
        },
        reject: rejectFn!,
      });

      const result = await (timeoutPromise
        ? Promise.race([promise, timeoutPromise])
        : promise);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(`Request aborted for ${url}`);
      }
      throw error;
    } finally {
      this.queue.delete(key);
      this.running--;

      // 如果有等待的请求，处理下一个
      if (this.pendingRequests.length > 0 && this.running < this.concurrency) {
        const next = this.pendingRequests.shift()!;
        try {
          const result = await this.executeRequest(
            next.key,
            next.fn,
            next.timeout,
            next.url
          );
          next.resolve(result);
        } catch (error) {
          next.reject(error as Error);
        }
      }
    }
  }

  abort(key: string) {
    const request = this.queue.get(key);
    if (request) {
      request.abort();
      this.queue.delete(key);
    }
  }

  abortAll() {
    for (const [key] of this.queue) {
      this.abort(key);
    }
  }

  clear() {
    this.abortAll();
    this.pendingRequests.forEach(({ reject }) => {
      reject(new TimeoutError("Queue cleared"));
    });
    this.pendingRequests.length = 0;
  }
}
