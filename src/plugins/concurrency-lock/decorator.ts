import { Handler } from "../../core/decorators";
import { ConcurrencyLockOptions } from "./types";

/**
 * ConcurrencyLock 装饰器
 * 用于标记需要并发控制的方法
 *
 * @example
 * ```typescript
 * @ConcurrencyLock({
 *   key: (id: string) => ({ id }),
 *   timeout: 60000
 * })
 * @Action({ params: [z.string()], returns: ArticleSchema })
 * async getDetailOrGenerate(id: string): Promise<Article> {
 *   // 并发安全的实现
 * }
 * ```
 */
export function ConcurrencyLock(options?: ConcurrencyLockOptions) {
  return Handler({
    type: "concurrency-lock",
    options: options || {},
  });
}
