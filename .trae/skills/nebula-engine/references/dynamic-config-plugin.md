# DynamicConfig Plugin

DynamicConfig（动态配置）插件提供运行时配置管理，支持从 Etcd、环境变量或默认值读取配置，并支持配置变化监听和热更新。

## 快速开始

```typescript
import { Factory, ActionPlugin, DynamicConfigPlugin, Module, Action, Config } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new DynamicConfigPlugin()
);

const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});

@Module("user")
class UserService {
  @Config({
    key: "max-retry",
    defaultValue: 3,
  })
  maxRetry!: number;

  @Action({})
  getUser(id: string) {
    console.log(`最大重试次数: ${this.maxRetry}`);
    return { id, name: "张三" };
  }
}

engine.start({ port: 3000 });
```

## 工作原理

DynamicConfig 插件通过装饰器为类属性注入配置值：

1. **配置定义** - 使用 `@Config` 装饰器标记属性
2. **配置加载** - 服务启动时加载配置（Etcd > ENV > Default）
3. **属性注入** - 配置值自动注入到类属性
4. **变化监听** - 支持监听配置变化并热更新
5. **Schema 校验** - 支持 Zod Schema 验证配置值

## 配置优先级

配置优先级从高到低：

```
ETCD > ENV > DEFAULT
```

| 来源 | 示例 | 说明 |
|------|------|------|
| Etcd | `service/module/key` | 优先级最高，可远程修改 |
| 环境变量 | `MAX_RETRY` | key 转大写下划线格式 |
| 默认值 | `defaultValue: 3` | 兜底值 |

## 装饰器选项

### @Config 装饰器

| 选项 | 类型 | 说明 |
|------|------|------|
| key | `string` | 配置键名 |
| defaultValue | `any` | 默认值 |
| schema | `ZodSchema` | Zod 验证 Schema |
| onChange | `(value: any) => void` | 配置变化回调 |

## 基本用法

### 基础类型

```typescript
@Module("config")
class ConfigService {
  @Config({ key: "timeout", defaultValue: 5000 })
  timeout!: number;

  @Config({ key: "debug", defaultValue: false })
  debug!: boolean;

  @Config({ key: "name", defaultValue: "default" })
  name!: string;
}
```

### 复杂对象

```typescript
const FeatureFlagsSchema = z.object({
  enableNewUI: z.boolean(),
  maxUploadSize: z.number(),
});

@Module("feature")
class FeatureService {
  @Config({
    key: "feature-flags",
    schema: FeatureFlagsSchema,
    defaultValue: {
      enableNewUI: false,
      maxUploadSize: 10,
    },
  })
  featureFlags!: { enableNewUI: boolean; maxUploadSize: number };
}
```

### 带验证的配置

```typescript
@Module("validation")
class ValidationService {
  @Config({
    key: "port",
    schema: z.number().min(1).max(65535),
    defaultValue: 3000,
  })
  port!: number;

  @Config({
    key: "rate-limit",
    schema: z.number().min(1).max(1000),
    defaultValue: 100,
  })
  rateLimit!: number;
}
```

## 配置存储

### MemoryConfigStorage（内存存储）

默认使用内存存储，适合单机开发：

```typescript
import { MemoryConfigStorage } from "nebula-engine";

new DynamicConfigPlugin({
  storage: new MemoryConfigStorage(),
})
```

### EtcdConfigStorage（Etcd 存储）

生产环境使用 Etcd 存储，支持分布式配置：

```typescript
import { EtcdConfigStorage } from "nebula-engine";

new DynamicConfigPlugin({
  storage: new EtcdConfigStorage({
    hosts: ["http://etcd1:2379", "http://etcd2:2379"],
  }),
})
```

## 使用场景

### 环境变量配置

配置自动从环境变量读取：

```typescript
@Module("env")
class EnvConfigService {
  // key: "database-url" -> env: "DATABASE_URL"
  @Config({ key: "database-url", defaultValue: "localhost:5432" })
  databaseUrl!: string;

  // key: "api-key" -> env: "API_KEY"
  @Config({ key: "api-key", defaultValue: "" })
  apiKey!: string;
}
```

