/**
 * 集成测试用的开发微服务
 * 包含所有测试用例需要的 Action handlers
 */

import { Context } from "hono";
import { z } from "zod";
import { Factory } from "../../src/core/factory";
import { Action, ActionPlugin } from "../../src/plugins/action";
import { Cache, CachePlugin } from "../../src/plugins/cache";
import { ClientCodePlugin } from "../../src/plugins/client-code";

// 使用 Factory 创建类型化的引擎
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new CachePlugin(),
  new ClientCodePlugin({
    clientSavePath: "./tests/integration/generated/client.ts",
  })
);

const engine = new Microservice({
  name: "integration-test-service",
  version: "1.0.0",
  prefix: "/api",
});

// 模拟用户数据
const users = new Map<string, { id: string; name: string; age: number }>([
  ["1", { id: "1", name: "张三", age: 25 }],
  ["2", { id: "2", name: "李四", age: 30 }],
]);

// 重试计数器（需要在每个测试前重置）
// 使用 Map 来跟踪每个操作的失败次数，避免不同测试之间的干扰
export const failureCounter = new Map<string, number>();
let alwaysFailCount = 0;

// 重置计数器的函数
export function resetCounters() {
  failureCounter.clear();
  alwaysFailCount = 0;
}

@Module("tests")
class TestService {
  /**
   * 获取用户
   */
  @Action({
    description: "获取用户",
    params: [z.string()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
  })
  getUser(id: string) {
    const user = users.get(id);
    if (!user) {
      throw new Error("用户不存在");
    }
    return user;
  }

  /**
   * 创建用户
   */
  @Action({
    description: "创建用户",
    params: [z.string(), z.number()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
  })
  createUser(name: string, age: number) {
    const id = (users.size + 1).toString();
    const user = { id, name, age };
    users.set(id, user);
    return user;
  }

  /**
   * 更新用户（幂等操作）
   */
  @Action({
    description: "更新用户",
    params: [z.string(), z.string(), z.number()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
    idempotence: true,
  })
  updateUser(id: string, name: string, age: number) {
    const user = { id, name, age };
    users.set(id, user);
    return user;
  }

  /**
   * 可重试操作（前两次失败，第三次成功）
   */
  @Action({
    description: "可重试操作",
    params: [z.string()],
    returns: z.object({ id: z.string() }),
    idempotence: true, // 标记为幂等操作，支持重试
  })
  retryableOperation(id: string) {
    // 获取当前操作的失败次数
    const failCount = failureCounter.get(id) || 0;
    // 如果失败次数小于2，增加失败次数并抛出错误
    if (failCount < 2) {
      failureCounter.set(id, failCount + 1);
      throw new Error("临时错误");
    }
    // 第三次尝试时成功，清除计数器
    failureCounter.delete(id);
    return { id };
  }

  /**
   * 总是失败的操作
   */
  @Action({
    description: "总是失败的操作",
    params: [z.string()],
    returns: z.object({ id: z.string() }),
  })
  alwaysFailOperation(id: string) {
    const failCount = failureCounter.get(id) || 0;
    failureCounter.set(id, failCount + 1);
    throw new Error("永久性错误");
  }

  /**
   * 上传文件
   */
  @Action({
    description: "上传文件",
    params: [z.instanceof(Uint8Array)],
    returns: z.instanceof(Uint8Array),
  })
  uploadFile(buffer: Uint8Array) {
    // 反转数组
    return new Uint8Array(buffer.reverse());
  }

  /**
   * 无参数无返回值
   */
  @Action({
    description: "无参数无返回值",
    params: [],
    returns: z.void(),
  })
  noReturnAction() {
    return undefined;
  }

  /**
   * 可选参数
   */
  @Action({
    description: "可选参数",
    params: [z.string(), z.string().nullable().optional()],
    returns: z.string(),
  })
  optionalParams(required: string, optional?: string | null) {
    return required;
  }

  /**
   * 缓存函数参数
   */
  @Action({
    description: "缓存函数参数",
    params: [z.string(), z.string()],
    returns: z.string(),
  })
  @Cache({ key: (key: string) => ({ cacheKey: `cache-fn:${key}` }), ttl: 5000 })
  async cacheFn(key: string, value: string) {
    // 模拟慢操作
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return key;
  }

  /**
   * 缓存结果
   */
  @Action({
    description: "缓存结果",
    params: [z.string()],
    returns: z.string(),
  })
  @Cache({
    key: (key: string) => ({ cacheKey: `cache-result:${key}` }),
    ttl: 1000,
  })
  async cacheResultAction(key: string) {
    // 模拟慢操作
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return key;
  }

  /**
   * 默认参数
   */
  @Action({
    description: "默认参数",
    params: [z.string().default("test"), z.number().default(1)],
    returns: z.string(),
  })
  defaultParamAction(param1?: string, param2?: number) {
    return `${param1 || "test"}-${param2 || 1}`;
  }

  /**
   * 默认返回值
   */
  @Action({
    description: "默认返回值",
    params: [],
    returns: z.object({ a: z.string() }).default({ a: "test" }),
  })
  defaultReturnAction() {
    return { a: "test" };
  }

  /**
   * 流式返回
   */
  @Action({
    description: "流式返回数字",
    params: [z.number()],
    returns: z.number(),
    stream: true,
  })
  async *streamNumbers(count: number) {
    for (let i = 0; i < count; i++) {
      yield i;
    }
  }

  /**
   * 返回 unknown 类型
   */
  @Action({
    description: "返回 unknown 类型",
    params: [z.instanceof(RegExp)],
    returns: z.unknown(),
  })
  unknownReturnAction(regex: RegExp) {
    return regex;
  }

  /**
   * 返回 Record 类型
   */
  @Action({
    description: "返回 Record 类型",
    params: [
      z.array(
        z.object({
          cells: z.record(z.string(), z.object({ value: z.string() })),
        })
      ),
    ],
    returns: z.array(
      z.object({
        cells: z.record(z.string(), z.object({ value: z.string() })),
      })
    ),
  })
  recordReturnAction(
    data: Array<{ cells: Record<string, { value: string }> }>
  ) {
    return data;
  }

  /**
   * 请求上下文注入
   */
  @Action({
    description: "请求上下文注入",
    params: [],
    returns: z.string(),
  })
  requestContextAction(ctx: Context) {
    return ctx.req.path;
  }
}

// 导出引擎以便测试使用
export { engine };
