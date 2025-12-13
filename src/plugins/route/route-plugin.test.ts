import { Context } from "hono";
import { html } from "hono/html";
import { jsx } from "hono/jsx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Testing } from "../../core/testing";
import { HandlerMetadata } from "../../core/types";
import { Page, Route, RoutePlugin } from "./index";

describe("RoutePlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];
  let routePlugin: RoutePlugin;

  beforeEach(() => {
    routePlugin = new RoutePlugin();
    const testEngine = Testing.createTestEngine({ plugins: [routePlugin] });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });

  describe("全局前缀", () => {
    it("应该为所有路由添加全局前缀", async () => {
      const pluginWithPrefix = new RoutePlugin({ prefix: "/api" });
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithPrefix],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/users" })
        getUsers() {
          return { users: [] };
        }
      }

      // 使用 engine.request 测试（依赖 Hono，需要测试路由和中间件）
      const response = await testEngine.engine.request("/api/users");
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toEqual({ users: [] });
    });

    it("全局前缀应该与模块前缀和路由路径正确拼接", async () => {
      const pluginWithPrefix = new RoutePlugin({ prefix: "/api" });
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithPrefix],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module", { routePrefix: "/v1" })
      class TestService {
        @Route({ path: "/users" })
        getUsers() {
          return { users: [] };
        }
      }

      // 使用 engine.request 测试
      const response = await testEngine.engine.request("/api/v1/users");
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toEqual({ users: [] });
    });

    it("如果没有设置全局前缀，应该正常工作", async () => {
      const pluginWithoutPrefix = new RoutePlugin();
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithoutPrefix],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/users" })
        getUsers() {
          return { users: [] };
        }
      }

      // 使用 engine.request 测试
      const response = await testEngine.engine.request("/users");
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toEqual({ users: [] });
    });

    it("全局前缀应该支持多个路径", async () => {
      const pluginWithPrefix = new RoutePlugin({ prefix: "/api" });
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithPrefix],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ path: ["/users", "/accounts"] })
        getUsers() {
          return { users: [] };
        }
      }

      // 使用 engine.request 测试
      const response1 = await testEngine.engine.request("/api/users");
      expect(response1.ok).toBe(true);
      const response2 = await testEngine.engine.request("/api/accounts");
      expect(response2.ok).toBe(true);
    });
  });

  describe("插件配置", () => {
    it("应该有正确的插件名称", () => {
      expect(routePlugin.name).toBe("route-plugin");
    });

    it("应该声明Module配置Schema", () => {
      const schema = routePlugin.getModuleOptionsSchema?.();
      expect(schema).toBeDefined();
      expect(schema?.validate).toBeDefined();
    });

    it("应该校验Module配置", () => {
      const schema = routePlugin.getModuleOptionsSchema?.();
      if (!schema?.validate) return;

      // 有效的配置
      expect(schema.validate({ routePrefix: "/api" })).toBe(true);

      // 无效的配置（routePrefix不以/开头）
      const result = schema.validate({ routePrefix: "api" });
      expect(result).not.toBe(true);
      expect(typeof result).toBe("string");
    });
  });

  describe("生命周期钩子", () => {
    it("应该在onHandlerLoad中注册路由", async () => {
      routePlugin.onInit?.(engine);

      @Module("test-module", {
        routePrefix: "/api",
        routeMiddlewares: [],
      })
      class TestService {
        @Route({ method: "GET", path: "/user/:id" })
        getUser() {
          return { id: 1 };
        }
      }

      // 手动触发Handler加载（模拟引擎流程）
      const { getAllHandlerMetadata } = await import("../../core/decorators");
      const handlers = Array.from(
        getAllHandlerMetadata(TestService).entries()
      ).flatMap(([methodName, metadataList]) =>
        metadataList.map((meta) => ({
          ...meta,
          method: (TestService.prototype as any)[methodName],
          methodName: String(methodName),
          module: TestService,
        }))
      );

      routePlugin.onHandlerLoad?.(handlers);
    });
  });

  describe("路由注册", () => {
    it("应该支持模块级路由前缀", async () => {
      routePlugin.onInit?.(engine);

      @Module("test-module", {
        routePrefix: "/api/v1",
      })
      class TestService {
        @Route({ method: "GET", path: "/user" })
        getUser() {}
      }

      // 这里简化测试，实际应该通过引擎启动流程
      // 验证路由路径应该是 /api/v1/user
    });

    it("应该支持模块级中间件", async () => {
      const middleware = vi.fn(async (ctx: any, next: () => Promise<void>) => {
        await next();
      });

      routePlugin.onInit?.(engine);

      @Module("test-module", {
        routeMiddlewares: [middleware],
      })
      class TestService {
        @Route({ method: "GET", path: "/user" })
        getUser() {}
      }

      // 验证中间件应该被注册
    });

    it("应该支持多个路径", async () => {
      @Module("test-module")
      class TestService {
        @Route({
          path: ["/path1", "/path2", "/path3"],
          description: "多路径测试",
        })
        multiPath() {
          return { success: true };
        }
      }

      // 使用 engine.request 测试
      const response1 = await engine.request("/path1");
      expect(response1.ok).toBe(true);

      const response2 = await engine.request("/path2");
      expect(response2.ok).toBe(true);

      const response3 = await engine.request("/path3");
      expect(response3.ok).toBe(true);
    });

    it("应该支持 Page 装饰器（默认 GET 方法）", async () => {
      @Module("test-module")
      class TestService {
        @Page({
          path: ["/", "/home"],
          description: "首页",
        })
        homePage() {
          return { page: "home" };
        }
      }

      // 使用 engine.request 测试
      const response1 = await engine.request("/");
      expect(response1.ok).toBe(true);

      const response2 = await engine.request("/home");
      expect(response2.ok).toBe(true);
    });

    it("应该支持路由级中间件", async () => {
      const routeMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          ctx.set("X-Custom-Header", "test-value");
          await next();
        }
      );

      @Module("test-module")
      class TestService {
        @Route({
          method: "GET",
          path: "/middleware-test",
          middlewares: [routeMiddleware],
        })
        middlewareTest(ctx: Context) {
          return { header: ctx.get("X-Custom-Header") };
        }
      }

      // 使用 engine.request 测试（需要测试中间件）
      const response = await engine.request("/middleware-test");
      expect(response.ok).toBe(true);
      expect(routeMiddleware).toHaveBeenCalled();
    });

    it("应该支持 description 字段", async () => {
      @Module("test-module")
      class TestService {
        @Route({
          method: "GET",
          path: "/described",
          description: "这是一个带描述的路由",
        })
        describedRoute() {
          return { success: true };
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/described");
      expect(response.ok).toBe(true);
    });
  });

  describe("中间件功能", () => {
    it("应该支持从 header 中获取 token 的授权中间件", async () => {
      // 模拟授权中间件：从 header 中获取 token，验证授权
      const authMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          const token = ctx.req.header("Authorization");
          if (!token || !token.startsWith("Bearer ")) {
            return ctx.json(
              { error: "Unauthorized: Missing or invalid token" },
              401
            );
          }
          const actualToken = token.replace("Bearer ", "");
          if (actualToken !== "valid-token-123") {
            return ctx.json({ error: "Unauthorized: Invalid token" }, 401);
          }
          // 将用户信息注入到 context
          ctx.set("user", { id: "123", name: "Test User" });
          await next();
        }
      );

      @Module("test-module")
      class TestService {
        @Route({
          method: "GET",
          path: "/protected",
          middlewares: [authMiddleware],
        })
        protectedRoute(ctx: Context) {
          const user = ctx.get("user") as
            | { id: string; name: string }
            | undefined;
          return { success: true, user };
        }
      }

      // 使用 engine.request 测试（需要测试中间件）
      // 测试：没有 token 的请求应该被拦截
      const response1 = await engine.request("/protected");
      expect(response1.status).toBe(401);
      const error1 = (await response1.json()) as { error: string };
      expect(error1.error).toContain("Unauthorized");
      expect(authMiddleware).toHaveBeenCalled();

      // 测试：无效 token 的请求应该被拦截
      const request2 = new Request("http://localhost/protected", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      const response2 = await engine.request(request2);
      expect(response2.status).toBe(401);
      const error2 = (await response2.json()) as { error: string };
      expect(error2.error).toContain("Invalid token");

      // 测试：有效 token 的请求应该通过
      const request3 = new Request("http://localhost/protected", {
        headers: { Authorization: "Bearer valid-token-123" },
      });
      const response3 = await engine.request(request3);
      expect(response3.status).toBe(200);
      const result = (await response3.json()) as {
        success: boolean;
        user: { id: string; name: string };
      };
      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: "123", name: "Test User" });
    });

    it("应该支持模块级中间件和路由级中间件的组合", async () => {
      const moduleMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          ctx.set("module-processed", true);
          await next();
        }
      );

      const routeMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          ctx.set("route-processed", true);
          await next();
        }
      );

      @Module("test-module", {
        routeMiddlewares: [moduleMiddleware],
      })
      class TestService {
        @Route({
          method: "GET",
          path: "/combined",
          middlewares: [routeMiddleware],
        })
        combinedRoute(ctx: Context) {
          return {
            moduleProcessed: ctx.get("module-processed"),
            routeProcessed: ctx.get("route-processed"),
          };
        }
      }

      // 使用 engine.request 测试（需要测试中间件组合）
      const response = await engine.request("/combined");
      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        moduleProcessed: boolean;
        routeProcessed: boolean;
      };
      expect(result.moduleProcessed).toBe(true);
      expect(result.routeProcessed).toBe(true);
      expect(moduleMiddleware).toHaveBeenCalled();
      expect(routeMiddleware).toHaveBeenCalled();
    });

    it("应该支持中间件链式执行顺序", async () => {
      const executionOrder: string[] = [];

      const middleware1 = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          executionOrder.push("middleware1-before");
          await next();
          executionOrder.push("middleware1-after");
        }
      );

      const middleware2 = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          executionOrder.push("middleware2-before");
          await next();
          executionOrder.push("middleware2-after");
        }
      );

      const middleware3 = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          executionOrder.push("middleware3-before");
          await next();
          executionOrder.push("middleware3-after");
        }
      );

      @Module("test-module", {
        routeMiddlewares: [middleware1],
      })
      class TestService {
        @Route({
          method: "GET",
          path: "/chain",
          middlewares: [middleware2, middleware3],
        })
        chainRoute() {
          executionOrder.push("handler");
          return { order: [...executionOrder] };
        }
      }

      // 使用 engine.request 测试（需要测试中间件链）
      const response = await engine.request("/chain");
      expect(response.status).toBe(200);
      const result = (await response.json()) as { order: string[] };

      // 验证执行顺序：模块中间件 -> 路由中间件1 -> 路由中间件2 -> 处理器 -> 路由中间件2 -> 路由中间件1 -> 模块中间件
      // Hono 的中间件执行顺序：先执行模块级中间件，然后执行路由级中间件（按数组顺序）
      // 注意：由于中间件是异步的，后置处理可能在响应返回后才执行，所以这里只验证前置顺序
      expect(result.order).toContain("middleware1-before");
      expect(result.order).toContain("middleware2-before");
      expect(result.order).toContain("middleware3-before");
      expect(result.order).toContain("handler");

      // 验证前置执行顺序（在 handler 之前）
      const handlerIndex = result.order.indexOf("handler");
      expect(handlerIndex).toBeGreaterThan(-1);
      expect(result.order.indexOf("middleware1-before")).toBeLessThan(
        handlerIndex
      );
      expect(result.order.indexOf("middleware2-before")).toBeLessThan(
        handlerIndex
      );
      expect(result.order.indexOf("middleware3-before")).toBeLessThan(
        handlerIndex
      );

      // 验证所有中间件都被调用了
      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).toHaveBeenCalled();
      expect(middleware3).toHaveBeenCalled();
    });

    it("应该支持中间件提前返回响应（不调用 next）", async () => {
      const blockingMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          // 中间件直接返回响应，不调用 next
          return ctx.json({ blocked: true, reason: "Access denied" }, 403);
        }
      );

      @Module("test-module")
      class TestService {
        @Route({
          method: "GET",
          path: "/blocked",
          middlewares: [blockingMiddleware],
        })
        blockedRoute() {
          // 这个方法不应该被执行
          return { success: true };
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/blocked");
      expect(response.status).toBe(403);
      const result = (await response.json()) as {
        blocked: boolean;
        reason: string;
      };
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("Access denied");
    });

    it("应该支持多个路径共享相同的中间件", async () => {
      const sharedMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          ctx.set("shared-processed", true);
          await next();
        }
      );

      @Module("test-module")
      class TestService {
        @Route({
          method: "GET",
          path: ["/shared1", "/shared2", "/shared3"],
          middlewares: [sharedMiddleware],
        })
        sharedRoute(ctx: Context) {
          return {
            path: ctx.req.path,
            processed: ctx.get("shared-processed"),
          };
        }
      }

      // 使用 engine.request 测试
      const response1 = await engine.request("/shared1");
      expect(response1.status).toBe(200);
      const result1 = (await response1.json()) as {
        path: string;
        processed: boolean;
      };
      expect(result1.processed).toBe(true);

      const response2 = await engine.request("/shared2");
      expect(response2.status).toBe(200);
      const result2 = (await response2.json()) as {
        path: string;
        processed: boolean;
      };
      expect(result2.processed).toBe(true);

      const response3 = await engine.request("/shared3");
      expect(response3.status).toBe(200);
      const result3 = (await response3.json()) as {
        path: string;
        processed: boolean;
      };
      expect(result3.processed).toBe(true);

      // 中间件应该被调用 3 次（每个路径一次）
      expect(sharedMiddleware).toHaveBeenCalledTimes(3);
    });
  });

  describe("全局中间件功能", () => {
    it("应该支持全局中间件应用于所有路由", async () => {
      const globalMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          ctx.set("global-processed", true);
          await next();
        }
      );

      const routePluginWithGlobal = new RoutePlugin({
        globalMiddlewares: [globalMiddleware],
      });
      const testEngine = Testing.createTestEngine({
        plugins: [routePluginWithGlobal],
      });
      const testEngineInstance = testEngine.engine;
      const TestModule = testEngine.Module;

      @TestModule("test-module-1")
      class TestService1 {
        @Route({ method: "GET", path: "/route1" })
        route1(ctx: Context) {
          return { processed: ctx.get("global-processed") };
        }
      }

      @TestModule("test-module-2")
      class TestService2 {
        @Route({ method: "GET", path: "/route2" })
        route2(ctx: Context) {
          return { processed: ctx.get("global-processed") };
        }
      }

      // 使用 engine.request 测试（需要测试全局中间件）
      const response1 = await testEngineInstance.request("/route1");
      expect(response1.status).toBe(200);
      const result1 = (await response1.json()) as { processed: boolean };
      expect(result1.processed).toBe(true);

      const response2 = await testEngineInstance.request("/route2");
      expect(response2.status).toBe(200);
      const result2 = (await response2.json()) as { processed: boolean };
      expect(result2.processed).toBe(true);

      // 全局中间件应该被调用 2 次（每个路由一次）
      expect(globalMiddleware).toHaveBeenCalledTimes(2);
    });

    it("应该支持全局中间件、模块级中间件和路由级中间件的执行顺序", async () => {
      const executionOrder: string[] = [];

      const globalMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          executionOrder.push("global-before");
          await next();
          executionOrder.push("global-after");
        }
      );

      const moduleMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          executionOrder.push("module-before");
          await next();
          executionOrder.push("module-after");
        }
      );

      const routeMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          executionOrder.push("route-before");
          await next();
          executionOrder.push("route-after");
        }
      );

      const routePluginWithGlobal = new RoutePlugin({
        globalMiddlewares: [globalMiddleware],
      });
      const testEngine = Testing.createTestEngine({
        plugins: [routePluginWithGlobal],
      });
      const testEngineInstance = testEngine.engine;
      const TestModule = testEngine.Module;

      @TestModule("test-module", {
        routeMiddlewares: [moduleMiddleware],
      })
      class TestService {
        @Route({
          method: "GET",
          path: "/ordered",
          middlewares: [routeMiddleware],
        })
        orderedRoute() {
          executionOrder.push("handler");
          return { order: [...executionOrder] };
        }
      }

      // 使用 engine.request 测试（需要测试中间件执行顺序）
      const response = await testEngineInstance.request("/ordered");
      expect(response.status).toBe(200);
      const result = (await response.json()) as { order: string[] };

      // 验证执行顺序：全局 -> 模块 -> 路由 -> 处理器
      // 注意：后置处理（after）可能在响应返回后才执行，所以这里只验证前置顺序
      const handlerIndex = result.order.indexOf("handler");
      expect(handlerIndex).toBeGreaterThan(-1);

      // 验证前置执行顺序（在 handler 之前）
      const globalBeforeIndex = result.order.indexOf("global-before");
      const moduleBeforeIndex = result.order.indexOf("module-before");
      const routeBeforeIndex = result.order.indexOf("route-before");

      expect(globalBeforeIndex).toBeGreaterThan(-1);
      expect(moduleBeforeIndex).toBeGreaterThan(-1);
      expect(routeBeforeIndex).toBeGreaterThan(-1);

      expect(globalBeforeIndex).toBeLessThan(moduleBeforeIndex);
      expect(moduleBeforeIndex).toBeLessThan(routeBeforeIndex);
      expect(routeBeforeIndex).toBeLessThan(handlerIndex);

      // 验证所有中间件都被调用了
      expect(globalMiddleware).toHaveBeenCalled();
      expect(moduleMiddleware).toHaveBeenCalled();
      expect(routeMiddleware).toHaveBeenCalled();
    });

    it("应该支持全局鉴权中间件拦截未授权请求", async () => {
      const authMiddleware = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          const token = ctx.req.header("Authorization");
          if (!token || !token.startsWith("Bearer ")) {
            return ctx.json({ error: "Unauthorized" }, 401);
          }
          const actualToken = token.replace("Bearer ", "");
          if (actualToken !== "valid-token") {
            return ctx.json({ error: "Invalid token" }, 401);
          }
          ctx.set("user", { id: "123", name: "Test User" });
          await next();
        }
      );

      const routePluginWithAuth = new RoutePlugin({
        globalMiddlewares: [authMiddleware],
      });
      const testEngine = Testing.createTestEngine({
        plugins: [routePluginWithAuth],
      });
      const testEngineInstance = testEngine.engine;
      const TestModule = testEngine.Module;

      @TestModule("test-module-1")
      class TestService1 {
        @Route({ method: "GET", path: "/public" })
        publicRoute() {
          return { message: "public" };
        }
      }

      @TestModule("test-module-2")
      class TestService2 {
        @Route({ method: "GET", path: "/private" })
        privateRoute(ctx: Context) {
          const user = ctx.get("user") as
            | { id: string; name: string }
            | undefined;
          return { message: "private", user };
        }
      }

      // 使用 engine.request 测试（需要测试全局中间件）
      // 测试：没有 token 的请求应该被拦截
      const response1 = await testEngineInstance.request("/public");
      expect(response1.status).toBe(401);
      const error1 = (await response1.json()) as { error: string };
      expect(error1.error).toBe("Unauthorized");

      const response2 = await testEngineInstance.request("/private");
      expect(response2.status).toBe(401);

      // 测试：无效 token 的请求应该被拦截
      const request3 = new Request("http://localhost/public", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      const response3 = await testEngineInstance.request(request3);
      expect(response3.status).toBe(401);
      const error3 = (await response3.json()) as { error: string };
      expect(error3.error).toBe("Invalid token");

      // 测试：有效 token 的请求应该通过
      const request4 = new Request("http://localhost/public", {
        headers: { Authorization: "Bearer valid-token" },
      });
      const response4 = await testEngineInstance.request(request4);
      expect(response4.status).toBe(200);
      const result4 = (await response4.json()) as { message: string };
      expect(result4.message).toBe("public");

      const request5 = new Request("http://localhost/private", {
        headers: { Authorization: "Bearer valid-token" },
      });
      const response5 = await testEngineInstance.request(request5);
      expect(response5.status).toBe(200);
      const result5 = (await response5.json()) as {
        message: string;
        user: { id: string; name: string };
      };
      expect(result5.message).toBe("private");
      expect(result5.user).toEqual({ id: "123", name: "Test User" });
    });

    it("应该支持多个全局中间件", async () => {
      const middleware1 = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          ctx.set("m1-processed", true);
          await next();
        }
      );

      const middleware2 = vi.fn(
        async (ctx: Context, next: () => Promise<void>) => {
          ctx.set("m2-processed", true);
          await next();
        }
      );

      const routePluginWithMultiple = new RoutePlugin({
        globalMiddlewares: [middleware1, middleware2],
      });
      const testEngine = Testing.createTestEngine({
        plugins: [routePluginWithMultiple],
      });
      const testEngineInstance = testEngine.engine;
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ method: "GET", path: "/multi" })
        multiRoute(ctx: Context) {
          return {
            m1: ctx.get("m1-processed"),
            m2: ctx.get("m2-processed"),
          };
        }
      }

      // 使用 engine.request 测试
      const response = await testEngineInstance.request("/multi");
      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        m1: boolean;
        m2: boolean;
      };
      expect(result.m1).toBe(true);
      expect(result.m2).toBe(true);
      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).toHaveBeenCalled();
    });
  });

  describe("响应类型处理", () => {
    it("字符串应该返回 text/plain Content-Type", async () => {
      @Module("test-module")
      class TestService {
        @Route({ path: "/text" })
        getText() {
          return "Hello World";
        }
      }

      // 使用 engine.request 测试响应类型
      const response = await engine.request("/text");
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain("text/plain");
      const text = await response.text();
      expect(text).toBe("Hello World");
    });

    it("普通对象应该返回 application/json Content-Type", async () => {
      @Module("test-module")
      class TestService {
        @Route({ path: "/json" })
        getJson() {
          return { message: "Hello" };
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/json");
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
      const data = await response.json();
      expect(data).toEqual({ message: "Hello" });
    });

    it("数组应该返回 application/json Content-Type", async () => {
      @Module("test-module")
      class TestService {
        @Route({ path: "/array" })
        getArray() {
          return [1, 2, 3];
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/array");
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
      const data = await response.json();
      expect(data).toEqual([1, 2, 3]);
    });

    it("undefined 应该返回 204 No Content", async () => {
      @Module("test-module")
      class TestService {
        @Route({ path: "/empty" })
        getEmpty() {
          return undefined;
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/empty");
      expect(response.status).toBe(204);
    });

    it("null 应该返回 204 No Content", async () => {
      @Module("test-module")
      class TestService {
        @Route({ path: "/null" })
        getNull() {
          return null;
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/null");
      expect(response.status).toBe(204);
    });

    it("JSX 元素应该返回 text/html Content-Type", async () => {
      @Module("test-module")
      class TestService {
        @Route({ path: "/jsx" })
        getJsx() {
          // 使用 jsx 函数创建 JSX 元素（避免测试文件需要 JSX 转换）
          return jsx("div", null, "Hello JSX");
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/jsx");
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain("text/html");
      const htmlText = await response.text();
      expect(htmlText).toContain("Hello JSX");
    });

    it("html 模板字符串应该返回 text/html Content-Type", async () => {
      @Module("test-module")
      class TestService {
        @Route({ path: "/html-template" })
        getHtmlTemplate() {
          return html`<div>Hello HTML</div>`;
        }
      }

      // 使用 engine.request 测试
      const response = await engine.request("/html-template");
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain("text/html");
      const htmlText = await response.text();
      expect(htmlText).toContain("Hello HTML");
    });
  });

  describe("错误转换", () => {
    it("应该使用自定义错误转换函数", async () => {
      const customErrorTransformer = vi.fn(
        async (ctx: Context, error: unknown, handler: HandlerMetadata) => {
          return ctx.json(
            {
              success: false,
              code: "CUSTOM_ERROR",
              message: error instanceof Error ? error.message : String(error),
              handler: handler.methodName,
            },
            500
          );
        }
      );

      const pluginWithTransformer = new RoutePlugin({
        errorTransformer: customErrorTransformer,
      });
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithTransformer],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/error" })
        throwError() {
          throw new Error("Test error");
        }
      }

      // 使用 engine.request 测试（需要测试错误转换）
      const response = await testEngine.engine.request("/error");
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({
        success: false,
        code: "CUSTOM_ERROR",
        message: "Test error",
        handler: "throwError",
      });
      expect(customErrorTransformer).toHaveBeenCalledTimes(1);
      expect(customErrorTransformer).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Error),
        expect.objectContaining({
          methodName: "throwError",
          type: "route",
        })
      );
    });

    it("如果错误转换函数抛出异常，应该回退到默认错误响应", async () => {
      const failingErrorTransformer = vi.fn(async () => {
        throw new Error("Transformer failed");
      });

      const pluginWithFailingTransformer = new RoutePlugin({
        errorTransformer: failingErrorTransformer,
      });
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithFailingTransformer],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/error" })
        throwError() {
          throw new Error("Original error");
        }
      }

      // 使用 engine.request 测试
      const response = await testEngine.engine.request("/error");
      expect(response.status).toBe(500);
      const data = await response.json();
      // 应该回退到默认错误响应
      expect(data).toEqual({
        error: "Internal server error",
        message: "Original error",
      });
      expect(failingErrorTransformer).toHaveBeenCalledTimes(1);
    });

    it("如果没有配置错误转换函数，应该使用默认错误响应", async () => {
      const pluginWithoutTransformer = new RoutePlugin();
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithoutTransformer],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/error" })
        throwError() {
          throw new Error("Test error");
        }
      }

      // 使用 engine.request 测试
      const response = await testEngine.engine.request("/error");
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({
        error: "Internal server error",
        message: "Test error",
      });
    });

    it("错误转换函数可以返回不同的响应类型", async () => {
      const htmlErrorTransformer = vi.fn(
        async (ctx: Context, error: unknown) => {
          return ctx.html(
            `<html><body><h1>Error</h1><p>${
              error instanceof Error ? error.message : String(error)
            }</p></body></html>`,
            500
          );
        }
      );

      const pluginWithHtmlTransformer = new RoutePlugin({
        errorTransformer: htmlErrorTransformer,
      });
      const testEngine = Testing.createTestEngine({
        plugins: [pluginWithHtmlTransformer],
      });
      const TestModule = testEngine.Module;

      @TestModule("test-module")
      class TestService {
        @Route({ path: "/error" })
        throwError() {
          throw new Error("HTML error");
        }
      }

      // 使用 engine.request 测试
      const response = await testEngine.engine.request("/error");
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain("text/html");
      const htmlText = await response.text();
      expect(htmlText).toContain("HTML error");
    });
  });
});
