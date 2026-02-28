# ConcurrencyLockPlugin - 并发锁插件

防止并发调用导致重复执行耗时操作的插件，支持内存锁和 Redis 分布式锁。

## 解决的问题

在业务场景中，某些操作可能是耗时的（比如调用大模型生成内容、查询第三方 API 等），如果多个请求同时触发这些操作，会导致：

1. **资源浪费**：同样的耗时操作被执行多次
2. **数据不一致**：并发写入可能导致数据覆盖
3. **系统压力**：瞬间大量重复请求

### 典型场景

```typescript
@Module("article")
class ArticleService {
  // 获取文章详情，如果不存在则调用大模型生成
  async getDetailOrGenerate(articleId: string): Promise<Article> {
    // 1. 先查询数据库
    const existing = await db.article.find(articleId);
    if (existing) return existing;

    // 2. 不存在，调用大模型生成（耗时操作）
    const generated = await llm.generate(articleId);

    // 3. 写入数据库
    await db.article.create(generated);
    return generated;
  }
}
```

如果没有并发控制，多个请求同时调用 `getDetailOrGenerate("123")`：

```
请求A ──────────────> 调用大模型 ──────────────> 写入DB
请求B ──────────────> 调用大模型 ──────────────> 写入DB (覆盖A的结果!)
请求C ──────────────> 调用大模型 ──────────────> 写入DB
```

使用 `@ConcurrencyLock` 装饰器后：

```
请求A ──────────────> 获取锁 ──────────────> 调用大模型 ──> 写入DB ──> 释放锁
请求B ──等待锁────────> (等待中...) ─────────> 检测到锁释放 ──> 获取锁 ──> 查询DB ──> 返回
请求C ──等待锁────────> (等待中...) ─────────> 检测到锁释放 ──> 获取锁 ──> 查询DB ──> 返回
```

## 安装

```typescript
import { ConcurrencyLockPlugin } from "nebula-engine";
```

## 快速开始

### 1. 基本用法

```typescript
import { Factory } from "nebula-engine";
import { ActionPlugin, ConcurrencyLockPlugin } from "nebula-engine";

// 创建插件
const concurrencyLockPlugin = new ConcurrencyLockPlugin();

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  concurrencyLockPlugin,
);

@Module("article")
class ArticleService {
  @ConcurrencyLock()
  @Action({
    params: [z.string()],
    returns: ArticleSchema,
  })
  async getDetailOrGenerate(articleId: string): Promise<Article> {
    const existing = await db.article.find(articleId);
    if (existing) return existing;

    const generated = await llm.generate(articleId);
    await db.article.create(generated);
    return generated;
  }
}
```

### 2. 使用 Redis 分布式锁

在多实例部署时，需要使用 Redis 实现分布式锁：

```typescript
import Redis from "ioredis";

const redis = new Redis({
  host: "localhost",
  port: 6379,
});

const concurrencyLockPlugin = new ConcurrencyLockPlugin({
  redisClient: redis,
});

const { Module } = Factory.create(new ActionPlugin(), concurrencyLockPlugin);
```

## 配置选项

### 装饰器选项

| 选项      | 类型                      | 默认值   | 说明                                  |
| --------- | ------------------------- | -------- | ------------------------------------- |
| `key`     | `(...args: any[]) => any` | 所有入参 | 自定义锁 key 生成函数                 |
| `timeout` | `number`                  | 60000    | 锁超时时间 (ms)，同时也是最大等待时间 |

#### 自定义 Key

```typescript
@ConcurrencyLock({
  // 只用 articleId 生成锁，排除其他动态参数
  key: (articleId: string, options?: { draft: boolean }) => ({ articleId }),
})
@Action({ params: [z.string(), z.object({ draft: z.boolean() }).optional()] })
async getDetailOrGenerate(articleId: string, options?: { draft: boolean }): Promise<Article> {
  // ...
}
```

### 模块级配置

```typescript
@Module("article", {
  concurrencyLockDefaultTimeout: 30000, // 模块默认超时 30s
})
class ArticleService {
  // ...
}
```

## 工作原理

### 1. 锁 Key 格式

```
concurrency:{moduleName}:{methodName}:{hash}
```

例如：`concurrency:article:getDetailOrGenerate:a1b2c3d4e5f6g7h8`

