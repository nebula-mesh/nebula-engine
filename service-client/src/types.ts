// deno-lint-ignore-file
export interface ClientOptions {
  baseUrl: string;
  prefix?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: any;
}

export interface StreamResponse<T = any> {
  value?: T;
  done: boolean;
  error?: string;
}

export interface ModuleMethodOptions {
  idempotent: boolean;
  stream: boolean;
}

// 用于生成的客户端代码的类型
export type AsyncIterableOrValue<
  T,
  IsStream extends boolean
> = IsStream extends true ? AsyncIterable<T> : T;

export type ModuleMethod<T, IsStream extends boolean = false> = {
  (...args: any[]): Promise<AsyncIterableOrValue<T, IsStream>>;
};

export type ModuleMethods = Record<string, ModuleMethod<any, boolean>>;

export type ServiceModule = Record<string, ModuleMethods>;

export interface RetryOptions {
  maxAttempts?: number;
  delays?: number[];
  shouldRetry?: (error: Error) => boolean;
}

export interface RequestOptions extends RetryOptions {
  timeout?: number;
  headers?: Record<string, string>;
  concurrency?: number;
}

export interface StreamOptions extends RequestOptions {
  bufferSize?: number;
  autoClose?: boolean;
}

export interface RequestInterceptor {
  onRequest?: (config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
  }) => Promise<void> | void;
  onResponse?: (response: Response) => Promise<Response> | Response;
  onError?: (error: Error) => Promise<Error> | Error;
}

export interface ClientConfig extends ClientOptions {
  retry?: RetryOptions;
  request?: RequestOptions;
  stream?: StreamOptions;
  interceptors?: RequestInterceptor[];
}
