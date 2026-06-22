# 插件系统

Nebula Engine 的所有功能都通过插件实现。以下是内置插件列表：

| 插件 | 优先级 | 功能 |
|------|--------|------|
| [Action 插件](/plugins/action) | 990 | 基于下标的参数传递、Zod 校验、自动参数注入、流式传输 |
| [Route 插件](/plugins/route) | 1000 | HTTP 路由注册，支持多路径、多方法、多层中间件 |
| [Cache 插件](/plugins/cache) | 400 | 方法缓存，支持 Memory/Redis 适配器 |
| [Schedule 插件](/plugins/schedule) | — | 分布式定时任务（基于 etcd） |
| [GracefulShutdown 插件](/plugins/graceful-shutdown) | 50 | 优雅停机，追踪活跃处理器 |
| [ClientCode 插件](/plugins/client-code) | 1000 | 自动生成类型化客户端代码 |
| [DynamicConfig 插件](/plugins/dynamic-config) | — | 动态配置管理 |
| [ConcurrencyLock 插件](/plugins/concurrency-lock) | 500 | 并发锁，防止重复执行 |

## 插件接口

所有插件必须实现 `Plugin` 接口：

```typescript
interface Plugin<TModuleOptions> {
  name: string;
  priority?: number;
  getModuleOptionsSchema?: () => PluginModuleOptionsSchema<TModuleOptions>;
  onInit?: (engine: Microservice) => void;
  onModuleLoad?: (modules: ModuleMetadata[]) => void;
  onHandlerLoad?: (handlers: HandlerMetadata[]) => void;
  onBeforeStart?: (engine: Microservice) => void;
  onAfterStart?: (engine: Microservice) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
}
```

## handler.wrap()

插件通过 `handler.wrap()` 构建洋葱圈包装链：

```typescript
handler.wrap(async (next, instance, ...args) => {
  // 前置逻辑
  const result = await next(); // 调用下一个包装层
  // 后置逻辑
  return result;
});
```

> **重要**：`next()` 必须被调用，否则原始方法不会执行。