- **精确到方法级别**：避免不同方法的参数碰撞
- **基于参数 hash**：相同参数产生相同锁 key

### 2. 锁获取流程

```
1. 尝试获取锁 (SET NX EX)
   ├── 成功 → 执行方法 → 释放锁
   └── 失败 → 进入等待流程

2. 等待锁释放
   ├── 循环检查锁状态（间隔 50-100ms 随机退避）
   ├── 检测锁是否已过期（持有者崩溃）
   │   └── 过期则尝试"偷取"锁继续执行
   └── 等待超时（默认 60s）

3. 兜底策略
   └── 等待超时后放行，不再加锁
      （此时资源应该已生成，直接返回结果）
```

### 3. 核心设计

#### 锁超时保护

- 锁的最大持续时间 = `timeout`（默认 60s）
- 防止持有锁的实例崩溃导致死锁

#### 锁"偷取"机制

等待过程中持续检测锁是否过期：

```typescript
while (Date.now() - startTime < timeout) {
  // 1. 检查锁是否释放
  if (!(await isLocked(key))) {
    const acquired = await acquire(key, ttl);
    if (acquired) return true;
  }

  // 2. 检查锁是否过期（持有者崩溃）
  if (await isExpired(key)) {
    const stolen = await acquire(key, ttl);
    if (stolen) return true;
  }

  // 3. 随机退避，避免惊群
  await sleep(50 + Math.random() * 50);
}

// 4. 超时兜底：放行请求
return true;
```

#### 随机退避

- 每次检查间隔 50-100ms 随机延迟
- 避免多个等待者同时醒来抢锁（惊群效应）

## 使用场景

### 场景 1：缓存穿透防护

```typescript
@ConcurrencyLock()
@Cache({ ttl: 3600000 }) // 缓存 1 小时
async getUserById(userId: string): Promise<User> {
  // 并发请求只会执行一次数据库查询
  return await db.user.find(userId);
}
```

### 场景 2：第三方 API 调用限流

```typescript
@ConcurrencyLock({
  key: (query: string) => ({ query }), // 按查询词加锁
  timeout: 30000,
})
async searchExternalApi(query: string): Promise<SearchResult> {
  // 相同查询词的请求会等待，避免重复调用
  return await externalApi.search(query);
}
```

### 场景 3：分布式任务初始化

```typescript
@ConcurrencyLock({
  key: (taskId: string) => ({ taskId }),
  timeout: 120000, // 任务可能耗时较长
})
async initializeTask(taskId: string): Promise<Task> {
  const existing = await taskQueue.get(taskId);
  if (existing) return existing;

  const task = await taskQueue.create(taskId);
  await processor.start(task);
  return task;
}
```

## 注意事项

1. **锁粒度**：默认使用所有参数生成锁 key，确保精确到具体资源
2. **超时时间**：根据实际耗时操作的时间设置，建议为实际耗时的 2-3 倍
3. **幂等性**：被阻塞放行后的请求，不再加锁直接执行，需确保方法幂等
4. **Redis 连接**：多实例部署时必须使用 Redis，否则各实例独立加锁无效

## 错误处理

插件不会主动抛出错误，而是：

- 等待超时后**兜底放行**（不再加锁）
- 建议在方法内部做好数据存在性检查

```typescript
@ConcurrencyLock()
async getDetailOrGenerate(articleId: string): Promise<Article> {
  // 即使被兜底放行，也要先检查数据是否存在
  const existing = await db.article.find(articleId);
  if (existing) return existing;

  // 兜底放行后可能已有其他请求生成数据，再次检查
  const generated = await db.article.find(articleId);
  if (generated) return generated;

  // 确实没有，才生成
  return await generateAndSave(articleId);
}
```

## API 参考

### ConcurrencyLockPlugin

```typescript
new ConcurrencyLockPlugin(options?: {
  redisClient?: RedisClient;  // 可选，传入则使用 Redis 锁
})
```

### @ConcurrencyLock

```typescript
@ConcurrencyLock({
  key?: (...args: any[]) => any;  // 自定义 key 生成函数
  timeout?: number;                // 锁超时时间 (ms)
})
```

### 导出的类型

```typescript
import type {
  ConcurrencyLockOptions,
  ConcurrencyLockModuleOptions,
  LockAdapter,
  RedisLockAdapterOptions,
} from "nebula-engine";
```
