import * as ejson from "ejson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Testing } from "../../core/testing";
import { Action, ActionPlugin } from "../action";
import { Cache, CachePlugin } from "../cache";
import { TelemetryPlugin, type TelemetryExporter } from "./index";

class TestExporter implements TelemetryExporter {
  private spans: any[] = [];

  async export(spans: any[]): Promise<void> {
    this.spans.push(...spans);
  }

  getSpans() {
    return this.spans;
  }

  clear() {
    this.spans = [];
  }
}

describe("TelemetryPlugin", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let testExporter: TestExporter;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    testExporter = new TestExporter();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  it("should create TelemetryPlugin", () => {
    const plugin = new TelemetryPlugin({
      serviceName: "test-service",
      exporter: testExporter,
    });
    expect(plugin.name).toBe("telemetry-plugin");
  });

  it("should collect trace data with traceId and spanId", async () => {
    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].traceId).toBeDefined();
    expect(spans[0].spanId).toBeDefined();
    expect(spans[0].traceId.length).toBeGreaterThan(0);
    expect(spans[0].spanId.length).toBeGreaterThan(0);
  });

  it("should collect module and action name", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].moduleName).toBe("users");
    expect(spans[0].actionName).toBe("getUser");
    expect(spans[0].serviceName).toBe("test-service");
  });

  it("should collect params when enabled", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
          collect: {
            params: true,
            result: false,
            maxParamSize: 1024,
            maxResultSize: 2048,
          },
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "user-123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].params).toEqual(["user-123"]);
  });

  it("should not collect params when disabled", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
          collect: {
            params: false,
            result: false,
            maxParamSize: 1024,
            maxResultSize: 2048,
          },
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].params).toBeUndefined();
  });

  it("should track cache hit", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
        }),
        new CachePlugin(),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Cache({ ttl: 60000 })
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);

    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );

    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );

    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(2);

    const firstCall = spans[0];
    expect(firstCall.cacheHit).toBe(false);

    const secondCall = spans[1];
    expect(secondCall.cacheHit).toBe(true);
  });

  it("should track error when action throws", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        throw new Error("User not found");
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].success).toBe(false);
    expect(spans[0].error).toBe("User not found");
  });

  it("should collect duration", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      async getUser(id: string) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].duration).toBeDefined();
    expect(spans[0].duration).toBeGreaterThanOrEqual(50);
    expect(spans[0].startTime).toBeDefined();
    expect(spans[0].endTime).toBeDefined();
    expect(spans[0].endTime).toBeGreaterThan(spans[0].startTime);
  });

  it("should use custom exporter", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
          batch: { size: 1, flushInterval: 100 },
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );

    await Testing.wait(200);
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    expect(spans[0].moduleName).toBe("users");
  });

  it("should not collect when sampling rate is 0", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
          sampling: { rate: 0 },
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);
    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: { "Content-Type": "application/ejson" },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(0);
  });

  it("should propagate trace context via headers", async () => {
    testExporter.clear();

    const testEngine = Testing.createTestEngine({
      plugins: [
        new TelemetryPlugin({
          serviceName: "test-service",
          exporter: testExporter,
        }),
        new ActionPlugin(),
      ],
    });

    const engine = testEngine.engine;
    const Module = testEngine.Module;

    @Module("users")
    class UserService {
      @Action({ params: [z.string()] })
      getUser(id: string) {
        return { id, name: "Alice" };
      }
    }

    await engine.start(0);

    const traceId = "test-trace-id-12345";
    const spanId = "test-span-id-67890";

    await engine.request(
      new Request("http://localhost/users/getUser", {
        method: "POST",
        body: ejson.stringify({ "0": "123" }),
        headers: {
          "Content-Type": "application/ejson",
          "X-Trace-TraceId": traceId,
          "X-Trace-SpanId": spanId,
          "X-Trace-ParentId": "parent-span-123",
        },
      }),
    );
    await engine.stop();

    const spans = testExporter.getSpans();
    expect(spans.length).toBe(1);
    const span = spans[0];

    expect(span.traceId).toBe(traceId);
    expect(span.parentId).toBe(spanId);
  });
});
