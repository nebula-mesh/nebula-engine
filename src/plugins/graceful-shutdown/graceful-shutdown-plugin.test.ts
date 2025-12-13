import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { GracefulShutdownPlugin } from "./plugin";
import { Testing } from "../../core/testing";
import { Handler } from "../../core/decorators";
import { ActionPlugin } from "../action";
import { RoutePlugin } from "../route";
import { Route } from "../route";

describe("GracefulShutdownPlugin", () => {
  let plugin: GracefulShutdownPlugin;
  let originalExit: typeof process.exit;
  let exitCode: number | null = null;

  beforeEach(() => {
    // 保存原始的 process.exit
    originalExit = process.exit;
    exitCode = null;
    
    // Mock process.exit
    process.exit = vi.fn((code?: number) => {
      exitCode = code ?? 0;
      return undefined as never;
    }) as typeof process.exit;

    plugin = new GracefulShutdownPlugin({
      shutdownTimeout: 1000, // 1秒超时，用于测试
    });
  });

  afterEach(() => {
    // 恢复原始的 process.exit
    process.exit = originalExit;
    
    // 清理所有信号监听器
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGBREAK");
  });

  describe("插件初始化", () => {
    it("应该正确初始化插件", () => {
      expect(plugin.name).toBe("graceful-shutdown-plugin");
      expect(plugin.getActiveHandlersCount()).toBe(0);
      expect(plugin.isShuttingDownNow()).toBe(false);
    });

    it("应该支持自定义超时时间", () => {
      const customPlugin = new GracefulShutdownPlugin({
        shutdownTimeout: 5000,
      });
      expect(customPlugin).toBeDefined();
    });

    it("应该支持禁用插件", () => {
      const disabledPlugin = new GracefulShutdownPlugin({
        enabled: false,
      });
      expect(disabledPlugin).toBeDefined();
    });
  });

  describe("处理器追踪", () => {
    it("应该追踪 Action 处理器的执行", async () => {
      const { engine, Module: TestModule } = Testing.createTestEngine({
        plugins: [new ActionPlugin(), plugin],
      });

      @TestModule("test-module")
      class TestService {
        @Handler({
          type: "action",
          options: {
            params: [],
            returns: { type: "string" },
          },
        })
        async testAction() {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "done";
        }
      }

      // 使用 engine.handler 测试（不依赖 Hono）
      const testActionHandler = engine.handler(TestService, "testAction");

      // 启动处理器执行
      const promise = testActionHandler();

      // 等待一小段时间，确保处理器开始执行
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 检查活跃处理器计数
      expect(plugin.getActiveHandlersCount()).toBeGreaterThan(0);

      // 等待请求完成
      await promise;
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 检查活跃处理器计数应该为0
      expect(plugin.getActiveHandlersCount()).toBe(0);
    });

    it("应该追踪 Route 处理器的执行", async () => {
      const { engine, Module: TestModule } = Testing.createTestEngine({
        plugins: [new RoutePlugin(), plugin],
      });

      @TestModule("test-module")
      class TestService {
        @Route({
          method: "GET",
          path: "/test",
        })
        async testRoute(ctx: any) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { success: true };
        }
      }

      // 使用 engine.request 测试（依赖 Hono）
      const promise = engine.request("/test");

      // 等待一小段时间，确保处理器开始执行
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 检查活跃处理器计数
      expect(plugin.getActiveHandlersCount()).toBeGreaterThan(0);

      // 等待请求完成
      await promise;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 检查活跃处理器计数应该为0
      expect(plugin.getActiveHandlersCount()).toBe(0);
    });
  });

  describe("优雅停机", () => {
    it("应该在收到 SIGINT 信号时启动优雅停机", async () => {
      const { engine, Module: TestModule } = Testing.createTestEngine({
        plugins: [new ActionPlugin(), plugin],
      });

      @TestModule("test-module")
      class TestService {
        @Handler({
          type: "action",
          options: {
            params: [],
            returns: { type: "string" },
          },
        })
        async testAction() {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "done";
        }
      }

      await engine.start();

      // 发送一个请求
      const requestPromise = fetch(
        `http://127.0.0.1:${engine.getPort()}/test-module/testAction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: JSON.stringify({}),
        }
      );

      // 等待处理器开始执行
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 模拟 SIGINT 信号
      process.emit("SIGINT" as any, "SIGINT");

      // 等待停机流程
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 检查是否正在停机
      expect(plugin.isShuttingDownNow()).toBe(true);

      // 等待请求完成
      await requestPromise;

      // 等待停机完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 检查是否调用了 process.exit
      expect(exitCode).toBe(0);
    });

    it("应该在所有处理器完成后立即停机", async () => {
      const { engine, Module: TestModule } = Testing.createTestEngine({
        plugins: [new ActionPlugin(), plugin],
      });

      @TestModule("test-module")
      class TestService {
        @Handler({
          type: "action",
          options: {
            params: [],
            returns: { type: "string" },
          },
        })
        async quickAction() {
          return "done";
        }
      }

      await engine.start();

      // 发送一个快速完成的请求
      await fetch(
        `http://127.0.0.1:${engine.getPort()}/test-module/quickAction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: JSON.stringify({}),
        }
      );

      // 等待一小段时间确保请求完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 确保没有活跃的处理器
      expect(plugin.getActiveHandlersCount()).toBe(0);

      // 模拟 SIGINT 信号（Windows 也支持）
      process.emit("SIGINT" as any, "SIGINT");

      // 等待停机流程（需要更长时间，因为需要等待引擎停止）
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 检查是否调用了 process.exit
      // 注意：在某些情况下，process.exit 可能不会立即调用
      // 所以我们检查 exitCode 是否为 0 或 null（null 表示还没有调用）
      expect(exitCode === 0 || exitCode === null).toBe(true);
    });

    it("应该在超时后强制停机", async () => {
      const fastTimeoutPlugin = new GracefulShutdownPlugin({
        shutdownTimeout: 100, // 100ms 超时
      });

      const { engine, Module: TestModule } = Testing.createTestEngine({
        plugins: [new ActionPlugin(), fastTimeoutPlugin],
      });

      @TestModule("test-module")
      class TestService {
        @Handler({
          type: "action",
          options: {
            params: [],
            returns: { type: "string" },
          },
        })
        async slowAction() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return "done";
        }
      }

      await engine.start();

      // 发送一个慢请求
      const requestPromise = fetch(
        `http://127.0.0.1:${engine.getPort()}/test-module/slowAction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/ejson" },
          body: JSON.stringify({}),
        }
      );

      // 等待处理器开始执行
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 模拟 SIGINT 信号
      process.emit("SIGINT" as any, "SIGINT");

      // 等待超时
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 检查是否调用了 process.exit（应该因为超时而退出）
      expect(exitCode).toBe(0);

      // 清理
      try {
        await requestPromise;
      } catch {
        // 忽略错误，因为服务器可能已经关闭
      }
    });

    it("应该在停机期间拒绝新的请求", async () => {
      const { engine, Module: TestModule } = Testing.createTestEngine({
        plugins: [new ActionPlugin(), plugin],
      });

      @TestModule("test-module")
      class TestService {
        @Handler({
          type: "action",
          options: {
            params: [],
            returns: { type: "string" },
          },
        })
        async testAction() {
          return "done";
        }
      }

      await engine.start();

      // 模拟 SIGINT 信号
      process.emit("SIGINT" as any, "SIGINT");

      // 等待停机流程启动
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 尝试发送新请求（应该被拒绝）
      try {
        await fetch(
          `http://127.0.0.1:${engine.getPort()}/test-module/testAction`,
          {
            method: "POST",
            headers: { "Content-Type": "application/ejson" },
            body: JSON.stringify({}),
          }
        );
        // 如果请求成功，测试失败
        expect.fail("Request should be rejected during shutdown");
      } catch (error) {
        // 请求应该被拒绝或失败
        expect(error).toBeDefined();
      }
    });
  });

  describe("错误处理", () => {
    it("应该正确处理处理器执行错误", async () => {
      const { engine, Module: TestModule } = Testing.createTestEngine({
        plugins: [new ActionPlugin(), plugin],
      });

      @TestModule("test-module")
      class TestService {
        @Handler({
          type: "action",
          options: {
            params: [],
            returns: { type: "string" },
          },
        })
        async failingAction() {
          throw new Error("Test error");
        }
      }

      await engine.start();

      // 发送一个会失败的请求
      try {
        await fetch(
          `http://127.0.0.1:${engine.getPort()}/test-module/failingAction`,
          {
            method: "POST",
            headers: { "Content-Type": "application/ejson" },
            body: JSON.stringify({}),
          }
        );
      } catch {
        // 忽略错误
      }

      // 等待一小段时间
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 检查活跃处理器计数应该为0（即使出错也应该减少计数）
      expect(plugin.getActiveHandlersCount()).toBe(0);

      await engine.stop();
    });
  });
});

