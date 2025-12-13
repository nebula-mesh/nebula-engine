# 插件系统完整指南

## 目录

1. [概述](#概述)
2. [核心概念](#核心概念)
3. [插件优先级系统](#插件优先级系统)
4. [洋葱圈模型](#洋葱圈模型)
5. [插件开发指南](#插件开发指南)
6. [默认插件机制](#默认插件机制)
7. [最佳实践](#最佳实践)

## 概述

本框架的插件系统采用**优先级驱动的洋葱圈模型**，让用户无需关心插件注册顺序，引擎会自动按优先级排序并构建执行链。

### 核心特性

- ✅ **自动优先级排序**：插件声明优先级，引擎自动排序
- ✅ **洋葱圈执行模型**：支持前置和后置处理逻辑
- ✅ **用户友好**：用户按任意顺序注册插件即可
- ✅ **灵活扩展**：插件开发者可以声明自定义优先级

## 核心概念

### 插件接口

```typescript
export interface Plugin<TModuleOptions = Record<string, any>> {
  // 插件唯一名称
  name: string;
  
  // 插件优先级（可选，默认 BUSINESS = 300）
  priority?: PluginPriority | number;
  
  // 声明插件的Module配置Schema
  getModuleOptionsSchema?: () => PluginModuleOptionsSchema<TModuleOptions>;
  
  // 生命周期钩子
  onInit?: (engine: BaseMicroservice) => void;
  onModuleLoad?: (modules: ModuleMetadata[]) => void;
  onHandlerLoad?: (handlers: HandlerMetadata[]) => void;
  onBeforeStart?: (engine: BaseMicroservice) => void;
  onAfterStart?: (engine: BaseMicroservice) => void;
  onDestroy?: () => void;
}
```

### handler.wrap() API

插件通过 `handler.wrap()` 包装方法，引擎自动管理包装链：

```typescript
handler.wrap(async (next, instance, ...args) => {
  // 前置逻辑
  const result = await next(); // 调用下一个包装层或原始方法
  // 后置逻辑
  return result;
});
```

## 插件优先级系统

### 设计理念

**将用户当成"傻子"**：用户只需要注册插件，不需要关心顺序。引擎会自动按优先级排序，确保插件按正确的顺序执行。

### 优先级枚举

```typescript
export enum PluginPriority {
  /**
   * 最高优先级：安全相关插件（限流、认证等）
   * 应该最先执行，快速拒绝无效请求
   */
  SECURITY = 100,
  
  /**
   * 高优先级：日志、监控等插件
   * 记录所有请求，包括被安全插件拒绝的
   */
  LOGGING = 200,
  
  /**
   * 中优先级：业务逻辑插件（数据转换等）
   * 在安全和日志之后执行
   */
  BUSINESS = 300,
  
  /**
   * 低优先级：性能优化插件（缓存等）
   * 在业务逻辑之后执行，避免重复计算
   */
  PERFORMANCE = 400,
  
  /**
   * 最低优先级：路由插件
   * 必须最后执行，注册HTTP路由
   */
  ROUTE = 1000,
}
```

### 排序规则

1. **按优先级排序**：数值越小，优先级越高（越先执行）
2. **相同优先级**：按注册顺序执行（保持稳定排序）
3. **默认优先级**：如果不指定，默认为 `PluginPriority.BUSINESS` (300)

### 使用示例

#### 用户视角（无需关心顺序）

```typescript
// 用户可以按任意顺序注册插件
const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
})
  .plugin(new CachePlugin())      // PERFORMANCE = 400（可以放在前面）
  .plugin(new RateLimitPlugin())  // SECURITY = 100（可以放在后面）
  .plugin(new LogPlugin())         // LOGGING = 200（可以放在中间）
  .plugin(new AuthPlugin());      // SECURITY = 100

// 引擎自动按优先级排序：
// 1. RateLimitPlugin (SECURITY = 100，先注册)
// 2. AuthPlugin (SECURITY = 100，后注册)
// 3. LogPlugin (LOGGING = 200)
// 4. CachePlugin (PERFORMANCE = 400)
// 5. RoutePlugin (ROUTE = 1000，自动注册)
```

#### 插件开发者视角（声明优先级）

```typescript
export class RateLimitPlugin implements Plugin {
  public readonly name = "rate-limit-plugin";
  public readonly priority = PluginPriority.SECURITY; // 声明为安全插件
}

export class CachePlugin implements Plugin {
  public readonly name = "cache-plugin";
  public readonly priority = PluginPriority.PERFORMANCE; // 声明为性能优化插件
}
```

### 优先级选择指南

| 插件类型 | 优先级 | 说明 | 示例 |
|---------|--------|------|------|
| 安全插件 | `SECURITY` (100) | 限流、认证等，快速拒绝无效请求 | RateLimitPlugin, AuthPlugin |
| 日志插件 | `LOGGING` (200) | 记录所有请求，包括被拒绝的 | LogPlugin, MonitorPlugin |
| 业务逻辑插件 | `BUSINESS` (300) | 数据转换、业务处理等 | DataTransformPlugin |
| 性能优化插件 | `PERFORMANCE` (400) | 缓存、压缩等 | CachePlugin |
| 路由插件 | `ROUTE` (1000) | 注册HTTP路由，必须最后 | RoutePlugin |

## 洋葱圈模型

### 工作原理

插件包装机制采用**洋葱圈模型**（Onion Model），类似于 Koa.js 的中间件机制。每个插件可以包装方法，形成多层嵌套的执行链。

### 执行流程图示

```
请求进入
  ↓
┌─────────────────────────────────────┐
│ RateLimitPlugin（最外层，SECURITY）   │ ← 前置：限流检查
│   ↓ 调用 next()                      │
│ ┌─────────────────────────────────┐ │
│ │ AuthPlugin（中间层，SECURITY）    │ │ ← 前置：认证检查
│ │   ↓ 调用 next()                  │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ CachePlugin（内层，PERFORMANCE）│ │ │ ← 前置：缓存检查
│ │ │   ↓ 调用 next()              │ │ │
│ │ │ ┌─────────────────────────┐ │ │ │
│ │ │ │ 原始业务方法（核心）     │ │ │ │ ← 执行业务逻辑
│ │ │ └─────────────────────────┘ │ │ │
│ │ │ ← 后置：存储缓存             │ │ │
│ │ └─────────────────────────────┘ │ │
│ │ ← 后置：认证后处理              │ │
│ └─────────────────────────────────┘ │
│ ← 后置：限流后处理                  │
└─────────────────────────────────────┘
  ↓
响应返回
```

### 包装链构建

引擎按照**插件优先级**自动排序，然后**从后往前**应用包装，形成洋葱圈结构：

```typescript
// 插件注册顺序（用户可以按任意顺序）
engine
  .plugin(new CachePlugin())      // PERFORMANCE = 400
  .plugin(new RateLimitPlugin())  // SECURITY = 100
  .plugin(new AuthPlugin());      // SECURITY = 100

// 引擎自动按优先级排序：
// 1. RateLimitPlugin (SECURITY = 100)
// 2. AuthPlugin (SECURITY = 100)
// 3. CachePlugin (PERFORMANCE = 400)

// 包装链构建顺序（从后往前应用）：
// CachePlugin -> AuthPlugin -> RateLimitPlugin -> 原始方法
```

### 代码示例

```typescript
// RateLimitPlugin（最外层）
handler.wrap(async (next, instance, ...args) => {
  console.log("1. RateLimit: 前置检查");
  if (!checkRateLimit()) {
    throw new Error("Rate limit exceeded");
  }
  const result = await next(); // 调用下一个包装层
  console.log("1. RateLimit: 后置处理");
  return result;
});

// AuthPlugin（中间层）
handler.wrap(async (next, instance, ...args) => {
  console.log("2. Auth: 前置检查");
  if (!isAuthenticated()) {
    throw new Error("Unauthorized");
  }
  const result = await next(); // 调用下一个包装层
  console.log("2. Auth: 后置处理");
  return result;
});

// CachePlugin（内层）
handler.wrap(async (next, instance, ...args) => {
  console.log("3. Cache: 前置检查");
  const cached = getCache(...args);
  if (cached) return cached;
  
  const result = await next(); // 调用原始方法
  console.log("3. Cache: 后置处理");
  setCache(...args, result);
  return result;
});
```

**执行输出**：
```
1. RateLimit: 前置检查
2. Auth: 前置检查
3. Cache: 前置检查
[原始方法执行]
3. Cache: 后置处理
2. Auth: 后置处理
1. RateLimit: 后置处理
```

### 关键特性

1. **双向执行**：每个包装器可以在 `next()` 之前和之后执行代码
2. **优先级排序**：包装器按照插件优先级自动排序，用户无需关心注册顺序
3. **自动管理**：引擎自动构建和执行包装链，插件无需关心实现细节

## 插件开发指南

### 基本结构

```typescript
import {
  BaseMicroservice,
  HandlerMetadata,
  Plugin,
  PluginModuleOptionsSchema,
  PluginPriority,
} from "../../core/types";

export interface MyModuleOptions {
  myOption?: string;
}

export class MyPlugin implements Plugin<MyModuleOptions> {
  public readonly name = "my-plugin";
  public readonly priority = PluginPriority.BUSINESS; // 声明优先级

  getModuleOptionsSchema(): PluginModuleOptionsSchema<MyModuleOptions> {
    return {
      _type: {} as MyModuleOptions,
      validate: (options) => {
        if (options.myOption && typeof options.myOption !== "string") {
          return "myOption must be a string";
        }
        return true;
      },
    };
  }

  onHandlerLoad(handlers: HandlerMetadata[]): void {
    const myHandlers = handlers.filter((h) => h.type === "my-type");

    for (const handler of myHandlers) {
      // 使用 handler.wrap() API
      handler.wrap(async (next, instance, ...args) => {
        // 前置逻辑
        console.log(`[MyPlugin] Before ${handler.methodName}`);

        // 调用下一个包装层或原始方法
        const result = await next();

        // 后置逻辑
        console.log(`[MyPlugin] After ${handler.methodName}`);

        return result;
      });
    }
  }
}
```

### handler.wrap() API 详解

#### 签名

```typescript
handler.wrap(wrapper: HandlerWrapper): void;

type HandlerWrapper = (
  next: () => Promise<any> | any,
  instance: any,
  ...args: any[]
) => Promise<any> | any;
```

#### 参数说明

- `next`: 调用下一个包装层或原始方法的函数
- `instance`: 模块实例（`this`）
- `args`: 方法参数

#### 使用模式

**模式1：简单包装**
```typescript
handler.wrap(async (next, instance, ...args) => {
  const result = await next();
  return result;
});
```

**模式2：前置和后置逻辑**
```typescript
handler.wrap(async (next, instance, ...args) => {
  // 前置逻辑
  console.log("Before:", args);
  
  // 调用下一个包装层
  const result = await next();
  
  // 后置逻辑
  console.log("After:", result);
  
  return result;
});
```

**模式3：条件执行**
```typescript
handler.wrap(async (next, instance, ...args) => {
  if (shouldSkip(...args)) {
    return defaultValue;
  }
  return await next();
});
```

**模式4：错误处理**
```typescript
handler.wrap(async (next, instance, ...args) => {
  try {
    return await next();
  } catch (error) {
    // 错误处理逻辑
    console.error("Error:", error);
    throw error;
  }
});
```

### 常见错误

#### ❌ 错误1：直接修改原型

```typescript
// ❌ 错误
const prototype = handler.module.prototype;
prototype[handler.methodName] = wrappedMethod;

// ✅ 正确
handler.wrap(async (next, instance, ...args) => {
  return await next();
});
```

#### ❌ 错误2：使用 handler.method

```typescript
// ❌ 错误（handler.method 是原始方法，不是当前方法）
const result = await handler.method.apply(instance, args);

// ✅ 正确（使用 next() 调用当前方法）
const result = await next();
```

#### ❌ 错误3：忘记声明优先级

```typescript
// ❌ 错误（不声明优先级，默认使用 BUSINESS，可能不是最佳选择）
export class RateLimitPlugin implements Plugin {
  public readonly name = "rate-limit-plugin";
  // 缺少 priority
}

// ✅ 正确（声明合理的优先级）
export class RateLimitPlugin implements Plugin {
  public readonly name = "rate-limit-plugin";
  public readonly priority = PluginPriority.SECURITY; // 安全插件，高优先级
}
```

## 默认插件机制

### 概述

框架支持将常用插件注册为**默认内置插件**，无需在每次创建引擎时手动注册。`RoutePlugin` 已经作为默认内置插件自动注册。

### 使用方式

#### 基本使用（RoutePlugin 自动注册）

```typescript
import { Microservice } from "imean-service-engine";

// RoutePlugin 已经自动注册，无需手动添加
const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
}).plugin(new CachePlugin()); // 只需要注册其他插件

// 直接使用 @Route 装饰器
@Module("UserModule", {
  routePrefix: "/api/users",
})
class UserService {
  @Route({ method: "GET", path: "/list" })
  async getUsers(ctx: Context) {
    return ctx.json({ users: [] });
  }
}
```

#### 禁用默认插件

```typescript
const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
  disableDefaultPlugins: true, // 禁用默认插件
}).plugin(new CustomRoutePlugin()); // 使用自定义路由插件
```

#### 覆盖默认插件

```typescript
const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
}).plugin(new CustomRoutePlugin()); // 覆盖默认的 RoutePlugin
```

### 执行顺序保证

即使 `RoutePlugin` 作为默认插件在构造函数中自动注册，引擎仍然会确保：

1. **按优先级排序**：所有插件（包括默认插件）按优先级自动排序
2. **包装插件先执行**：其他插件（如 `CachePlugin`、`AuthPlugin`）的 `onHandlerLoad` 先执行，调用 `handler.wrap()` 构建包装链
3. **应用包装链**：引擎将所有包装链应用到原型上
4. **RoutePlugin 最后执行**：`RoutePlugin` 的 `onHandlerLoad` 最后执行（优先级 `ROUTE = 1000`），注册路由时调用的是已被包装后的方法

**执行流程**：
```
1. 构造函数自动注册 RoutePlugin（作为默认插件，priority = ROUTE = 1000）
2. 手动注册 CachePlugin（priority = PERFORMANCE = 400）
3. 引擎启动：
   a. 按优先级排序：CachePlugin (400) → RoutePlugin (1000)
   b. CachePlugin.onHandlerLoad() → 调用 handler.wrap()
   c. 应用包装链到原型
   d. RoutePlugin.onHandlerLoad() → 注册路由（调用已被包装的方法）
```

### 注册新的默认插件

```typescript
import { Microservice } from "imean-service-engine";
import { MyPlugin } from "./my-plugin";

// 注册为默认插件
Microservice.registerDefaultPlugin(new MyPlugin());

// 之后创建的引擎实例都会自动包含 MyPlugin
const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});
```

## 最佳实践

### 1. 优先级选择

#### 安全插件 → `PluginPriority.SECURITY` (100)

```typescript
export class RateLimitPlugin implements Plugin {
  public readonly priority = PluginPriority.SECURITY;
}

export class AuthPlugin implements Plugin {
  public readonly priority = PluginPriority.SECURITY;
}
```

**原因**：安全插件应该最先执行，快速拒绝无效请求，避免消耗后续资源。

#### 日志插件 → `PluginPriority.LOGGING` (200)

```typescript
export class LogPlugin implements Plugin {
  public readonly priority = PluginPriority.LOGGING;
}
```

**原因**：日志插件应该记录所有请求，包括被安全插件拒绝的请求。

#### 业务逻辑插件 → `PluginPriority.BUSINESS` (300，默认)

```typescript
export class DataTransformPlugin implements Plugin {
  // 不指定 priority，默认使用 BUSINESS (300)
}
```

**原因**：业务逻辑插件在安全和日志之后执行。

#### 性能优化插件 → `PluginPriority.PERFORMANCE` (400)

```typescript
export class CachePlugin implements Plugin {
  public readonly priority = PluginPriority.PERFORMANCE;
}
```

**原因**：性能优化插件应该在内层执行，避免外层插件重复执行。

#### 路由插件 → `PluginPriority.ROUTE` (1000)

```typescript
export class RoutePlugin implements Plugin {
  public readonly priority = PluginPriority.ROUTE;
}
```

**原因**：路由插件必须最后执行，注册HTTP路由。

### 2. 插件实现原则

#### ✅ 总是使用 `handler.wrap()`

```typescript
// ✅ 正确
handler.wrap(async (next, instance, ...args) => {
  return await next();
});

// ❌ 错误
const prototype = handler.module.prototype;
prototype[handler.methodName] = wrappedMethod;
```

#### ✅ 使用 `next()` 调用

```typescript
// ✅ 正确
const result = await next();

// ❌ 错误
const result = await handler.method.apply(instance, args);
```

#### ✅ 声明合理的优先级

```typescript
// ✅ 正确
export class RateLimitPlugin implements Plugin {
  public readonly priority = PluginPriority.SECURITY;
}

// ❌ 错误（不声明优先级）
export class RateLimitPlugin implements Plugin {
  // 缺少 priority
}
```

### 3. 典型场景示例

#### 场景1：限流 + 缓存

```typescript
// 限流插件（外层，SECURITY = 100）
handler.wrap(async (next, instance, ...args) => {
  if (!checkRateLimit()) {
    throw new Error("Rate limit exceeded");
  }
  return await next();
});

// 缓存插件（内层，PERFORMANCE = 400）
handler.wrap(async (next, instance, ...args) => {
  const cached = getCache(...args);
  if (cached) return cached;
  
  const result = await next();
  setCache(...args, result);
  return result;
});
```

**执行顺序**：
1. 限流检查（外层）
2. 缓存检查（内层）
3. 原始方法执行
4. 缓存存储（内层）
5. 限流后置处理（外层）

**优势**：缓存命中时不会进行限流检查，提高性能。

#### 场景2：认证 + 日志

```typescript
// 日志插件（外层，LOGGING = 200）
handler.wrap(async (next, instance, ...args) => {
  const start = Date.now();
  console.log("Request started");
  
  try {
    const result = await next();
    console.log(`Request completed in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`Request failed: ${error}`);
    throw error;
  }
});

// 认证插件（内层，SECURITY = 100）
handler.wrap(async (next, instance, ...args) => {
  if (!isAuthenticated()) {
    throw new Error("Unauthorized");
  }
  return await next();
});
```

**执行顺序**：
1. 日志记录开始（外层）
2. 认证检查（内层）
3. 如果未认证，返回 401，日志记录失败 ✅
4. 如果已认证，执行原始方法，日志记录成功

**优势**：日志插件在外层，可以记录所有请求（包括认证失败的）。

### 4. 测试建议

#### 测试插件配合

```typescript
describe("插件配合", () => {
  it("应该支持多个插件链式包装", async () => {
    const engine = new Microservice({
      name: "test-service",
      version: "1.0.0",
    })
      .plugin(new RateLimitPlugin())
      .plugin(new CachePlugin());

    // 测试逻辑...
  });
});
```

#### 测试优先级排序

```typescript
it("应该按优先级自动排序", () => {
  const engine = new Microservice({
    name: "test-service",
    version: "1.0.0",
  })
    .plugin(new CachePlugin())      // PERFORMANCE = 400
    .plugin(new RateLimitPlugin()); // SECURITY = 100

  // 验证执行顺序：RateLimitPlugin → CachePlugin
});
```

## 总结

### 核心要点

1. **优先级系统**：插件声明优先级，引擎自动排序，用户无需关心注册顺序
2. **洋葱圈模型**：支持前置和后置处理逻辑，执行顺序清晰可预测
3. **handler.wrap() API**：简单的包装API，引擎自动管理包装链
4. **默认插件**：常用插件自动注册，简化使用

### 关键原则

- ✅ 使用 `handler.wrap()` API 包装方法
- ✅ 声明合理的优先级
- ✅ 使用 `next()` 调用下一个包装层
- ✅ 不要直接修改原型
- ✅ 不要使用 `handler.method`

遵循这些原则，你的插件就能与其他插件正确配合，并且用户无需关心注册顺序。

