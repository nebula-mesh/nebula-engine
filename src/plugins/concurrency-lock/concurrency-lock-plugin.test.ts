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

describe("ConcurrencyLockPlugin", () => {
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

  describe("装饰器基本功能", () => {
    it("应该能够使用 ConcurrencyLock 装饰器装饰方法", async () => {
      const results: string[] = [];

      @Module("test-service")
      class TestService {
        @ConcurrencyLock({
          timeout: 5000,
        })
        @Action({
          params: [z.string()],
        })
        async processData(id: string): Promise<{ id: string; result: string }> {
          results.push(`processing ${id}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { id, result: "done" };
        }
      }

      const handler = engine.handler(TestService, "processData");
      const result = await handler("123");

      expect(result).toEqual({ id: "123", result: "done" });
      expect(results).toContain("processing 123");
    });

    it("应该支持自定义 key 函数", async () => {
      @Module("test-service")
      class TestService {
        @ConcurrencyLock({
          key: (id: string, type: string) => ({ id }),
          timeout: 5000,
        })
        @Action({
          params: [z.string(), z.string()],
        })
        async processData(
          id: string,
          type: string,
        ): Promise<{ id: string; type: string }> {
          return { id, type };
        }
      }

      const handler = engine.handler(TestService, "processData");
      const result = await handler("123", "A");

      expect(result).toEqual({ id: "123", type: "A" });
    });
  });

  describe("并发锁功能", () => {
    it("第一个请求应该成功获取锁", async () => {
      @Module("test-service")
      class TestService {
        @ConcurrencyLock({
          timeout: 2000,
        })
        @Action({
          params: [z.string()],
        })
        async processData(id: string): Promise<string> {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return "done";
        }
      }

      const handler = engine.handler(TestService, "processData");
      const result = await handler("123");

      expect(result).toBe("done");
    });

    it("并发请求应该等待锁释放", async () => {
      let executionCount = 0;

      @Module("test-service")
      class TestService {
        @ConcurrencyLock({
          timeout: 5000,
        })
        @Action({
          params: [z.string()],
        })
        async processData(id: string): Promise<string> {
          executionCount++;
          await new Promise((resolve) => setTimeout(resolve, 150));
          return "done";
        }
      }

      const handler = engine.handler(TestService, "processData");

      const p1 = handler("test-id");
      const p2 = (async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return handler("test-id");
      })();

      const [result1, result2] = await Promise.all([p1, p2]);

      expect(result1).toBe("done");
      expect(result2).toBe("done");
      // 两个请求都会执行（第二个在锁释放后执行）
      expect(executionCount).toBe(2);
    });

    it("锁超时后应该自动释放", async () => {
      const executionCount = vi.fn();

      @Module("test-service")
      class TestService {
        @ConcurrencyLock({
          timeout: 100,
        })
        @Action({
          params: [z.string()],
        })
        async processData(id: string): Promise<string> {
          executionCount();
          return "done";
        }
      }

      const handler = engine.handler(TestService, "processData");

      await handler("123");
      expect(executionCount).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 150));

      await handler("123");
      expect(executionCount).toHaveBeenCalledTimes(2);
    });
  });

  describe("不同参数的锁隔离", () => {
    it("不同参数应该使用不同的锁", async () => {
      @Module("test-service")
      class TestService {
        @ConcurrencyLock({
          timeout: 5000,
        })
        @Action({
          params: [z.string()],
        })
        async processData(id: string): Promise<string> {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return id;
        }
      }

      const handler = engine.handler(TestService, "processData");

      const [result1, result2] = await Promise.all([
        handler("id-1"),
        handler("id-2"),
      ]);

      expect(result1).toBe("id-1");
      expect(result2).toBe("id-2");
    });

    it("相同参数应该使用相同的锁", async () => {
      const executionOrder: number[] = [];
      let firstComplete = false;

      @Module("test-service")
      class TestService {
        @ConcurrencyLock({
          timeout: 5000,
        })
        @Action({
          params: [z.string()],
        })
        async processData(id: string): Promise<string> {
          if (!firstComplete) {
            executionOrder.push(1);
            await new Promise((resolve) => setTimeout(resolve, 100));
            executionOrder.push(2);
            firstComplete = true;
            return "first";
          } else {
            executionOrder.push(3);
            return "second";
          }
        }
      }

      const handler = engine.handler(TestService, "processData");

      const [result1, result2] = await Promise.all([
        (handler as any)("same-id"),
        (async () => {
          while (!firstComplete) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          return (handler as any)("same-id");
        })(),
      ]);

      expect(result1).toBe("first");
      expect(result2).toBe("second");
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });
});

describe("MemoryLockAdapter", () => {
  let adapter: MemoryLockAdapter;

  beforeEach(() => {
    adapter = new MemoryLockAdapter();
  });

  afterEach(async () => {
    await adapter.clear();
  });

  it("应该能够获取和释放锁", async () => {
    const key = "test-lock-1";

    const acquired1 = await adapter.acquire(key, 5000);
    expect(acquired1).toBe(true);

    const acquired2 = await adapter.acquire(key, 5000);
    expect(acquired2).toBe(false);

    const released = await adapter.release(key);
    expect(released).toBe(true);

    const acquired3 = await adapter.acquire(key, 5000);
    expect(acquired3).toBe(true);
  });

  it("应该正确检测锁状态", async () => {
    const key = "test-lock-2";

    expect(await adapter.isLocked(key)).toBe(false);

    await adapter.acquire(key, 5000);
    expect(await adapter.isLocked(key)).toBe(true);

    await adapter.release(key);
    expect(await adapter.isLocked(key)).toBe(false);
  });

  it("过期锁应该自动清理", async () => {
    const key = "test-lock-3";

    await adapter.acquire(key, 10);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await adapter.isExpired(key)).toBe(true);
    expect(await adapter.isLocked(key)).toBe(false);
  });

  it("waitForUnlock 应该等待锁释放", async () => {
    const key = "test-lock-4";

    await adapter.acquire(key, 5000);

    const releasePromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await adapter.release(key);
    })();

    const result = await adapter.waitForUnlock(key, 5000, 5000);

    expect(result).toBe(true);
    await releasePromise;
  });

  it("waitForUnlock 应该处理过期锁", async () => {
    const key = "test-lock-5";

    await adapter.acquire(key, 10);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await adapter.waitForUnlock(key, 5000, 5000);

    expect(result).toBe(true);
    expect(await adapter.isLocked(key)).toBe(true);

    await adapter.release(key);
  });

  it("waitForUnlock 超时后应该兜底返回 true", async () => {
    const key = "test-lock-6";

    await adapter.acquire(key, 5000);

    const result = await adapter.waitForUnlock(key, 50, 5000);

    expect(result).toBe(true);
  });
});

describe("RedisLockAdapter", () => {
  let adapter: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      storage: new Map<string, any>(),
      async get(key: string): Promise<string | null> {
        const item = this.storage.get(key);
        if (!item) {
          return null;
        }
        if (item.expiresAt && item.expiresAt <= Date.now()) {
          this.storage.delete(key);
          return null;
        }
        return item.value;
      },
      async set(
        key: string,
        value: string,
        expiryMode?: string,
        time?: number,
      ): Promise<string | null> {
        // NX 模式：只在 key 不存在时设置
        if (expiryMode === "NX") {
          if (this.storage.has(key)) {
            return null;
          }
        }
        const expiresAt =
          expiryMode === "EX" && time ? Date.now() + time * 1000 : undefined;
        this.storage.set(key, { value, expiresAt });
        return "OK";
      },
      async del(key: string): Promise<number> {
        return this.storage.delete(key) ? 1 : 0;
      },
      async keys(pattern: string): Promise<string[]> {
        const prefix = pattern.replace("*", "");
        const keys = Array.from(this.storage.keys()) as string[];
        return keys.filter((key) => key.startsWith(prefix));
      },
      async eval(
        script: string,
        numberOfKeys: number,
        ...keysAndArgs: (string | number)[]
      ): Promise<any> {
        const key = keysAndArgs[0] as string;
        const val = this.storage.get(key);
        if (val) {
          this.storage.delete(key);
          return 1;
        }
        return 0;
      },
    };

    adapter = new RedisLockAdapter({ client: mockClient });
  });

  afterEach(async () => {
    if (mockClient) {
      mockClient.storage.clear();
    }
  });

  it("应该能够获取和释放锁", async () => {
    const key = "test-lock-1";

    const acquired1 = await adapter.acquire(key, 5000);
    expect(acquired1).toBe(true);

    const acquired2 = await adapter.acquire(key, 5000);
    expect(acquired2).toBe(false);

    const released = await adapter.release(key);
    expect(released).toBe(true);

    const acquired3 = await adapter.acquire(key, 5000);
    expect(acquired3).toBe(true);
  });

  it("应该正确检测锁状态", async () => {
    const key = "test-lock-2";

    expect(await adapter.isLocked(key)).toBe(false);

    await adapter.acquire(key, 5000);
    expect(await adapter.isLocked(key)).toBe(true);

    await adapter.release(key);
    expect(await adapter.isLocked(key)).toBe(false);
  });

  it("过期锁应该自动清理", async () => {
    const key = "test-lock-3";

    await adapter.acquire(key, 10);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await adapter.isExpired(key)).toBe(true);
    expect(await adapter.isLocked(key)).toBe(false);
  });

  it("waitForUnlock 应该等待锁释放", async () => {
    const key = "test-lock-4";

    await adapter.acquire(key, 5000);

    const releasePromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await adapter.release(key);
    })();

    const result = await adapter.waitForUnlock(key, 5000, 5000);

    expect(result).toBe(true);
    await releasePromise;
  });

  it("waitForUnlock 应该处理过期锁", async () => {
    const key = "test-lock-5";

    await adapter.acquire(key, 10);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await adapter.waitForUnlock(key, 5000, 5000);

    expect(result).toBe(true);
    expect(await adapter.isLocked(key)).toBe(true);

    await adapter.release(key);
  });

  it("waitForUnlock 超时后应该兜底返回 true", async () => {
    const key = "test-lock-6";

    await adapter.acquire(key, 5000);

    const result = await adapter.waitForUnlock(key, 50, 5000);

    expect(result).toBe(true);
  });
});
