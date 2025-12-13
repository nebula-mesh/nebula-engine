import { z } from "zod";

/**
 * 构建参数验证 Schema
 * 将参数数组转换为对象格式：{"0": schema0, "1": schema1, ...}
 *
 * @param schemas 参数校验 Schema 数组
 * @returns ZodObject Schema
 *
 * @example
 * ```ts
 * const schemas = [z.string(), z.number()];
 * const paramsSchema = buildParamsSchema(schemas);
 * // 等价于 z.object({ "0": z.string(), "1": z.number() })
 * ```
 */
export function buildParamsSchema(
  schemas: z.ZodTypeAny[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (let i = 0; i < schemas.length; i++) {
    shape[String(i)] = schemas[i];
  }
  return z.object(shape);
}

/**
 * 解析并验证请求体中的下标参数
 * 请求格式：{"0":"value1","1":"value2",...}
 * 根据 metadata 中的 params 数组定义来确定参数数量和类型
 *
 * @param body 请求体对象
 * @param schemas 参数校验 Schema 数组
 * @returns 验证结果，成功时返回参数数组，失败时返回 ZodError
 *
 * @example
 * ```ts
 * const body = { "0": "Alice", "1": 25 };
 * const schemas = [z.string(), z.number()];
 * const result = parseAndValidateParams(body, schemas);
 * // result.success === true
 * // result.data === ["Alice", 25]
 * ```
 */
export function parseAndValidateParams(
  body: any,
  schemas: z.ZodTypeAny[]
): { success: true; data: any[] } | { success: false; error: z.ZodError } {
  if (!body || typeof body !== "object") {
    body = {};
  }

  // 如果没有定义参数，直接返回空数组
  if (schemas.length === 0) {
    return { success: true, data: [] };
  }

  // 构建对象格式的验证 Schema：{"0": schema0, "1": schema1, ...}
  const paramsSchema = buildParamsSchema(schemas);

  // 一次性验证所有参数
  const validation = paramsSchema.safeParse(body);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // 将验证后的对象转换为数组，按索引顺序提取值
  const validatedData: any[] = [];
  for (let i = 0; i < schemas.length; i++) {
    validatedData[i] = validation.data[String(i)];
  }

  return {
    success: true,
    data: validatedData,
  };
}

/**
 * 构建 Action 路由路径
 * 格式：引擎prefix + 模块名 + Handler名
 *
 * @param enginePrefix 引擎路由前缀（可选）
 * @param moduleName 模块名
 * @param handlerName Handler 方法名
 * @returns 规范化后的路由路径
 *
 * @example
 * ```ts
 * buildActionPath("/api", "user-service", "createUser")
 * // => "/api/user-service/createUser"
 *
 * buildActionPath("", "user-service", "createUser")
 * // => "/user-service/createUser"
 * ```
 */
export function buildActionPath(
  enginePrefix: string,
  moduleName: string,
  handlerName: string
): string {
  // 移除prefix末尾的斜杠，然后拼接路径，最后清理多余的斜杠
  const normalizedPrefix = enginePrefix.replace(/\/+$/, "");
  return `/${normalizedPrefix}/${moduleName}/${handlerName}`
    .replace(/\/+/g, "/")
    .replace(/^\/\//, "/"); // 处理prefix为空时产生的双斜杠
}

