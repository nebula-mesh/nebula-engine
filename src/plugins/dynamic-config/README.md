# Dynamic Config Plugin

基于 etcd 的动态配置插件，支持实时热更新。

## ✨ 核心特性

- ✅ **零配置**：只需添加装饰器
- ✅ **零手动操作**：插件自动预加载并创建同步访问
- ✅ **同步访问**：像普通属性一样使用，不需要 `await`
- ✅ **实时更新**：etcd watch 机制自动推送变更
- ✅ **类型安全**：Zod Schema 运行时验证 + TypeScript 类型推导
- ✅ **多级配置源**：支持 ETCD > 环境变量 > 默认值 三级优先级
- ✅ **完美类型推断**：使用 `@Config` 属性装饰器，无需类型断言

## 🎯 使用 @Config 属性装饰器

使用 `@Config` 属性装饰器，获得完美的 TypeScript 类型推断体验：

```typescript
// ✅ 使用 @Config 属性装饰器
@Module("app-config")
class AppConfig {
  @Config({
    key: "MAX_ATTEMPTS",
    defaultValue: 5,
  })
  maxAttempts!: number;  // 完美的类型推断
  
  // 使用时：
  const doubled = config.maxAttempts * 2;  // ✅ 类型正确，可以直接运算
}

## 🚀 快速开始（3步）

### 步骤 1：定义配置类

```typescript
// src/config.ts
import { Config } from "imean-service-engine/plugins/dynamic-config";
import { z } from "zod";

@Module("app-config")
export class AppConfig {
  // ✅ 推荐：使用 @Config 属性装饰器
  // 💡 使用 UPPER_SNAKE_CASE 格式，与环境变量保持一致
  @Config({
    key: "MAX_ATTEMPTS",  // 推荐格式，直接对应环境变量
    defaultValue: 5,
    schema: z.number().min(1).max(10),
  })
  maxAttempts!: number;  // TypeScript 正确识别为 number 类型

  @Config({
    key: "ENABLE_CACHE",  // 推荐格式，直接对应环境变量
    defaultValue: false,
  })
  enableCache!: boolean;  // TypeScript 正确识别为 boolean 类型
}
```

### 步骤 2：启动服务

```typescript
// src/main.ts
import { Factory } from "imean-service-engine";
import { DynamicConfigPlugin } from "imean-service-engine/plugins/dynamic-config";
import { AppConfig } from "./config";
import { Etcd3 } from "etcd3";

// 创建插件
const etcd = new Etcd3({ hosts: "http://localhost:2379" });
const { Module, Microservice } = Factory.create(
  new DynamicConfigPlugin({ etcdClient: etcd })
  // 或使用内存存储（测试）：new DynamicConfigPlugin({ useMockEtcd: true })
);

// 启动服务（插件会自动预加载所有配置）
const engine = new Microservice({ name: "my-service", version: "1.0.0" });
await engine.start(3000);
```

### 步骤 3：使用配置（直接访问）

```typescript
// 在任何地方使用 - 像普通属性一样！
const config = engine.get(AppConfig);

function doSomething() {  // ✅ 不需要 async
  // ✅ 完美：直接访问属性，类型正确
  const limit = config.maxAttempts;  // number 类型
  const useCache = config.enableCache;  // boolean 类型
  
  // ✅ 可以直接用于运算，无需类型断言
  const doubled = limit * 2;
  const sum = limit + 10;
  
  if (limit > 10) {
    // ...
  }
}
```

## 🔧 工作原理

1. **插件自动预加载**：在 `engine.start()` 时，插件自动加载所有配置到缓存
2. **自动转换为 getter**：插件将配置属性转换为同步 getter（从缓存读取）
3. **etcd watch 实时推送**：配置变更时自动更新缓存，无需轮询
4. **同步访问**：直接从缓存读取，无需 await

## 📝 使用示例

### 在 Service 中使用

```typescript
@Module("user-service")
class UserService {
  constructor(private config: AppConfig) {}
  
