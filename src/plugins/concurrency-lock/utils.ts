import { createHash } from "crypto";
import * as ejson from "ejson";

/**
 * 生成并发锁的 key
 * 格式：{serviceName}:{moduleName}:{methodName}:{hash}
 * 注意：不包含前缀，前缀由适配器添加
 *
 * @param serviceName 服务名（避免不同服务间 key 冲突）
 * @param moduleName 模块名
 * @param methodName 方法名
 * @param args 方法参数
 * @param keyFunction 可选的自定义 key 生成函数
 * @returns 锁 key（不含前缀）
 *
 * @example
 * ```typescript
 * generateLockKey("user-service", "article", "getDetailOrGenerate", ["123"], undefined)
 * // => "user-service:article:getDetailOrGenerate:a1b2c3d4..."
 * ```
 */
export function generateLockKey(
  serviceName: string,
  moduleName: string,
  methodName: string,
  args: any[],
  keyFunction?: (...args: any[]) => any,
): string {
  // 如果提供了 key 函数，使用它的返回值；否则使用 args
  const keyData = keyFunction ? keyFunction(...args) : args;

  // 使用 ejson 序列化（支持更多数据类型）
  const serialized = ejson.stringify(keyData);

  // 生成 hash（使用 SHA256，取前 32 位以提高安全性）
  const hash = createHash("sha256")
    .update(serialized)
    .digest("hex")
    .substring(0, 32);

  // 返回格式：服务名:模块名:方法名:hash（不含前缀）
  return `${serviceName}:${moduleName}:${methodName}:${hash}`;
}

/**
 * 生成简单的 hash（用于内部标识）
 *
 * @param data 任意可序列化的数据
 * @returns 16 位 hash
 */
export function generateHash(data: any): string {
  const serialized = ejson.stringify(data);
  return createHash("sha256").update(serialized).digest("hex").substring(0, 16);
}

/**
 * 睡眠函数
 *
 * @param ms 毫秒数
 * @returns Promise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
