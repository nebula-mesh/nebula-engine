import { HandlerMetadata } from "../../core/types";
import { ScheduleMetadata, ScheduleMode } from "./types";

/**
 * 从 HandlerMetadata 中提取调度元数据
 * @param handlers Handler 元数据数组
 * @returns 调度元数据映射（模块类 -> 方法名 -> 元数据）
 */
export function extractScheduleMetadata(
  handlers: HandlerMetadata[]
): Map<any, Map<string, ScheduleMetadata>> {
  const result = new Map<any, Map<string, ScheduleMetadata>>();

  // 筛选出所有 type="schedule" 的 handlers
  const scheduleHandlers = handlers.filter(
    (handler) => handler.type === "schedule"
  );

  for (const handler of scheduleHandlers) {
    const moduleClass = handler.module;
    const methodName = handler.methodName;
    const options = handler.options || {};

    // 获取或创建模块的元数据映射
    if (!result.has(moduleClass)) {
      result.set(moduleClass, new Map());
    }

    const moduleMetadata = result.get(moduleClass)!;

    // 添加方法元数据
    moduleMetadata.set(methodName, {
      name: methodName,
      interval: options.interval,
      mode: (options.mode as ScheduleMode) || ScheduleMode.FIXED_RATE,
    });
  }

  return result;
}

