# ConcurrencyLock 插件

并发锁插件，防止并发调用导致重复执行耗时操作。

## 注册

```typescript
// 内存锁（单实例）
const lockPlugin = new ConcurrencyLockPlugin();

// Redis 锁（分布式）
const lockPlugin = new ConcurrencyLockPlugin({
  redisClient,
  defaultLockTimeout: 30000,
});
```

## 使用

```typescript
class GenerateService {
  @ConcurrencyLock({
    key: (userId: string, type: string) => `${userId}:${type}`,
  })
  async generateReport(userId: string, type: string) {
    // 耗时操作，同一 key 不会并发执行
  }
}
```

## 行为

- 同一 key 的请求**串行执行**
- 后续请求等待前一个完成或超时
- 超时后抛出 `ConcurrencyLockTimeoutError`

## 优先级

优先级为 `500`，在 Cache (400) 之后执行。缓存未命中时才加锁，避免重复计算。
