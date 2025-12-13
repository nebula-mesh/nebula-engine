import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Action, ActionPlugin } from "../plugins/action";
import { CachePlugin } from "../plugins/cache";
import { Route, RoutePlugin } from "../plugins/route";
import { Handler } from "./decorators";
import { DuplicateModuleError } from "./errors";
import { Testing } from "./testing";
import { Plugin } from "./types";

describe("MicroserviceEngine", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];

  beforeEach(() => {
    // 每个测试都会创建新的 Factory，使用不同的 key，自动隔离
    const testEngine = Testing.createTestEngine({ plugins: [] });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  describe("Module装饰器", () => {
    it("应该能够使用Module装饰器装饰类", () => {
      @Module("test-module")
      class TestService {}

      const modules = engine.getModules();
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe("test-module");
      expect(modules[0].clazz).toBe(TestService);
    });

    it("应该允许注册同名模块（通过类区分）", () => {
      @Module("test-module")
      class TestService1 {}

      @Module("test-module")
      class TestService2 {}

      // 同名模块应该可以注册，因为它们通过类区分
      const modules = engine.getModules();
      expect(modules).toHaveLength(2);
      expect(modules[0].name).toBe("test-module");
      expect(modules[1].name).toBe("test-module");
      expect(modules[0].clazz).toBe(TestService1);
      expect(modules[1].clazz).toBe(TestService2);
      
      // 可以通过类获取不同的实例
      const instance1 = engine.get(TestService1);
      const instance2 = engine.get(TestService2);
      expect(instance1).not.toBe(instance2);
    });

    it("应该支持模块配置", () => {
      @Module("test-module", {
        routePrefix: "/api",
      })
      class TestService {}

      const modules = engine.getModules();
      expect(modules[0].options.routePrefix).toBe("/api");
    });
  });

  describe("引擎启动", () => {
    it("应该能够启动引擎", async () => {
      const plugin: Plugin = {
        name: "test-plugin",
        onInit: vi.fn(),
        onModuleLoad: vi.fn(),
        onHandlerLoad: vi.fn(),
        onBeforeStart: vi.fn(),
        onAfterStart: vi.fn(),
      };

      // 使用 Testing 创建带插件的引擎
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [plugin],
        });

      @TestModule("test-module")
      class TestService {
        @Handler({ type: "test" })
        getUser() {}
      }

      await testEngine.start();

      expect(plugin.onInit).toHaveBeenCalled();
      expect(plugin.onModuleLoad).toHaveBeenCalled();
      expect(plugin.onHandlerLoad).toHaveBeenCalled();
      expect(plugin.onBeforeStart).toHaveBeenCalled();
      expect(plugin.onAfterStart).toHaveBeenCalled();

      await testEngine.stop();
    });

    it("应该防止重复启动", async () => {
      await engine.start();

      await expect(engine.start()).rejects.toThrow("already started");
    });

    it("应该能够停止引擎", async () => {
      const plugin: Plugin = {
        name: "test-plugin",
        onDestroy: vi.fn(),
      };

      const { engine: testEngine } = Testing.createTestEngine({
        plugins: [plugin],
      });

      await testEngine.start();
      await testEngine.stop();

      expect(plugin.onDestroy).toHaveBeenCalled();
    });
  });

  describe("模块实例管理", () => {
    it("应该能够获取模块实例（单例）", () => {
      @Module("test-module")
      class TestService {}

      const instance1 = engine.get(TestService);
      const instance2 = engine.get(TestService);

      expect(instance1).toBe(instance2); // 应该是同一个实例
    });
  });

  describe("配置管理", () => {
    it("应该能够获取引擎配置", () => {
      expect(engine.options.name).toBe("test-service");
      expect(engine.options.version).toBe("1.0.0");
      expect(engine.options.hostname).toBe("0.0.0.0");
    });

    it("应该使用默认配置", () => {
      const { engine: defaultEngine } = Testing.createTestEngine({
        plugins: [],
        options: {
          name: "default-service",
          version: "1.0.0",
        },
      });

      expect(defaultEngine.options.hostname).toBe("0.0.0.0");
    });

    it("配置应该是冻结的，无法修改", () => {
      expect(() => {
        (engine.options as any).name = "modified";
      }).toThrow();
    });

    it("应该能够获取实际使用的端口", async () => {
      const port = await engine.start();
      expect(port).toBeGreaterThanOrEqual(3000);
      expect(engine.getPort()).toBe(port);
      await engine.stop();
    });

    it("应该使用指定的端口", async () => {
      const requestedPort = 3000;
      const port = await engine.start(requestedPort);
      expect(port).toBe(requestedPort);
      expect(engine.getPort()).toBe(requestedPort);
      await engine.stop();
    });

    it("如果没有指定端口，应该使用随机端口", async () => {
      const port = await engine.start(0);
      expect(port).toBeGreaterThanOrEqual(3000);
      expect(engine.getPort()).toBe(port);
      await engine.stop();
    });
  });

  describe("版本路由", () => {
    it("应该自动注册版本路由", async () => {
      const port = await engine.start();
      const response = await fetch(`http://127.0.0.1:${port}`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toEqual({
        name: "test-service",
        version: "1.0.0",
        status: "running",
      });
      await engine.stop();
    });

    it("应该支持引擎 prefix", async () => {
      const { engine: testEngine } = Testing.createTestEngine({
        plugins: [],
        options: {
          name: "test-service",
          version: "1.0.0",
          prefix: "/api",
        },
      });

      const port = await testEngine.start();
      const response = await fetch(`http://127.0.0.1:${port}/api`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toEqual({
        name: "test-service",
        version: "1.0.0",
        status: "running",
      });
      await testEngine.stop();
    });

    it("如果用户已注册版本路由，应该跳过注册", async () => {
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [new RoutePlugin()],
        });

      @TestModule("test-module")
      class TestService {
        @Route({
          method: "GET",
          path: "/version",
        })
        getVersion() {
          return { custom: "version" };
        }
      }

      const port = await testEngine.start();
      const response = await fetch(`http://127.0.0.1:${port}/version`);
      expect(response.ok).toBe(true);
      // 应该返回用户自定义的版本路由，而不是引擎的版本路由
      const data = await response.json();
      expect(data).toEqual({ custom: "version" });
      await testEngine.stop();
    });
  });

  describe("engine.handler 方法", () => {
    it("应该能够获取并调用 handler（不启动 HTTP 服务器）", async () => {
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [new ActionPlugin()],
        });

      @TestModule("test-module")
      class TestService {
        @Action({
          params: [z.string(), z.number()],
        })
        add(a: string, b: number): { result: number } {
          return { result: Number(a) + b };
        }
      }

      // 获取 handler 并调用（类型自动推导，无需显式指定泛型）
      const addHandler = testEngine.handler(TestService, "add");
      const result = await addHandler("10", 20);

      expect(result).toEqual({ result: 30 });
    });

    it("应该能够调用带包装的 handler（如缓存）", async () => {
      const { Cache } = await import("../plugins/cache");
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [new ActionPlugin(), new CachePlugin()],
        });

      let callCount = 0;

      @TestModule("test-module")
      class TestService {
        @Action({
          params: [z.string()],
        })
        @Cache({ ttl: 1000 })
        getValue(key: string): { value: string; count: number } {
          callCount++;
          return { value: key, count: callCount };
        }
      }

      // 获取 handler（类型自动推导）
      const getValueHandler = testEngine.handler(TestService, "getValue");

      // 第一次调用，应该执行方法
      const result1 = await getValueHandler("test");
      expect(result1.count).toBe(1);

      // 第二次调用，应该从缓存返回，callCount 不应该增加
      const result2 = await getValueHandler("test");
      expect(result2.count).toBe(1); // 缓存命中，count 不变
    });

    it("应该在没有找到 handler 时抛出错误", async () => {
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [new ActionPlugin()],
        });

      @TestModule("test-module")
      class TestService {
        @Action({
          params: [],
        })
        existingMethod(): { ok: boolean } {
          return { ok: true };
        }
      }

      const handler = testEngine.handler(
        TestService,
        "nonExistentMethod" as any
      );
      await expect(handler()).rejects.toThrow(
        "Handler nonExistentMethod not found"
      );
    });

    it("应该能够推导 handler 参数类型和返回值类型", async () => {
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [new ActionPlugin()],
        });

      @TestModule("test-module")
      class TestService {
        @Action({
          params: [z.string(), z.number()],
        })
        add(a: string, b: number): { result: number } {
          return { result: Number(a) + b };
        }

        @Action({
          params: [],
        })
        getValue(): Promise<{ value: string }> {
          return Promise.resolve({ value: "test" });
        }
      }

      // 类型推导测试：获取 handler 并调用（类型自动推导）
      const addHandler = testEngine.handler(TestService, "add");
      const result1 = await addHandler("10", 20); // 只需要传递参数
      // 返回值类型应该被推导为 { result: number }
      expect(result1).toEqual({ result: 30 });

      // 链式调用方式
      const result1b = await testEngine.handler(TestService, "add")("10", 20);
      expect(result1b).toEqual({ result: 30 });

      // 测试异步方法返回值的类型推导
      const getValueHandler = testEngine.handler(TestService, "getValue");
      const result2 = await getValueHandler();
      // 返回值类型应该被推导为 { value: string }（自动解包 Promise）
      expect(result2).toEqual({ value: "test" });
    });
  });

  describe("engine.request 方法", () => {
    it("应该能够使用 request 方法调用路由（不启动 HTTP 服务器）", async () => {
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [new RoutePlugin()],
        });

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/test" })
        test(): { ok: boolean } {
          return { ok: true };
        }
      }

      // 不启动 HTTP 服务器，使用 request 方法调用路由
      const response = await testEngine.request("/test");

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toEqual({ ok: true });
    });

    it("应该能够使用 Request 对象调用路由", async () => {
      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [new RoutePlugin()],
        });

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/test", method: "POST" })
        test(ctx: any): { method: string } {
          return { method: ctx.req.method };
        }
      }

      const request = new Request("http://localhost/test", {
        method: "POST",
      });

      const response = await testEngine.request(request);
      expect(response.ok).toBe(true);
      const data = (await response.json()) as { method: string };
      expect(data.method).toBe("POST");
    });

    it("应该能够执行中间件", async () => {
      const middleware = vi.fn(async (ctx: any, next: any) => {
        ctx.header("X-Custom-Header", "test-value");
        await next();
      });

      const { engine: testEngine, Module: TestModule } =
        Testing.createTestEngine({
          plugins: [
            new RoutePlugin({
              globalMiddlewares: [middleware],
            }),
          ],
        });

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/test" })
        test(): { ok: boolean } {
          return { ok: true };
        }
      }

      const response = await testEngine.request("/test");

      expect(middleware).toHaveBeenCalled();
      // Hono 的中间件设置的 header 会在 Response 中
      expect(response.headers.get("X-Custom-Header")).toBe("test-value");
    });
  });
});
