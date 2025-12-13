import { z } from "zod";

/**
 * Action 信息（用于生成客户端代码）
 */
export interface ActionInfo {
  /**
   * 动作描述
   */
  description?: string;

  /**
   * 参数校验 Schema（使用 zod）
   */
  params: z.ZodTypeAny[];

  /**
   * 返回值校验 Schema（使用 zod）
   */
  returns?: z.ZodTypeAny;

  /**
   * 是否流式返回（默认 false）
   */
  stream?: boolean;

  /**
   * 是否幂等（默认 false）
   */
  idempotence?: boolean;

  /**
   * 参数名称数组（从方法定义中提取）
   */
  paramNames?: string[];
}

/**
 * 模块信息（用于生成客户端代码）
 */
export interface ModuleInfo {
  /**
   * 模块名称
   */
  name: string;

  /**
   * 模块的所有 actions
   */
  actions: Record<string, ActionInfo>;
}