  async login(username: string, password: string) {
    // ✅ 直接访问，不需要 await，不需要括号
    // ⚠️ 注意：引擎启动后，方法会被替换为 getter
    const maxAttempts = this.config.maxAttempts;  // 不带括号
    
    if (attempts > maxAttempts) {
      throw new Error("Too many attempts");
    }
  }
}
```

### 复杂配置对象

```typescript
type FeatureFlags = {
  enableNewUI: boolean;
  enableCache: boolean;
};

@Config({
  key: "FEATURE_FLAGS",
  schema: z.object({
    enableNewUI: z.boolean(),
    enableCache: z.boolean(),
  }),
  defaultValue: { enableNewUI: false, enableCache: false },
})
featureFlags!: FeatureFlags;

// 使用 - TypeScript 完美推断类型
const flags = config.featureFlags;  // flags 类型为 FeatureFlags
if (flags.enableNewUI) {
  // ...
}
```

### 环境变量支持（配置优先级：ETCD > ENV > DEFAULT）

插件自动支持从环境变量读取配置。

**💡 推荐做法**：直接使用 `UPPER_SNAKE_CASE` 格式作为 key，与环境变量名保持一致：

```typescript
@Config({
  key: "MAX_CONNECTIONS",  // 推荐：直接使用环境变量格式
  schema: z.number().min(1).max(1000),
  defaultValue: 100,
})
maxConnections!: number;
```

**也支持**：如果使用 `kebab-case` 格式，会自动转换为环境变量名：

```typescript
@Config({
  key: "max-connections",  // 自动转换为环境变量 MAX_CONNECTIONS
  schema: z.number().min(1).max(1000),
  defaultValue: 100,
})
maxConnections!: number;
```

**key 到环境变量名的转换规则**：

| key 格式 | 环境变量名 | 说明 |
|---------|----------|------|
| `MAX_CONNECTIONS` | `MAX_CONNECTIONS` | ✅ 推荐：直接使用，无需转换 |
| `max-connections` | `MAX_CONNECTIONS` | ✅ 支持：自动转换 kebab-case → UPPER_SNAKE_CASE |
| `POOL_SIZE` | `POOL_SIZE` | ✅ 推荐：直接使用 |
| `pool-size` | `POOL_SIZE` | ✅ 支持：自动转换 |

**配置加载优先级**：

1. **ETCD**：优先从 etcd 读取（如果已设置）
2. **环境变量**：如果 etcd 中没有，从 `process.env[UPPER_SNAKE_CASE(key)]` 读取
3. **默认值**：如果环境变量也没有，使用 `defaultValue`

**环境变量类型支持**：

```typescript
// 数字类型
process.env.MAX_CONNECTIONS = "200";
config.maxConnections // => 200 (number)

// 布尔类型
process.env.ENABLE_CACHE = "true";
config.enableCache // => true (boolean)

// JSON 对象
process.env.FEATURE_FLAGS = '{"enableNewUI":true,"maxUploadSize":20}';
config.featureFlags // => { enableNewUI: true, maxUploadSize: 20 }

// 字符串类型
process.env.API_URL = "https://api.example.com";
config.apiUrl // => "https://api.example.com" (string)
```

**使用场景**：

- **本地开发**：使用 `.env` 文件配置环境变量
- **Docker 部署**：通过 `docker run -e MAX_CONNECTIONS=200` 设置
- **Kubernetes**：通过 ConfigMap 或 Secret 注入环境变量
- **CI/CD**：不同环境使用不同的环境变量值

### 配置变更回调

```typescript
@Config({
  key: "POOL_SIZE",
  defaultValue: 10,
  onChange: async (newValue, oldValue) => {
    console.log(`连接池变更: ${oldValue} -> ${newValue}`);
    await reinitializePool(newValue);
  },
})
poolSize!: number;
```

### 敏感信息保护

```typescript
@Config({
  key: "API_KEY",
  defaultValue: "default-key",
  sensitive: true, // 日志脱敏
})
apiKey!: string;
```

## 🔄 运行时修改配置

配置在 etcd 中的键格式：`/config/{serviceName}/{moduleName}/{configKey}`

### 方式 1：命令行（etcdctl）

```bash
# 💡 推荐：使用 UPPER_SNAKE_CASE 格式的 key
# 修改配置
etcdctl put /config/my-service/app-config/MAX_ATTEMPTS 10

