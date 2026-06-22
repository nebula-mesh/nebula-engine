# 核心原理

## 架构概述

Nebula Engine 采用**插件化架构**，核心引擎只负责模块管理和生命周期编排，所有功能（路由、缓存、定时任务等）都通过插件实现。

```
用户代码 → Factory.create(plugins) → { Module, Microservice }
                ↓
         Module 装饰器 → 元数据注册
                ↓
         new Microservice(options)
                ↓
         engine.start(port)
                ↓
         loadModules() → loadHandlerMetadata()
                ↓
         onHandlerLoad() → 插件包装 + 路由注册
                ↓
         HTTP Server 启动
```

## 优先级驱动的洋葱圈模型

插件系统采用优先级驱动的洋葱圈模型。每个 Handler 方法被多个插件按照优先级从高到低依次包装：

```
请求 → [系统插件] → [安全插件] → [日志插件] → [业务插件] → [缓存插件] → [路由插件] → 响应
```

### 优先级定义

| 层级 | 优先级值 | 说明 | 示例插件 |
|------|---------|------|----------|
| SYSTEM | 50 | 系统级，最先执行 | GracefulShutdown |
| SECURITY | 100 | 安全相关，快速拒绝 | RateLimit |
| LOGGING | 200 | 日志、监控 | - |
| BUSINESS | 300 | 业务逻辑（默认） | - |
| PERFORMANCE | 400 | 性能优化，避免重复计算 | Cache |
| ROUTE | 1000 | 路由注册，最后执行 | Route, Action |

### 包装流程

1. **Wrapper 插件**（优先级 < 1000）先执行 `onHandlerLoad`，调用 `handler.wrap()` 注册包装函数
2. 引擎调用 `applyWrapperChains()` 将包装链应用到原型
3. **Route 插件**（优先级 = 1000）最后执行 `onHandlerLoad`，此时调用的方法已被所有包装插件包装

```typescript
// CachePlugin 的 onHandlerLoad
handler.wrap(async (next, instance, ...args) => {
  // 检查缓存
  const cached = await adapter.get(cacheKey);
  if (cached) return cached.value;

  const result = await next(); // 调用下一个包装层

  // 存入缓存
  await adapter.set(cacheKey, result);
  return result;
});
```

## 元数据系统

Nebula Engine 实现了自己的轻量级元数据系统，使用 Stage 3 标准装饰器：

- **双向访问**：`key → classes`（通过 key 查找类）和 `class → keys`（通过类查找 key）
- **实例隔离**：每个 `Factory.create()` 生成唯一的 Symbol 作为 metadataKey
- **无 reflect-metadata 依赖**

```typescript
// 类装饰器 → 注册到 keyToClassesMap
@Module("users")
class UserService {}

// 方法装饰器 → 注册到 methodMetadataStore
@Action({ params: [z.string()] })
getUser(id: string) {}
```

## 生命周期

```
Factory.create(plugins)
  → new Microservice(options)
  → engine.start(port)
      → loadModules()
      → onInit(engine)
      → onModuleLoad(modules)
      → loadHandlerMetadata()
      → onHandlerLoad(handlers)  [Wrapper 插件]
      → applyWrapperChains()
      → onHandlerLoad(handlers)  [Route 插件]
      → onBeforeStart(engine)
      → onAfterStart(engine)
      → HTTP Server 启动
  → engine.stop()
      → HTTP Server 关闭
      → onDestroy()  [逆序]
```
