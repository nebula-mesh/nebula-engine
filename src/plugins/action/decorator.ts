import { Handler } from "../../core/decorators";
import { ActionOptions } from "./types";

/**
 * Action装饰器（Handler的语法糖封装）
 * 固定type="action"，用于标注动作处理方法
 */
export function Action(options: ActionOptions) {
  return Handler({
    type: "action",
    options,
  });
}