```bash
# 设置环境变量
export DATABASE_URL="postgres://user:pass@db:5432/mydb"
export API_KEY="secret-key-123"
```

### 配置热更新

监听配置变化并自动更新：

```typescript
@Module("hot-update")
class HotUpdateService {
  @Config({
    key: "maintenance-mode",
    defaultValue: false,
    onChange: (value: boolean) => {
      console.log(`维护模式已 ${value ? "开启" : "关闭"}`);
    },
  })
  maintenanceMode!: boolean;
}
```

### 多模块独立配置

每个模块可以有自己的配置：

```typescript
@Module("user", {
  configPrefix: "user-service",
})
class UserService {
  @Config({ key: "cache-ttl", defaultValue: 60000 })
  cacheTtl!: number;
}

@Module("order", {
  configPrefix: "order-service",
})
class OrderService {
  @Config({ key: "cache-ttl", defaultValue: 300000 })
  cacheTtl!: number;
}
```

## 配置管理 API

### 设置配置

```typescript
const plugin = new DynamicConfigPlugin();

await plugin.setConfig("my-service/user/max-retry", 5);
```

### 获取配置

```typescript
const value = await plugin.getConfig("my-service/user/max-retry");
```

### 删除配置

```typescript
await plugin.deleteConfig("my-service/user/max-retry");
```

### 获取所有配置

```typescript
const allConfig = await plugin.getAllConfig("my-service");
```

## 完整示例

### 服务端定义

```typescript
import { Factory, ActionPlugin, DynamicConfigPlugin, Module, Action, Config, MemoryConfigStorage } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new DynamicConfigPlugin({
    storage: new MemoryConfigStorage(),
  })
);

const engine = new Microservice({
  name: "config-service",
  version: "1.0.0",
  prefix: "/api",
});

const RateLimitSchema = z.object({
  maxRequests: z.number().min(1),
  windowMs: z.number().min(1000),
});

@Module("rate-limit")
class RateLimitService {
  @Config({
    key: "default-limit",
    schema: RateLimitSchema,
    defaultValue: {
      maxRequests: 100,
      windowMs: 60000,
    },
    onChange: (value) => {
      console.log("限流配置已更新:", value);
    },
  })
  defaultLimit!: { maxRequests: number; windowMs: number };

  @Config({
    key: "vip-limit-multiplier",
    defaultValue: 10,
  })
  vipLimitMultiplier!: number;

  @Action({})
  checkRateLimit(userId: string, isVip: boolean) {
    const limit = this.defaultLimit;
    const multiplier = isVip ? this.vipLimitMultiplier : 1;

    return {
      allowed: true,
      maxRequests: limit.maxRequests * multiplier,
      windowMs: limit.windowMs,
    };
  }
}

@Module("feature")
class FeatureService {
  @Config({
    key: "beta-features",
    defaultValue: {
      newCheckout: false,
      darkMode: true,
    },
  })
  betaFeatures!: { newCheckout: boolean; darkMode: boolean };

  @Action({})
  getFeatures() {
    return this.betaFeatures;
  }
}

engine.start({ port: 3000 });
```

### 运行时配置修改

```typescript
const plugin = engine.getPlugin(DynamicConfigPlugin);

// 修改配置
await plugin.setConfig("config-service/rate-limit/default-limit", {
  maxRequests: 200,
  windowMs: 30000,
});

// 触发 onChange 回调
// 输出: 限流配置已更新: { maxRequests: 200, windowMs: 30000 }
```

### 获取当前配置

```typescript
const service = engine.get(RateLimitService);
console.log(service.defaultLimit);
// { maxRequests: 100, windowMs: 60000 }
```

## 注意事项

1. **装饰器位置** - `@Config` 只能用于类属性
2. **类型推断** - 配置值类型由 defaultValue 推断
3. **Schema 验证** - Etcd 或环境变量设置的值会经过 Schema 验证
4. **环境变量格式** - key 转大写下划线，如 `maxRetries` -> `MAX_RETRIES`
5. **热更新** - 使用 onChange 回调实现配置热更新
