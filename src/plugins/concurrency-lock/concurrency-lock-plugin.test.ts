import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Testing } from "../../core/testing";
import { Action, ActionPlugin } from "../action";
import {
  ConcurrencyLock,
  ConcurrencyLockPlugin,
  MemoryLockAdapter,
  RedisLockAdapter,
} from "./index";

describe("ConcurrencyLockPlugin 装饰器与集成", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];

  beforeEach(() => {
    const testEngine = Testing.createTestEngine({
      plugins: [new ActionPlugin(), new ConcurrencyLockPlugin()],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  afterEach(async () => {
    if (engine) {
      await engine.stop();
    }
  });

  it("应该支持装饰器并正确生成锁", async () => {
    @Module("test-service")
    class TestService {
      @ConcurrencyLock({ timeout: 5000 })
      @Action({ params: [z.string()] })
      async process(id: string): Promise<{ id: string }> {
        return { id };
      }
    }

    const handler = engine.handler(TestService, "process");
    const result = await handler("123");
    expect(result).toEqual({ id: "123" });
  });

  it("应该支持自定义 key 函数", async () => {
    @Module("test-service")
    class TestService {
      @ConcurrencyLock({
        key: (id: string, type: string) => ({ id }),
        timeout: 5000,
      })
      @Action({ params: [z.string(), z.string()] })
      async process(
        id: string,
        type: string,
      ): Promise<{ id: string; type: string }> {
        return { id, type };
      }
    }

    const handler = engine.handler(TestService, "process");
    const result = await handler("123", "A");
    expect(result).toEqual({ id: "123", type: "A" });
  });

  it("应该支持复杂对象和数组参数", async () => {
    const UserSchema = z.object({
      id: z.string(),
      name: z.string(),
    });

    @Module("test-service")
    class TestService {
      @ConcurrencyLock({ timeout: 5000 })
      @Action({ params: [UserSchema, z.array(z.string())] })
      async createUser(
        user: z.infer<typeof UserSchema>,
        tags: string[],
      ): Promise<{ user: z.infer<typeof UserSchema>; tags: string[] }> {
        return { user, tags };
      }
    }

    const handler = engine.handler(TestService, "createUser");
    const result = await handler({ id: "123", name: "Alice" }, [
      "admin",
      "user",
    ]);
    expect(result).toEqual({
      user: { id: "123", name: "Alice" },
      tags: ["admin", "user"],
    });
  });

  it("并发请求应该顺序执行", async () => {
    let executionCount = 0;

    @Module("test-service")
    class TestService {
      @ConcurrencyLock({ timeout: 5000 })
      @Action({ params: [z.string()] })
      async process(id: string): Promise<{ count: number }> {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { count: executionCount };
      }
    }

    const handler = engine.handler(TestService, "process");
    const [r1, r2] = await Promise.all([handler("123"), handler("123")]);
    expect(r1.count).toBe(1);
    expect(r2.count).toBe(2);
    expect(executionCount).toBe(2);
  });

  it("不同参数应该并行执行", async () => {
    let executionCount = 0;

    @Module("test-service")
    class TestService {
      @ConcurrencyLock({ timeout: 5000 })
      @Action({ params: [z.string()] })
      async process(id: string): Promise<{ count: number }> {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { count: executionCount };
      }
    }

    const handler = engine.handler(TestService, "process");
    await Promise.all([handler("123"), handler("456")]);
    expect(executionCount).toBe(2);
  });

  it("锁超时后应该自动释放", async () => {
    let executionCount = 0;

    @Module("test-service")
    class TestService {
      @ConcurrencyLock({ timeout: 100 })
      @Action({ params: [z.string()] })
      async process(id: string): Promise<{ count: number }> {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { count: executionCount };
      }
    }

    const handler = engine.handler(TestService, "process");
    await handler("123");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const result = await handler("123");
    expect(result.count).toBe(2);
  });
});

describe("MemoryLockAdapter", () => {
  let adapter: MemoryLockAdapter;

  beforeEach(() => {
    adapter = new MemoryLockAdapter();
  });

  afterEach(() => {
    adapter.clear();
  });

  it("应该能够获取和释放锁", async () => {
    const acquired = await adapter.acquire("test-key", 5000);
    expect(acquired).toBe(true);

    const released = await adapter.release("test-key");
    expect(released).toBe(true);

    const acquired2 = await adapter.acquire("test-key", 5000);
    expect(acquired2).toBe(true);
  });

  it("应该正确检测锁状态", async () => {
    expect(await adapter.isLocked("test-key")).toBe(false);

    await adapter.acquire("test-key", 5000);
    expect(await adapter.isLocked("test-key")).toBe(true);

    await adapter.release("test-key");
    expect(await adapter.isLocked("test-key")).toBe(false);
  });

  it("过期锁应该自动清理", async () => {
    await adapter.acquire("test-key", 100);
    expect(await adapter.isLocked("test-key")).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await adapter.isLocked("test-key")).toBe(false);
  });

  it("waitForUnlock 应该等待锁释放", async () => {
    await adapter.acquire("test-key", 5000);

    const released = adapter.waitForUnlock("test-key", 5000, 5000);
    await adapter.release("test-key");

    const result = await released;
    expect(result).toBe(true);
  });

  it("waitForUnlock 应该处理过期锁", async () => {
    await adapter.acquire("test-key", 100);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = await adapter.waitForUnlock("test-key", 5000, 100);
    expect(result).toBe(true);
  });

  it("waitForUnlock 超时后应该兜底返回 true", async () => {
    const result = await adapter.waitForUnlock("non-existent-key", 100, 100);
    expect(result).toBe(true);
  });
});

describe("RedisLockAdapter", () => {
  let adapter: RedisLockAdapter;
  let mockRedis: {
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    ttl: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRedis = {
      set: vi.fn().mockResolvedValue("OK"),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(5000),
      eval: vi.fn().mockResolvedValue(1),
    };

    adapter = new RedisLockAdapter({ client: mockRedis as any });
  });

  it("应该能够获取和释放锁", async () => {
    const acquired = await adapter.acquire("redis-key", 5000);
    expect(acquired).toBe(true);
    expect(mockRedis.set).toHaveBeenCalled();

    const callArgs = mockRedis.set.mock.calls[0];
    expect(callArgs[0]).toBe("concurrency:redis-key");
    expect(callArgs[2]).toBe("NX");
    expect(callArgs[3]).toBe(5); // 5000ms = 5s

    const released = await adapter.release("redis-key");
    expect(released).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it("应该正确检测锁状态", async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await adapter.isLocked("redis-key")).toBe(false);

    const futureExpiry = JSON.stringify({
      expiresAt: Date.now() + 10000,
      owner: "test",
    });
    mockRedis.get.mockResolvedValue(futureExpiry);
    expect(await adapter.isLocked("redis-key")).toBe(true);
  });

  it("过期锁应该自动清理", async () => {
    mockRedis.ttl.mockResolvedValue(-2);
    await adapter.acquire("redis-key", 100);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const isLocked = await adapter.isLocked("redis-key");
    expect(isLocked).toBe(false);
  });

  it("waitForUnlock 应该等待锁释放", async () => {
    let resolveGet: (value: string | null) => void;
    mockRedis.get.mockImplementation(() => {
      return new Promise((resolve) => {
        resolveGet = resolve;
      });
    });

    const waitPromise = adapter.waitForUnlock("redis-key", 5000, 5000);

    setTimeout(() => resolveGet!(null), 50);

    const result = await waitPromise;
    expect(result).toBe(true);
  });

  it("waitForUnlock 应该处理过期锁", async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await adapter.waitForUnlock("redis-key", 100, 100);
    expect(result).toBe(true);
  });

  it("waitForUnlock 超时后应该兜底返回 true", async () => {
    mockRedis.get.mockResolvedValue("locked");

    const result = await adapter.waitForUnlock("redis-key", 100, 100);
    expect(result).toBe(true);
  });
});
