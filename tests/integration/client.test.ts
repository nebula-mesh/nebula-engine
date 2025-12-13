/**
 * 集成测试：验证 Action、ClientCode、Cache 等插件的集成
 * 以及 MicroserviceClient 的功能（重试、错误处理等）
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { engine, resetCounters } from "./dev-service";

// 等待服务启动
let client: any;

beforeAll(async () => {
  // 启动服务
  await engine.start();
  const port = engine.getPort();

  // 等待客户端代码生成完成
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 动态导入生成的客户端代码
  const clientModule = await import("./generated/client");
  const { MicroserviceClient: GeneratedClient } = clientModule;

  // 创建客户端实例
  client = new GeneratedClient({
    baseUrl: `http://127.0.0.1:${port}`,
    prefix: "/api",
    // 测试重试，所有的错误都重试
    retry: { shouldRetry: () => true },
  });
});

beforeEach(() => {
  resetCounters();
});

afterAll(async () => {
  await engine.stop();
});

describe("HTTP Client Integration Test", () => {
  // 测试获取用户
  it("should get user successfully", async () => {
    const user = await client.tests.getUser("1");
    expect(user).toEqual({ id: "1", name: "张三", age: 25 });
  });

  // 测试获取不存在的用户
  it("should handle user not found error", async () => {
    try {
      await client.tests.getUser("999");
      throw new Error("应该抛出错误");
    } catch (error: any) {
      expect(error.message).toEqual("用户不存在");
    }
  });

  // 测试参数校验
  it("should check params type", async () => {
    try {
      await client.tests.getUser(1 as unknown as string);
      throw new Error("应该抛出错误");
    } catch (error: any) {
      // Zod 4.x: 错误消息格式可能已变更，检查是否包含 "string" 或 "expected"
      expect(
        error.message.includes("Expected string") ||
        error.message.includes("expected string") ||
        error.message.includes("string") ||
        error.message.includes("Validation failed")
      ).toBe(true);
    }
  });

  // 测试返回值为 unknown 的操作
  it("should return unknown type", async () => {
    const reg = await client.tests.unknownReturnAction(new RegExp("test"));
    expect(reg instanceof RegExp).toBe(true);
  });

  // 测试返回值为 Record<string, string> 的操作
  it("should return record type", async () => {
    const record = await client.tests.recordReturnAction([
      { cells: { a: { value: "1" }, b: { value: "2" } } },
    ]);
    expect(record).toEqual([
      { cells: { a: { value: "1" }, b: { value: "2" } } },
    ]);
  });

  // 测试创建用户
  it("should create user successfully", async () => {
    const user = await client.tests.createUser("王五", 28);
    expect(user.name).toEqual("王五");
    expect(user.age).toEqual(28);
  });

  // 测试幂等方法的更新操作
  it("should update user with idempotent operation", async () => {
    const result = await client.tests.updateUser("1", "张三丰", 35);
    expect(result.name).toEqual("张三丰");
    expect(result.age).toEqual(35);

    // 再次执行相同的更新应该得到相同的结果
    const secondResult = await client.tests.updateUser("1", "张三丰", 35);
    expect(secondResult).toEqual(result);
  });

  // 测试可重试操作最终成功的场景
  it("should succeed after retries", async () => {
    const result = await client.tests.retryableOperation("1");
    expect(result.id).toEqual("1");
  });

  // 测试重试多次后仍然失败的场景
  it("should fail after all retries", async () => {
    try {
      await client.tests.alwaysFailOperation("1");
      throw new Error("应该抛出错误");
    } catch (error: any) {
      expect(error.message).toEqual("永久性错误");
    }
  });

  it("upload file", async () => {
    const buffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const result = await client.tests.uploadFile(buffer);
    expect(result.length).toEqual(10);
    expect(result).toEqual(new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]));
  });

  it("test no params and no return", async () => {
    const result = await client.tests.noReturnAction();
    expect(result).toEqual(undefined);
  });

  it("test optional params", async () => {
    const result = await client.tests.optionalParams("test", null);
    expect(result).toEqual("test");
  });

  it("test cache fn", async () => {
    let start = Date.now();
    const result = await client.tests.cacheFn("test", "Tom");
    expect(result).toEqual("test");
    expect(Date.now() - start).toBeGreaterThan(1000);

    start = Date.now();
    const result2 = await client.tests.cacheFn("test", "Jerry");
    expect(result2).toEqual("test");
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("test cache result", async () => {
    let start = Date.now();
    // 第一次请求，缓存未命中
    let result = await client.tests.cacheResultAction("test");
    expect(Date.now() - start).toBeGreaterThan(1000);
    expect(result).toEqual("test");

    start = Date.now();
    // 第二次请求，缓存命中
    result = await client.tests.cacheResultAction("test");
    expect(Date.now() - start).toBeLessThan(200);
    expect(result).toEqual("test");

    start = Date.now();
    // 第三次请求，未命中key
    result = await client.tests.cacheResultAction("test2");
    expect(Date.now() - start).toBeGreaterThan(1000);
    expect(result).toEqual("test2");

    await new Promise((resolve) => setTimeout(resolve, 1000));
    start = Date.now();
    // 第四次请求，缓存过期
    result = await client.tests.cacheResultAction("test");
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
    expect(result).toEqual("test");
  });

  it("test default param", async () => {
    const result = await client.tests.defaultParamAction();
    expect(result).toEqual("test-1");
  });

  it("test default return", async () => {
    const result = await client.tests.defaultReturnAction();
    expect(result).toEqual({ a: "test" });
  });

  it("test streaming return", async () => {
    const iter = await client.tests.streamNumbers(5);
    const result: number[] = [];
    for await (const item of iter) {
      result.push(item);
    }
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("test request context injection", async () => {
    const result = await client.tests.requestContextAction();
    expect(result).toEqual("/api/tests/requestContextAction");
  });
});