# 查看配置
etcdctl get /config/my-service/app-config/MAX_ATTEMPTS
```

### 方式 2：代码 API

```typescript
const configPlugin = engine.getPlugin("dynamic-config-plugin") as DynamicConfigPlugin;
// 💡 推荐：使用 UPPER_SNAKE_CASE 格式的 key
await configPlugin.setConfig("my-service/app-config/MAX_ATTEMPTS", 10);
```

配置变更后**立即生效**，无需重启！

## 🧪 测试

```typescript
import { Testing } from "imean-service-engine";
import { DynamicConfigPlugin } from "imean-service-engine/plugins/dynamic-config";

const { engine, Module } = Testing.createTestEngine({
  plugins: [new DynamicConfigPlugin({ useMockEtcd: true })],
});

@Module("test")
class TestConfig {
  @Config({ key: "TEST_VALUE", defaultValue: 100 })
  testValue!: number;
}

// 启动并预加载
await engine.start(0);

// 测试同步访问
const config = engine.get(TestConfig);
expect(config.testValue).toBe(100);  // TypeScript 完美推断类型
```

## ⚙️ 配置选项

### 插件选项

```typescript
new DynamicConfigPlugin({
  etcdClient: etcd,        // etcd 客户端实例
  useMockEtcd: true,       // 使用内存存储（测试环境）
  etcdPrefix: "/config",   // etcd 键前缀，默认 "/config"
})
```

### 装饰器选项

```typescript
@Config({
  key: "CONFIG_KEY",       // 配置键（必填）💡 推荐使用 UPPER_SNAKE_CASE 格式
  defaultValue: 100,       // 默认值（必填）
  schema: z.number(),      // Zod Schema 验证（可选）
  description: "描述",     // 配置描述（可选）
  sensitive: false,        // 是否敏感信息（可选，日志脱敏）
  onChange: (n, o) => {}, // 变更回调（可选）
})
```

**💡 key 命名建议**：
- **推荐**：直接使用 `UPPER_SNAKE_CASE` 格式（如 `MAX_CONNECTIONS`），与环境变量保持一致
- **支持**：使用 `kebab-case` 格式（如 `max-connections`），会自动转换为 `UPPER_SNAKE_CASE`

**配置优先级**（自动支持环境变量）：

1. **ETCD**：优先从 etcd 读取（如果已设置）
2. **环境变量**：如果 etcd 中没有，从 `process.env[key]` 或 `process.env[UPPER_SNAKE_CASE(key)]` 读取
3. **默认值**：如果环境变量也没有，使用 `defaultValue`

## 🎯 最佳实践

### 1. TypeScript 类型推断（完美支持）

**✅ 使用属性装饰器，TypeScript 完美推断类型**

```typescript
// ✅ 完美：使用属性装饰器
@Config({
  key: "MAX_CONNECTIONS",
  defaultValue: 100,
})
maxConnections!: number;  // TypeScript 完美识别为 number 类型

// 使用时：
const doubled = config.maxConnections * 2;  // ✅ 类型正确，可以直接运算
const sum = config.maxConnections + 10;     // ✅ 无需类型断言
```

**为什么属性装饰器更好**：
1. **完美类型推断**：TypeScript 直接识别为对应类型，无需任何断言
2. **简洁语法**：属性定义比方法更简洁
3. **直接访问**：像普通属性一样使用，符合直觉
4. **无类型困扰**：完全避免了方法装饰器的类型问题

### 2. key 命名规范（重要）

**💡 强烈推荐**：使用 `UPPER_SNAKE_CASE` 格式作为 key，与环境变量保持一致

```typescript
// ✅ 推荐：使用 UPPER_SNAKE_CASE 格式
@Config({
  key: "MAX_CONNECTIONS",  // 清晰、直观，与环境变量一致
  defaultValue: 100,
})
maxConnections!: number;

