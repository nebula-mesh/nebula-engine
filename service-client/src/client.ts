import { SpanStatusCode, trace } from "@opentelemetry/api";
import ejson from "ejson";
import {
  DEFAULT_RETRY_DELAYS,
  DEFAULT_TIMEOUT,
  HTTP_STATUS,
} from "./constants.ts";
import {
  ClientError,
  ConnectionError,
  StreamError,
  TimeoutError,
} from "./errors.ts";
import { RequestQueue } from "./queue.ts";
import type {
  ClientConfig,
  ModuleMethodOptions,
  RequestOptions,
} from "./types.ts";
import { retry, tryParseCompleteJson } from "./utils.ts";

const tracer = trace.getTracer("microservice-client");

/**
 * Universal client for microservices
 * @example
 * ```typescript
 * const client = new BaseMicroserviceClient({
 *   baseUrl: 'http://localhost:3000',
 *   prefix: '/api'
 * });
 * ```
 */
export class BaseMicroserviceClient {
  private baseUrl: string;
  private prefix: string;
  private headers: Record<string, string>;
  private fetch: typeof fetch;
  private config: ClientConfig;
  private queue: RequestQueue;

  /**
   * Creates a new MicroserviceClient instance
   * @param options Client configuration options
   */
  constructor(options: ClientConfig) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.prefix = options.prefix || "/api";
    this.fetch = options.fetch || fetch;
    this.config = {
      retry: {
        maxAttempts: 3,
        delays: DEFAULT_RETRY_DELAYS,
        ...options.retry,
      },
      request: {
        timeout: DEFAULT_TIMEOUT,
        ...options.request,
      },
      stream: {
        autoClose: true,
        ...options.stream,
      },
      ...options,
    };

