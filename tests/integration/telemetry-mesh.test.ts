/**
 * 集成测试：服务网格追踪
 * 模拟多个服务之间的调用，验证分布式追踪的调用树结构
 *
 * 注意：跨服务调用需要手动传播 trace headers（未来可以实现自动传播）
 */

import { beforeEach, describe, expect, it } from "vitest";
import * as ejson from "ejson";
import { z } from "zod";
import { Testing } from "../../src/core/testing";
import { Action, ActionPlugin } from "../../src/plugins/action";
import {
  TelemetryPlugin,
  type TelemetryExporter,
  type TraceSpan,
} from "../../src/plugins/telemetry";

class TestExporter implements TelemetryExporter {
  private spans: TraceSpan[] = [];

  async export(spans: TraceSpan[]): Promise<void> {
    this.spans.push(...spans);
  }

  getSpans(): TraceSpan[] {
    return this.spans;
  }

  clear(): void {
    this.spans = [];
  }
}

describe("Service Mesh Telemetry Integration", () => {
  describe("Single service trace context", () => {
    let testExporter: TestExporter;

    beforeEach(() => {
      testExporter = new TestExporter();
    });

    it("should propagate trace headers to action span", async () => {
      const testEngine = Testing.createTestEngine({
        plugins: [
          new TelemetryPlugin({
            serviceName: "test-service",
            exporter: testExporter,
            batch: { size: 1, flushInterval: 100 },
          }),
          new ActionPlugin(),
        ],
        options: { name: "test-service", version: "1.0.0", prefix: "/api" },
      });

      const TestModule = testEngine.Module;

      @TestModule("orders")
      class OrderService {
        @Action({ params: [z.string()] })
        getOrder(id: string) {
          return { id, userId: "user-1" };
        }
      }

      await testEngine.engine.start(0);
      const port = testEngine.engine.getPort();

      const traceId = "test-trace-id-12345";
      const parentSpanId = "parent-span-id";

      const response = await fetch(
        `http://127.0.0.1:${port}/api/orders/getOrder`,
        {
          method: "POST",
          body: ejson.stringify({ "0": "order-1" }),
          headers: {
            "Content-Type": "application/ejson",
            "X-Trace-TraceId": traceId,
            "X-Trace-SpanId": parentSpanId,
          },
        },
      );

      expect(response.ok).toBe(true);

      await Testing.wait(200);
      await testEngine.engine.stop();

      const spans = testExporter.getSpans();
      expect(spans.length).toBe(1);

      const orderSpan = spans[0];
      expect(orderSpan.traceId).toBe(traceId);
      expect(orderSpan.parentId).toBe(parentSpanId);
      expect(orderSpan.serviceName).toBe("test-service");
      expect(orderSpan.moduleName).toBe("orders");
      expect(orderSpan.actionName).toBe("getOrder");
    });

    it("should maintain separate traces for concurrent requests", async () => {
      const testEngine = Testing.createTestEngine({
        plugins: [
          new TelemetryPlugin({
            serviceName: "test-service",
            exporter: testExporter,
            batch: { size: 1, flushInterval: 100 },
          }),
          new ActionPlugin(),
        ],
        options: { name: "test-service", prefix: "/api" },
      });

      const TestModule = testEngine.Module;

      @TestModule("test")
      class TestService {
        @Action({ params: [z.string()] })
        async process(id: string) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { id, processed: true };
        }
      }

      await testEngine.engine.start(0);
      const port = testEngine.engine.getPort();

      const traceId1 = "trace-1";
      const traceId2 = "trace-2";
      const traceId3 = "trace-3";

      await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/test/process`, {
          method: "POST",
          body: ejson.stringify({ "0": "1" }),
          headers: {
            "Content-Type": "application/ejson",
            "X-Trace-TraceId": traceId1,
            "X-Trace-SpanId": "span-1",
          },
        }),
        fetch(`http://127.0.0.1:${port}/api/test/process`, {
          method: "POST",
          body: ejson.stringify({ "0": "2" }),
          headers: {
            "Content-Type": "application/ejson",
            "X-Trace-TraceId": traceId2,
            "X-Trace-SpanId": "span-2",
          },
        }),
        fetch(`http://127.0.0.1:${port}/api/test/process`, {
          method: "POST",
          body: ejson.stringify({ "0": "3" }),
          headers: {
            "Content-Type": "application/ejson",
            "X-Trace-TraceId": traceId3,
            "X-Trace-SpanId": "span-3",
          },
        }),
      ]);

      await Testing.wait(200);
      await testEngine.engine.stop();

      const spans = testExporter.getSpans();
      expect(spans.length).toBe(3);

      const traceIds = spans.map((s) => s.traceId);
      expect(traceIds).toContain(traceId1);
      expect(traceIds).toContain(traceId2);
      expect(traceIds).toContain(traceId3);
    });

    it("should generate new span for each action call", async () => {
      const testEngine = Testing.createTestEngine({
        plugins: [
          new TelemetryPlugin({
            serviceName: "test-service",
            exporter: testExporter,
            batch: { size: 10, flushInterval: 1000 },
          }),
          new ActionPlugin(),
        ],
        options: { name: "test-service", prefix: "/api" },
      });

      const TestModule = testEngine.Module;

      @TestModule("users")
      class UserService {
        @Action({ params: [z.string()] })
        getUser(id: string) {
          return { id, name: "Alice" };
        }

        @Action({ params: [z.string()] })
        getUserProfile(id: string) {
          return { userId: id, bio: "Hello" };
        }
      }

      await testEngine.engine.start(0);
      const port = testEngine.engine.getPort();

      await fetch(`http://127.0.0.1:${port}/api/users/getUser`, {
        method: "POST",
        body: ejson.stringify({ "0": "1" }),
        headers: { "Content-Type": "application/ejson" },
      });

      await fetch(`http://127.0.0.1:${port}/api/users/getUserProfile`, {
        method: "POST",
        body: ejson.stringify({ "0": "1" }),
        headers: { "Content-Type": "application/ejson" },
      });

      await Testing.wait(200);
      await testEngine.engine.stop();

      const spans = testExporter.getSpans();
      expect(spans.length).toBe(2);

      const span1 = spans[0];
      const span2 = spans[1];

      expect(span1.traceId).toBeDefined();
      expect(span2.traceId).toBeDefined();
      expect(span1.traceId).not.toBe(span2.traceId);

      expect(span1.spanId).not.toBe(span2.spanId);
      expect(span1.actionName).toBe("getUser");
      expect(span2.actionName).toBe("getUserProfile");
    });

    it("should create correct span hierarchy when trace context is provided", async () => {
      const testEngine = Testing.createTestEngine({
        plugins: [
          new TelemetryPlugin({
            serviceName: "test-service",
            exporter: testExporter,
            batch: { size: 1, flushInterval: 100 },
          }),
          new ActionPlugin(),
        ],
        options: { name: "test-service", prefix: "/api" },
      });

      const TestModule = testEngine.Module;

      @TestModule("orders")
      class OrderService {
        @Action({ params: [z.string()] })
        getOrder(id: string) {
          return { id, total: 100 };
        }

        @Action({ params: [z.string()] })
        createOrder(id: string) {
          return { id, status: "created" };
        }
      }

      await testEngine.engine.start(0);
      const port = testEngine.engine.getPort();

      await fetch(`http://127.0.0.1:${port}/api/orders/getOrder`, {
        method: "POST",
        body: ejson.stringify({ "0": "1" }),
        headers: {
          "Content-Type": "application/ejson",
          "X-Trace-TraceId": "root-trace",
          "X-Trace-SpanId": "span-A",
        },
      });

      await fetch(`http://127.0.0.1:${port}/api/orders/createOrder`, {
        method: "POST",
        body: ejson.stringify({ "0": "2" }),
        headers: {
          "Content-Type": "application/ejson",
          "X-Trace-TraceId": "root-trace",
          "X-Trace-SpanId": "span-B",
        },
      });

      await Testing.wait(200);
      await testEngine.engine.stop();

      const spans = testExporter.getSpans();
      expect(spans.length).toBe(2);

      const getOrderSpan = spans.find((s) => s.actionName === "getOrder")!;
      const createOrderSpan = spans.find(
        (s) => s.actionName === "createOrder",
      )!;

      expect(getOrderSpan.traceId).toBe("root-trace");
      expect(getOrderSpan.parentId).toBe("span-A");

      expect(createOrderSpan.traceId).toBe("root-trace");
      expect(createOrderSpan.parentId).toBe("span-B");

      expect(getOrderSpan.spanId).not.toBe(createOrderSpan.spanId);
    });
  });
});
