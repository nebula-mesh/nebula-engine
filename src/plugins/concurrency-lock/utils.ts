import { createHash } from "crypto";
import * as ejson from "ejson";

/**
 * 生成并发锁的 key
 * 格式：concurrency:{moduleName}:{methodName}:{hash}
 *
 * @param moduleName 模块名
 * @param methodName 方法名
 * @param args 方法参数
 * @param keyFunction 可选的自定义 key 生成函数
 * @returns 完整的锁 key
 *
 * @example
 * ```typescript
 * generateLockKey("article", "getDetailOrGenerate", ["123"], undefined)
 * // => "concurrency:article:getDetailOrGenerate:a1b2c3d4..."
 *
 * generateLockKey("article", "getDetailOrGenerate", ["123", { draft: true }], (id, opts) => ({ id }))
 * // => "concurrency:article:getDetailOrGenerate:e5f6g7h8..."
 * ```
 */
export function generateLockKey(
  moduleName: string,
  methodName: string,
  args: any[],
  keyFunction?: (...args: any[]) => any,
): string {
  // 如果提供了 key 函数，使用它的返回值；否则使用 args
  const keyData = keyFunction ? keyFunction(...args) : args;

  // 使用 ejson 序列化（支持更多数据类型）
  const serialized = ejson.stringify(keyData);

  // 生成 hash（使用 SHA256，取前 16 位）
  const hash = createHash("sha256")
    .update(serialized)
    .digest("hex")
    .substring(0, 16);

  // 返回格式：concurrency:模块名:方法名:hash
  return `concurrency:${moduleName}:${methodName}:${hash}`;
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
