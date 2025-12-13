import { Handler } from "../../core/decorators";
import { ScheduleOptions, ScheduleMode } from "./types";

/**
 * Schedule装饰器
 * 用于标记需要定时调度的方法
 * 
 * @example
 * ```typescript
 * @Schedule({ interval: 5000, mode: ScheduleMode.FIXED_RATE })
 * async syncData() {
 *   // 定时执行的任务
 * }
 * ```
 */
export function Schedule(options: ScheduleOptions) {
  return Handler({
    type: "schedule",
    options: {
      interval: options.interval,
      mode: options.mode || ScheduleMode.FIXED_RATE,
    },
  });
}