// ✅ 也支持：使用 kebab-case 格式（自动转换）
@Config({
  key: "max-connections",  // 自动转换为 MAX_CONNECTIONS
  defaultValue: 100,
})
maxConnections!: number;

// ❌ 不推荐：混用不同格式
@Config({
  key: "maxConnections",  // camelCase 不会自动转换
  defaultValue: 100,
})
maxConnections!: number;
```

**推荐使用 UPPER_SNAKE_CASE 的原因**：
1. **直观**：key 和环境变量名完全一致，无需记忆转换规则
2. **标准**：符合环境变量的通用命名规范
3. **清晰**：在 etcd 中存储时，key 清晰易读
4. **一致**：整个项目配置风格统一

### 2. 配置分类与推荐方案

| 类型 | 推荐方案 | 示例 | 说明 |
|------|---------|------|------|
| 基础设施配置 | 纯环境变量 | 数据库URI、服务端口 | 部署时确定，不会变更 |
| 混合配置 | `DynamicConfig` | 最大连接数、超时时间 | 自动支持 ETCD + 环境变量，可动态调整 |
| 业务配置 | `DynamicConfig` | 限流阈值、功能开关 | 通过 etcd 运行时可调整 |

### 与现有配置共存

```typescript
// config.ts - 保留静态配置
export const { MONGODB_URI } = process.env;

// dynamic-config.ts - 统一配置管理（推荐）
@Module("app-config")
export class AppConfig {
  // 💡 推荐：使用 UPPER_SNAKE_CASE 格式
  // ✅ 使用属性装饰器，获得完美的 TypeScript 类型推断
  
  // 混合配置：自动支持 ETCD + 环境变量
  @Config({ 
    key: "POOL_SIZE",  // 推荐格式，直接对应环境变量 POOL_SIZE
    defaultValue: 10 
  })
  poolSize!: number;  // TypeScript 完美推断为 number 类型
  
  // 业务配置：通过 etcd 动态调整
  @Config({ 
    key: "RATE_LIMIT",  // 推荐格式，直接对应环境变量 RATE_LIMIT
    defaultValue: 100 
  })
  rateLimit!: number;  // TypeScript 完美推断为 number 类型
}

// 使用时 - 都是同步访问！
import { MONGODB_URI } from "./config";        // 静态环境变量
const config = engine.get(AppConfig);          // 动态配置

const uri = MONGODB_URI;           // ✅ 直接使用，类型为 string | undefined
const poolSize = config.poolSize;  // ✅ 直接访问属性，类型为 number（ETCD > POOL_SIZE > DEFAULT）
const limit = config.rateLimit;    // ✅ 直接访问属性，类型为 number（ETCD > RATE_LIMIT > DEFAULT）
```

### 3. 命名规范

**💡 强烈推荐**：使用 `UPPER_SNAKE_CASE` 格式作为 key

```typescript
// ✅ 推荐：使用 UPPER_SNAKE_CASE
@Config({ key: "MAX_RETRY_COUNT", defaultValue: 3 })
maxRetryCount!: number;

@Config({ key: "ENABLE_CACHE", defaultValue: false })
enableCache!: boolean;

@Config({ key: "MAXIMUM_ATTEMPTS", defaultValue: 5 })
maximumAttempts!: number;
```

**也支持**：使用 `kebab-case` 格式（自动转换为 UPPER_SNAKE_CASE）

```typescript
// ✅ 支持：kebab-case（自动转换为环境变量名）
@Config({ key: "max-retry-count", defaultValue: 3 })  // 转换为 MAX_RETRY_COUNT
maxRetryCount!: number;

