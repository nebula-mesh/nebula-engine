---
name: "nebula-engine"
description: "Nebula Engine 微服务框架。Invoke when user asks about the framework architecture, plugin system, or how to create microservices with this framework."
---

# Nebula Engine - 微服务框架

Nebula Engine 是一个基于 Hono 的微服务引擎框架，采用**优先级驱动的洋葱圈模型**插件系统，让你可以快速构建高性能微服务。

---

## 问题索引

遇到以下问题或需求时，请查阅对应的参考文档：

### 我想...

| 需求场景 | 推荐阅读 |
|----------|----------|
| **快速创建一个微服务** | [快速开始](#快速开始) |
| **定义业务接口方法** | [Action Plugin](references/action-plugin.md) |
| **创建 HTTP API 接口** | [Route Plugin](references/route-plugin.md) |
| **添加接口缓存** | [Cache Plugin](references/cache-plugin.md) |
| **防止重复请求/并发控制** | [ConcurrencyLock Plugin](references/concurrency-lock-plugin.md) |
| **创建定时任务** | [Schedule Plugin](references/schedule-plugin.md) |
| **管理运行时配置** | [DynamicConfig Plugin](references/dynamic-config-plugin.md) |
| **生成客户端 SDK** | [ClientCode Plugin](references/client-code-plugin.md) |
| **监控请求链路/性能** | [Telemetry Plugin](references/telemetry-plugin.md) |
| **实现优雅停机** | [GracefulShutdown Plugin](references/graceful-shutdown-plugin.md) |

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 服务停止时请求被中断 | 使用 [GracefulShutdown Plugin](references/graceful-shutdown-plugin.md) 优雅停机 |
| 重复扣款/重复提交 | 使用 [ConcurrencyLock Plugin](references/concurrency-lock-plugin.md) 分布式锁 |
| 频繁查询数据库 | 使用 [Cache Plugin](references/cache-plugin.md) 添加缓存 |
| 需要定时同步数据 | 使用 [Schedule Plugin](references/schedule-plugin.md) 定时任务 |
| 需要动态修改配置 | 使用 [DynamicConfig Plugin](references/dynamic-config-plugin.md) 热更新配置 |
| 需要追踪请求链路 | 使用 [Telemetry Plugin](references/telemetry-plugin.md) 分布式追踪 |
| 多个服务需要互相调用 | 使用 [ClientCode Plugin](references/client-code-plugin.md) 生成 SDK |

---

## 快速开始

### 1. 安装框架

```bash
npm install nebula-engine
```

### 2. 创建你的第一个服务

```typescript
import { Factory, ActionPlugin, RoutePlugin, z } from "nebula-engine";

const { Module, registry } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin()
);

@Module("user")
class UserService {
  @Action({})
  async getUser(id: string) {
    return { id, name: "John" };
  }
}

registry.start({ port: 3000 });
```

### 3. 调用服务

```typescript
// 使用生成的客户端 SDK（推荐）
import { MicroserviceClient } from "./generated/client";

const client = new MicroserviceClient({ baseUrl: "http://localhost:3000" });
const user = await client.user.getUser("1");

// 或直接 HTTP 请求
const response = await fetch("http://localhost:3000/user/getUser", {
  method: "POST",
  headers: { "Content-Type": "application/ejson" },
  body: JSON.stringify({ "0": "1" }),
});
```

---

## 框架架构

### 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                        Factory                               │
│                   (引擎工厂类)                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Microservice│  │  Module     │  │  Decorators │        │
│  │ (服务实例)  │  │  (模块定义) │  │  (装饰器)   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     插件系统 (Plugin System)                │
│              优先级驱动的洋葱圈模型                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ SYSTEM  │ │LOGGING  │ │ BUSINESS│ │  ROUTE  │   ...   │
│  │  (50)   │ │ (200)   │ │ (300)   │ │ (1000)  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 模块与装饰器

```typescript
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),    // 核心：方法注册
  new RoutePlugin(),     // HTTP 路由
  new CachePlugin(),     // 缓存
  // ... 其他插件
);

// 定义模块
@Module("user", { configOption: "value" })
class UserService {
  // Action: 定义业务方法（自动生成客户端 SDK）
  @Action({ params: [z.string()], returns: z.object({...}) })
  getUser(id: string) { ... }

  // Route: 定义 HTTP 路由
  @Route({ method: "GET", path: "/users/:id" })
  getUserRoute(c: any) { ... }

  // Cache: 添加缓存
  @Cache({ ttl: 60000 })
  @Action({})
  cachedMethod() { ... }

  // Config: 动态配置
  @Config({ key: "timeout", defaultValue: 5000 })
  timeout!: number;
}
```

---

## 插件系统详解

### 插件优先级

框架使用优先级驱动的洋葱圈模型，插件按优先级从低到高执行：

| 优先级 | 值 | 用途 | 插件示例 |
|--------|-----|------|----------|
| SYSTEM | 50 | 系统核心功能 | GracefulShutdownPlugin |
| SECURITY | 100 | 安全相关 | - |
| LOGGING | 200 | 日志、监控 | TelemetryPlugin |
| BUSINESS | 300 | 业务逻辑 | SchedulePlugin, DynamicConfigPlugin |
| PERFORMANCE | 400 | 性能优化 | CachePlugin, ConcurrencyLockPlugin |
| ROUTE | 1000 | 路由注册 | ActionPlugin, RoutePlugin, ClientCodePlugin |

### 插件组合推荐

#### 基础服务（最小配置）

```typescript
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin({ prefix: "/api" })
);
```

#### 生产级服务

```typescript
const { Module, Microservice } = Factory.create(
  new GracefulShutdownPlugin(),    // 优雅停机
  new TelemetryPlugin({            // 监控
    serviceName: "my-service",
    exporter: new ConsoleExporter(),
  }),
  new DynamicConfigPlugin(),       // 动态配置
  new CachePlugin(),               // 缓存
  new ConcurrencyLockPlugin(),    // 并发控制
  new ActionPlugin(),
  new ClientCodePlugin(),          // 生成 SDK
  new RoutePlugin({ prefix: "/api" })
);
```

#### 定时任务服务

```typescript
const { Module, Microservice } = Factory.create(
  new GracefulShutdownPlugin(),
  new SchedulePlugin({ useMockEtcd: true }),
  new ActionPlugin(),
  new ClientCodePlugin(),
);
```

---

## 插件列表

### 核心插件

| 插件 | 功能 | 装饰器 | 参考文档 |
|------|------|--------|----------|
| **ActionPlugin** | 基于下标的参数传递、Zod 校验、自动生成 SDK | `@Action` | [action-plugin.md](references/action-plugin.md) |
| **RoutePlugin** | HTTP 路由注册 | `@Route` | [route-plugin.md](references/route-plugin.md) |

### 功能插件

| 插件 | 功能 | 装饰器 | 参考文档 |
|------|------|--------|----------|
| **CachePlugin** | 内存/Redis 缓存 | `@Cache` | [cache-plugin.md](references/cache-plugin.md) |
| **SchedulePlugin** | 分布式定时任务（基于 Etcd） | `@Schedule` | [schedule-plugin.md](references/schedule-plugin.md) |
| **TelemetryPlugin** | 分布式追踪和指标 | - | [telemetry-plugin.md](references/telemetry-plugin.md) |
| **DynamicConfigPlugin** | 动态配置（Etcd/环境变量） | `@Config` | [dynamic-config-plugin.md](references/dynamic-config-plugin.md) |
| **ConcurrencyLockPlugin** | 分布式并发锁 | `@ConcurrencyLock` | [concurrency-lock-plugin.md](references/concurrency-lock-plugin.md) |
| **ClientCodePlugin** | 客户端 SDK 自动生成 | - | [client-code-plugin.md](references/client-code-plugin.md) |

### 系统插件

| 插件 | 功能 | 参考文档 |
|------|------|----------|
| **GracefulShutdownPlugin** | 优雅停机 | [graceful-shutdown-plugin.md](references/graceful-shutdown-plugin.md) |

---

## 最佳实践

### 1. 类型安全

始终使用 Zod 定义参数和返回值类型：

```typescript
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
});

@Action({
  params: [z.string()],
  returns: UserSchema.nullable(),
})
getUser(id: string) {
  return { id, name: "John", age: 30 };
}
```

### 2. 配置管理

使用 DynamicConfigPlugin 集中管理配置：

```typescript
@Module("service")
class MyService {
  @Config({ key: "max-retries", defaultValue: 3 })
  maxRetries!: number;

  @Config({ key: "feature-flags", schema: FeatureFlagsSchema })
  featureFlags!: FeatureFlags;
}
```

### 3. 错误处理

在 Route 中统一处理错误：

```typescript
new RoutePlugin({
  errorTransformer: (c, error, handler) => {
    return c.json({
      error: error.message,
      path: handler.path,
      timestamp: Date.now(),
    }, 500);
  },
})
```

### 4. 监控集成

使用 TelemetryPlugin 收集关键指标：

```typescript
new TelemetryPlugin({
  serviceName: "my-service",
  exporter: new SpanCollector({ batchSize: 10 }, new OtlpExporter()),
  sampling: { rate: 0.1 },  // 生产环境采样 10%
})
```

---

## 常见场景示例

### 场景：用户服务

```typescript
import { Factory, ActionPlugin, RoutePlugin, CachePlugin, TelemetryPlugin, GracefulShutdownPlugin, Module, Action, Cache, ConsoleExporter } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new GracefulShutdownPlugin(),
  new TelemetryPlugin({ serviceName: "user-service", exporter: new ConsoleExporter() }),
  new CachePlugin(),
  new ActionPlugin(),
  new ClientCodePlugin(),
  new RoutePlugin({ prefix: "/api" })
);

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

@Module("user")
class UserService {
  private users = new Map<string, z.infer<typeof UserSchema>>();

  @Cache({ ttl: 60000 })
  @Action({ params: [z.string()], returns: UserSchema.nullable() })
  getUser(id: string) {
    return this.users.get(id) || null;
  }

  @Action({ params: [UserSchema], returns: UserSchema })
  createUser(user: z.infer<typeof UserSchema>) {
    this.users.set(user.id, user);
    return user;
  }
}

const engine = new Microservice({ name: "user-service", version: "1.0.0" });
engine.start({ port: 3000 });
```

### 场景：订单处理（防重复）

```typescript
@Module("order")
class OrderService {
  @ConcurrencyLock({ key: "order:${params[0]}", ttl: 30000 })
  @Action({ params: [z.string(), z.number()], returns: z.object({ orderId: z.string() }) })
  async createOrder(productId: string, quantity: number) {
    // 防止重复下单
    const order = await processOrder(productId, quantity);
    return order;
  }
}
```

---

## 下一步

- 阅读 [Action Plugin](references/action-plugin.md) 了解方法定义
- 阅读 [Route Plugin](references/route-plugin.md) 了解 HTTP 接口
- 阅读 [ClientCode Plugin](references/client-code-plugin.md) 了解 SDK 生成
- 阅读 [插件组合示例](#插件组合推荐) 选择适合你的配置
