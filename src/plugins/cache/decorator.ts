import { Handler } from "../../core/decorators";
import { CacheOptions } from "./types";

/**
 * Cache装饰器
 * 用于标记需要缓存的方法
 * 
 * @example
 * ```typescript
 * @Cache({ ttl: 5000 })
 * async getUser(id: number) {
 *   return { id, name: "John" };
 * }
 * ```
 */
export function Cache(options: CacheOptions = {}) {
  return Handler({
    type: "cache",
    options: {
      ttl: options.ttl ?? 60000, // 默认1分钟
      key: options.key, // key 函数
      enabled: options.enabled ?? true,
    },
  });
}