@Config({ key: "enable-cache", defaultValue: false })  // 转换为 ENABLE_CACHE
enableCache!: boolean;
```

**命名建议**：
- **具有描述性**：`ENABLE_CACHE` 而不是 `CACHE`
- **避免缩写**：`MAXIMUM_ATTEMPTS` 而不是 `MAX_ATT`
- **清晰明确**：`MAX_RETRY_COUNT` 比 `RETRY_MAX` 更清晰

### 4. Schema 验证

始终添加 Schema 验证，确保配置值的合法性：

```typescript
@Config({
  key: "POOL_SIZE",
  schema: z.number().min(1).max(100), // ✅ 限制范围
  defaultValue: 10,
})
poolSize!: number;
```

## ❓ 常见问题（FAQ）

### 1. 为什么使用 `!` 断言？

使用 `!` 是 TypeScript 的 **非空断言**（Non-null Assertion），告诉 TypeScript 这个属性会在运行时被赋值：

```typescript
@Config({ key: "MAX_ATTEMPTS", defaultValue: 5 })
maxAttempts!: number;  // ! 表示"我保证这个值会被赋值"
```

**为什么需要 `!`**：
1. 属性没有初始化器（`= 5`）
2. 插件会在运行时动态设置 getter
3. `!` 告诉 TypeScript 不要报错

---

### 2. 配置数据首次加载在哪里？服务重启后如何保证一致性？

#### 首次启动（etcd 中无配置）

```
1. 启动服务 → preloadConfigs()
2. 从 etcd 读取配置 → null（不存在）
3. 使用 defaultValue: 5
4. 自动保存到 etcd ⭐
5. 缓存到内存
```

#### 再次启动（etcd 中已有配置）

```
1. 启动服务 → preloadConfigs()
2. 从 etcd 读取配置 → 5（上次保存的值）⭐
3. 直接使用 etcd 中的值
4. 缓存到内存
```

#### 运行时修改配置

```
1. 用户修改配置：5 → 10
2. 保存到 etcd
3. watch 监听到变更 → 自动更新内存缓存
4. 下次重启时，从 etcd 读取 → 10 ✅
```

#### 数据优先级

```
etcd 中的值  >  defaultValue
```

**保证一致性的机制**：

1. **持久化**：配置保存在 etcd，服务重启后自动从 etcd 恢复
2. **自动初始化**：首次启动时，`defaultValue` 自动保存到 etcd
3. **实时同步**：运行时修改通过 watch 实时更新所有实例
4. **降级策略**：etcd 不可用时，使用内存缓存或 `defaultValue`

**关键代码**（plugin.ts）：

```typescript
// 从 etcd 读取配置
let configValue = await this.storage.get(configKey);

// 如果不存在，使用 defaultValue 并保存
if (configValue === null) {
  configValue = options.defaultValue;
  await this.storage.set(configKey, configValue);  // ⭐ 自动保存到 etcd
}
```

这样确保了：
- ✅ 首次启动使用 `defaultValue`
- ✅ 配置自动持久化到 etcd
- ✅ 服务重启后从 etcd 恢复最新配置
- ✅ 多实例之间配置一致

---

### 3. 如何在运行时修改配置？

使用 `storage.set()` 方法：

```typescript
const configPlugin = engine.getPlugin("dynamic-config-plugin");
await configPlugin.storage.set("service-name/module/key", newValue);
```

或通过前端管理界面 + MySQL 持久化（参见"前端管理架构"章节）。

---

### 4. 配置变更后如何通知应用？

使用 `onChange` 回调：

```typescript
@Config({
  key: "MAX_CONNECTIONS",
  defaultValue: 100,
  onChange: async (newValue, oldValue) => {
    console.log(`配置变更：${oldValue} → ${newValue}`);
    // 重新初始化连接池
    await pool.resize(newValue);
  }
})
maxConnections!: number;
```

etcd watch 机制会自动监听变更并触发回调。
