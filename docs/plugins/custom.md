# 编写自定义插件

本文档介绍如何编写一个自定义插件。

## 插件文件结构

```
src/plugins/my-plugin/
  plugin.ts     # 插件主逻辑
  types.ts      # 类型定义
  decorator.ts  # 装饰器实现
  index.ts      # 导出
```

## 完整示例

### 1. 定义类型

```typescript
// types.ts
export interface MyPluginOptions {
  option1?: string;
}

export interface MyModuleOptions {
  enabled?: boolean;
}
```

### 2. 创建装饰器

```typescript
// decorator.ts
import { Handler } from "nebula-engine";

export function MyDecorator(options?: { ttl?: number }) {
  return Handler({ type: "my-plugin", options: options || {} });
}
```

### 3. 实现插件

```typescript
// plugin.ts
import { Plugin, PluginPriority, HandlerMetadata } from "nebula-engine";

export class MyPlugin implements Plugin<MyModuleOptions> {
  public readonly name = "my-plugin";
  public readonly priority = PluginPriority.BUSINESS;

  onHandlerLoad(handlers: HandlerMetadata[]): void {
    const myHandlers = handlers.filter(h => h.type === "my-plugin");

    for (const handler of myHandlers) {
      handler.wrap(async (next, instance, ...args) => {
        console.log("before", handler.methodName);
        const result = await next();
        console.log("after", handler.methodName);
        return result;
      });
    }
  }
}
```

### 4. 导出

```typescript
// index.ts
export { MyPlugin } from "./plugin";
export { MyDecorator } from "./decorator";
export type { MyPluginOptions, MyModuleOptions } from "./types";
```

## 关键点

- **`handler.wrap()`** 是洋葱圈模型的核心，`next()` 必须被调用
- **优先级**决定包装顺序：数值越小越先执行
- **`name`** 必须唯一，用于插件覆盖
- 包装插件优先级应 < 1000（Route 之前），路由插件 = 1000