    this.headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    this.queue = new RequestQueue(options.request?.concurrency || 10);
  }

  /**
   * 应用请求拦截器
   * @internal
   */
  private async applyRequestInterceptors(config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
  }): Promise<void> {
    const interceptors = this.config.interceptors || [];
    for (const interceptor of interceptors) {
      if (interceptor.onRequest) {
        await interceptor.onRequest(config);
      }
    }
  }

  /**
   * 应用响应拦截器
   * @internal
   */
  private async applyResponseInterceptors(
    response: Response
  ): Promise<Response> {
    const interceptors = this.config.interceptors || [];
    let interceptedResponse = response;
    for (const interceptor of interceptors) {
      if (interceptor.onResponse) {
        interceptedResponse = await interceptor.onResponse(interceptedResponse);
      }
    }
    return interceptedResponse;
  }

  /**
   * 应用错误拦截器
   * @internal
   */
  private async applyErrorInterceptors(error: Error): Promise<Error> {
    const interceptors = this.config.interceptors || [];
    let interceptedError = error;
    for (const interceptor of interceptors) {
      if (interceptor.onError) {
        interceptedError = await interceptor.onError(interceptedError);
      }
    }
    return interceptedError;
  }

  /**
   * Sends an HTTP request to the server
   * @internal
   */
  private async sendHttpRequest(
    url: string,
    args: any[],
    isStream: boolean,
    options?: RequestOptions
  ): Promise<any> {
    const config = {
      url,
      method: "POST",
      headers: {
        ...this.headers,
        ...options?.headers,
      },
      body: args.reduce(
        (obj, arg, index) => {
          obj[index] = arg;
          return obj;
        },
        {} as Record<number, any>
      ),
    };

    const key = crypto.randomUUID();

    return await this.queue.add(
      key,
      async () => {
        try {
          // 应用请求拦截器
          await this.applyRequestInterceptors(config);

          // 发送请求
          let response: Response;
          try {
            response = await this.fetch(url, {
              method: config.method,
              headers: config.headers,
              body: ejson.stringify(config.body),
            });
          } catch (error) {
            throw new ConnectionError(
              error instanceof Error ? error.message : String(error)
            );
          }

          // 应用响应拦截器
          response = await this.applyResponseInterceptors(response);

          // 处理响应
          if (isStream) {
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = ""; // 缓冲区用于累积不完整的 chunk

            return {
              [Symbol.asyncIterator]: () => ({
                next: async () => {
                  try {
                    // 尝试从缓冲区中解析完整的 ejson 对象
                    while (true) {
                      // 尝试从缓冲区中找到并解析第一个完整的 JSON 对象
                      const result = tryParseCompleteJson(buffer);
                      if (result) {
                        buffer = result.remaining; // 保留剩余部分
                        if (result.data.error) {
                          throw new StreamError(result.data.error);
                        }
                        return {
                          done: result.data.done || false,
                          value: result.data.value,
                        };
                      }

                      // 如果没有找到完整的对象，继续读取下一个 chunk
                      const { done, value } = await reader.read();
                      if (done) {
                        // 流结束，检查缓冲区是否还有数据
                        if (buffer.trim()) {
                          // 尝试最后一次解析
                          const finalResult = tryParseCompleteJson(buffer);
                          if (finalResult) {
                            buffer = finalResult.remaining;
                            if (finalResult.data.error) {
                              throw new StreamError(finalResult.data.error);
                            }
                            return {
                              done: finalResult.data.done || false,
                              value: finalResult.data.value,
                            };
                          }
                          // 如果无法解析，说明数据损坏
                          throw new StreamError(
                            "Incomplete stream data at end of stream"
                          );
                        }
                        // 缓冲区为空，流正常结束
                        return { done: true, value: undefined };
                      }
                      buffer += decoder.decode(value, { stream: true });
                      // 继续循环尝试解析
                    }
                  } catch (error) {
                    if (error instanceof StreamError) {
                      throw error;
                    }
                    throw new StreamError(
                      error instanceof Error ? error.message : String(error)
                    );
                  }
                },
                return: async () => {
                  await reader.cancel();
                  buffer = ""; // 清空缓冲区
                  return { done: true, value: undefined };
                },
              }),
            };
          }

          // 非流式请求
          const result = await response.text();
          const data = ejson.parse(result);

          if (!response.ok) {
            switch (response.status) {
              case HTTP_STATUS.BAD_REQUEST:
                throw new ClientError(data.error || "Bad request");
              case HTTP_STATUS.UNAUTHORIZED:
                throw new ClientError(data.error || "Unauthorized");
              case HTTP_STATUS.NOT_FOUND:
                throw new ClientError(data.error || "Not found");
              default:
                throw new ConnectionError(data.error || "Request failed");
            }
          }

          if (!data.success) {
            throw new ClientError(data.error);
          }

          return data.data;
        } catch (error) {
          // 如果已经是我们的错误类型，直接应用错误拦截器
          const err = error instanceof Error ? error : new Error(String(error));
          throw await this.applyErrorInterceptors(err);
        }
      },
      options?.timeout || this.config.request?.timeout,
      url
    );
  }

  /**
   * Sends a request to the server
   * @internal
   */
  protected async request(
    moduleName: string,
    methodName: string,
    isStream: boolean,
    idempotent: boolean,
    ...args: any[]
  ): Promise<any> {
    const url = `${this.baseUrl}${this.prefix}/${moduleName}/${methodName}`;
    const span = tracer.startSpan("request");
    span.setAttribute("moduleName", moduleName);
    span.setAttribute("methodName", methodName);
    span.setAttribute("url", url);
    span.setAttribute("args", JSON.stringify(args));
    span.setAttribute("isStream", isStream);
    span.setAttribute("idempotent", idempotent);
    span.setAttribute("protocol", "http");
    const result = await this.makeRequest(url, args, isStream, idempotent)
      .catch((error) => {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      })
      .finally(() => {
        span.end();
      });
    return result;
  }

  private async makeRequest(
    url: string,
    args: any[],
    isStream: boolean,
    idempotent: boolean
  ): Promise<any> {
    const makeRequest = async () => {
      try {
        return await this.sendHttpRequest(url, args, isStream);
      } catch (error) {
        if (error instanceof TimeoutError || error instanceof ConnectionError) {
          throw error;
        }
        throw new ClientError(
          error instanceof Error ? error.message : String(error)
        );
      }
    };

    // 非幂等方法或流式请求不支持重试
    if (!idempotent || isStream) {
      return await makeRequest();
    }

    return await retry(makeRequest, this.config.retry);
  }

  /**
   * Closes the client and its connections
   */
  close() {
  }

  /**
   * 注册模块方法
   * 这个方法会被生成的客户端代码调用
   */
  protected registerModuleMethod(
    moduleName: string,
    methodName: string,
    options: ModuleMethodOptions
  ) {
    // deno-lint-ignore no-this-alias
    const self = this;
    return async function (...args: any[]) {
      return await self.request(
        moduleName,
        methodName,
        options.stream,
        options.idempotent,
        ...args
      );
    };
  }

  /**
   * 注册模块
   * 这个方法会被生成的客户端代码调用
   */
  protected registerModule<T>(
    moduleName: string,
    methods: Record<string, ModuleMethodOptions>
  ) {
    const module = {} as Record<string, (...args: any[]) => Promise<any>>;
    for (const [methodName, options] of Object.entries(methods)) {
      module[methodName] = this.registerModuleMethod(
        moduleName,
        methodName,
        options
      );
    }
    return module as T;
  }
}
