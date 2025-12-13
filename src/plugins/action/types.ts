import { z } from "zod";
import { MiddlewareHandler } from "hono";

/**
 * Action装饰器配置选项
 */
export interface ActionOptions {
  /**
   * 动作描述
   */
  description?: string;

  /**
   * 参数校验 Schema（使用 zod）
   * 数组顺序对应方法参数的顺序
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
   * 路由专属中间件
   */
  middlewares?: MiddlewareHandler[];
}

/**
 * ActionPlugin的Module配置
 */
export interface ActionModuleOptions {
  /**
   * 模块级路由中间件
   */
  actionMiddlewares?: MiddlewareHandler[];
}

