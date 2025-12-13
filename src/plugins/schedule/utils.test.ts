import { describe, expect, it } from "vitest";
import { HandlerMetadata } from "../../core/types";
import { ScheduleMode } from "./types";
import { extractScheduleMetadata } from "./utils";

describe("extractScheduleMetadata", () => {
  it("应该从 HandlerMetadata 中提取调度元数据", () => {
    class TestModule {}

    const handlers: HandlerMetadata[] = [
      {
        type: "schedule",
        options: {
          interval: 5000,
          mode: ScheduleMode.FIXED_RATE,
        },
        method: function task1() {},
        methodName: "task1",
        module: TestModule,
        wrap: () => {},
      },
      {
        type: "schedule",
        options: {
          interval: 10000,
          mode: ScheduleMode.FIXED_DELAY,
        },
        method: function task2() {},
        methodName: "task2",
        module: TestModule,
        wrap: () => {},
      },
      {
        type: "action", // 非 schedule 类型，应该被忽略
        options: {},
        method: function action1() {},
        methodName: "action1",
        module: TestModule,
        wrap: () => {},
      },
    ];

    const result = extractScheduleMetadata(handlers);

    expect(result.size).toBe(1);
    expect(result.has(TestModule)).toBe(true);

    const moduleMetadata = result.get(TestModule)!;
    expect(moduleMetadata.size).toBe(2);
    expect(moduleMetadata.has("task1")).toBe(true);
    expect(moduleMetadata.has("task2")).toBe(true);

    const task1Metadata = moduleMetadata.get("task1")!;
    expect(task1Metadata.name).toBe("task1");
    expect(task1Metadata.interval).toBe(5000);
    expect(task1Metadata.mode).toBe(ScheduleMode.FIXED_RATE);

    const task2Metadata = moduleMetadata.get("task2")!;
    expect(task2Metadata.name).toBe("task2");
    expect(task2Metadata.interval).toBe(10000);
    expect(task2Metadata.mode).toBe(ScheduleMode.FIXED_DELAY);
  });

  it("应该处理多个模块的调度任务", () => {
    class Module1 {}
    class Module2 {}

    const handlers: HandlerMetadata[] = [
      {
        type: "schedule",
        options: {
          interval: 5000,
          mode: ScheduleMode.FIXED_RATE,
        },
        method: function task1() {},
        methodName: "task1",
        module: Module1,
        wrap: () => {},
      },
      {
        type: "schedule",
        options: {
          interval: 10000,
          mode: ScheduleMode.FIXED_DELAY,
        },
        method: function task2() {},
        methodName: "task2",
        module: Module2,
        wrap: () => {},
      },
    ];

    const result = extractScheduleMetadata(handlers);

    expect(result.size).toBe(2);
    expect(result.has(Module1)).toBe(true);
    expect(result.has(Module2)).toBe(true);

    const module1Metadata = result.get(Module1)!;
    expect(module1Metadata.size).toBe(1);
    expect(module1Metadata.has("task1")).toBe(true);

    const module2Metadata = result.get(Module2)!;
    expect(module2Metadata.size).toBe(1);
    expect(module2Metadata.has("task2")).toBe(true);
  });

  it("应该使用默认的 FIXED_RATE 模式", () => {
    class TestModule {}

    const handlers: HandlerMetadata[] = [
      {
        type: "schedule",
        options: {
          interval: 5000,
          // 不指定 mode
        },
        method: function task1() {},
        methodName: "task1",
        module: TestModule,
        wrap: () => {},
      },
    ];

    const result = extractScheduleMetadata(handlers);

    const moduleMetadata = result.get(TestModule)!;
    const taskMetadata = moduleMetadata.get("task1")!;
    expect(taskMetadata.mode).toBe(ScheduleMode.FIXED_RATE);
  });

  it("应该处理空的 handlers 数组", () => {
    const result = extractScheduleMetadata([]);
    expect(result.size).toBe(0);
  });

  it("应该忽略非 schedule 类型的 handlers", () => {
    class TestModule {}

    const handlers: HandlerMetadata[] = [
      {
        type: "action",
        options: {},
        method: function action1() {},
        methodName: "action1",
        module: TestModule,
        wrap: () => {},
      },
      {
        type: "cache",
        options: {},
        method: function cache1() {},
        methodName: "cache1",
        module: TestModule,
        wrap: () => {},
      },
    ];

    const result = extractScheduleMetadata(handlers);
    expect(result.size).toBe(0);
  });
});

