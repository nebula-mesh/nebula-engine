// 这个文件是自动生成的，请不要手动修改

import { MicroserviceClient as BaseMicroserviceClient } from "imean-service-client";
export * from "imean-service-client";

export interface TestsModule {
  /**
   * 获取用户
   */
  getUser: (id: string) => Promise<{ id: string; name: string; age: number }>;

  /**
   * 创建用户
   */
  createUser: (
    name: string,
    age: number,
  ) => Promise<{ id: string; name: string; age: number }>;

  /**
   * 更新用户
   */
  updateUser: (
    id: string,
    name: string,
    age: number,
  ) => Promise<{ id: string; name: string; age: number }>;

  /**
   * 可重试操作
   */
  retryableOperation: (id: string) => Promise<{ id: string }>;

  /**
   * 总是失败的操作
   */
  alwaysFailOperation: (id: string) => Promise<{ id: string }>;

  /**
   * 上传文件
   */
  uploadFile: (buffer: Uint8Array) => Promise<Uint8Array>;

  /**
   * 无参数无返回值
   */
  noReturnAction: () => Promise<void>;

  /**
   * 可选参数
   */
  optionalParams: (
    required: string,
    optional?: string | null,
  ) => Promise<string>;

  /**
   * 缓存函数参数
   */
  cacheFn: (key: string, value: string) => Promise<string>;

  /**
   * 缓存结果
   */
  cacheResultAction: (key: string) => Promise<string>;

  /**
   * 默认参数
   */
  defaultParamAction: (param1?: string, param2?: number) => Promise<string>;

  /**
   * 默认返回值
   */
  defaultReturnAction: () => Promise<{ a: string }>;

  /**
   * 流式返回数字
   */
  streamNumbers: (count: number) => Promise<AsyncIterable<number>>;

  /**
   * 返回 unknown 类型
   */
  unknownReturnAction: (regex: unknown) => Promise<unknown>;

  /**
   * 返回 Record 类型
   */
  recordReturnAction: (
    data: { cells: Record<string, { value: string }> }[],
  ) => Promise<{ cells: Record<string, { value: string }> }[]>;

  /**
   * 请求上下文注入
   */
  requestContextAction: () => Promise<string>;
}

export class MicroserviceClient extends BaseMicroserviceClient {
  constructor(options: any) {
    super(options);
  }

  public readonly tests = this.registerModule<TestsModule>("tests", {
    getUser: { idempotent: false, stream: false },
    createUser: { idempotent: false, stream: false },
    updateUser: { idempotent: true, stream: false },
    retryableOperation: { idempotent: true, stream: false },
    alwaysFailOperation: { idempotent: false, stream: false },
    uploadFile: { idempotent: false, stream: false },
    noReturnAction: { idempotent: false, stream: false },
    optionalParams: { idempotent: false, stream: false },
    cacheFn: { idempotent: false, stream: false },
    cacheResultAction: { idempotent: false, stream: false },
    defaultParamAction: { idempotent: false, stream: false },
    defaultReturnAction: { idempotent: false, stream: false },
    streamNumbers: { idempotent: false, stream: true },
    unknownReturnAction: { idempotent: false, stream: false },
    recordReturnAction: { idempotent: false, stream: false },
    requestContextAction: { idempotent: false, stream: false },
  });
}
