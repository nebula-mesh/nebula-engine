# AI 编码助手指南 (AGENTS.md)

本文档旨在指导 AI 编码助手（如 Cursor Composer、GitHub Copilot 等）在参与本项目开发时遵循项目的代码实践、架构设计和编码规范。

## 目录

- [项目概述](#项目概述)
- [核心架构原则](#核心架构原则)
- [代码风格规范](#代码风格规范)
- [插件开发指南](#插件开发指南)
- [测试编写规范](#测试编写规范)
- [错误处理规范](#错误处理规范)
- [类型系统规范](#类型系统规范)
- [常见任务指南](#常见任务指南)
- [禁止事项](#禁止事项)

## 项目概述

**Nebula Engine** 是一个基于 Hono 的轻量级微服务引擎框架，采用插件化架构，支持装饰器驱动的 API 定义和自动类型推断。

### 核心技术栈

- **TypeScript**: 严格模式，ES2022 目标
- **Hono**: HTTP 框架和路由
- **Zod**: 运行时类型验证和类型推断
- **Vitest**: 测试框架
- **Winston**: 日志记录
- **EJSON**: 扩展 JSON 序列化

### 项目结构

```
src/
  core/              # 核心框架代码
    factory.ts       # 工厂类（显式插件注册）
    engine.ts        # 引擎核心
    types.ts         # 类型定义
    testing.ts       # 测试辅助工具
    logger.ts        # 日志模块
    errors.ts        # 错误类型定义
  plugins/          # 插件实现
    {plugin-name}/
      plugin.ts      # 插件主逻辑
      types.ts       # 类型定义
      decorator.ts   # 装饰器实现
      index.ts       # 导出文件
      {plugin-name}-plugin.test.ts  # 测试文件
  index.ts          # 主入口文件
```

## 核心架构原则

### 1. 显式插件注册

**重要**: 所有插件必须显式注册，框架不会自动包含任何默认插件。

```typescript
// ✅ 正确：显式注册所有需要的插件
const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new RoutePlugin(),
  new CachePlugin()
);

// ❌ 错误：不要假设任何插件会自动注册
```

### 2. 优先级驱动的洋葱圈模型

插件系统采用优先级驱动的洋葱圈模型：

- **优先级数值越小，优先级越高**（越先执行）
- 引擎自动按优先级排序，用户无需关心注册顺序
- 使用 `handler.wrap()` 构建包装链

```typescript
export enum PluginPriority {
  SYSTEM = 50,        // 系统级插件（优雅停机等）
  SECURITY = 100,     // 安全相关插件（限流、认证等）
  LOGGING = 200,      // 日志、监控插件
  BUSINESS = 300,     // 业务逻辑插件（默认）
  PERFORMANCE = 400,  // 性能优化插件（缓存等）
  ROUTE = 1000,       // 路由插件（必须最后执行）
}
```

### 3. 类型安全优先

- 所有 API 必须提供完整的 TypeScript 类型定义
- 使用 Zod 进行运行时类型验证
- 利用 TypeScript 的类型推断能力

### 4. 装饰器驱动

使用装饰器简化 API 定义：

```typescript
@Module("users")
class UserService {
  @Action({
    description: "获取用户",
    params: [z.string()],
    returns: UserSchema,
  })
  async getUser(id: string): Promise<User> {
    // ...
  }
}
```

## 代码风格规范

### TypeScript 配置

- **严格模式**: `strict: true`
- **目标**: ES2022
- **模块系统**: CommonJS（编译后）
- **JSX**: 使用 `hono/jsx`（`jsx: "react-jsx"`, `jsxImportSource: "hono/jsx"`）
- **装饰器**: 不使用实验性装饰器（`experimentalDecorators: false`）

### 命名规范

- **类名**: PascalCase（如 `RoutePlugin`, `CacheAdapter`）
- **接口/类型**: PascalCase（如 `RouteOptions`, `HandlerMetadata`）
- **函数/方法**: camelCase（如 `onHandlerLoad`, `createTestEngine`）
- **常量**: UPPER_SNAKE_CASE（如 `DEFAULT_TEST_OPTIONS`）
- **文件**: kebab-case（如 `route-plugin.test.ts`, `mock-etcd.ts`）

### 注释规范

- **JSDoc**: 所有公共 API 必须提供 JSDoc 注释
- **示例代码**: 使用 `@example` 标签提供使用示例
- **类型说明**: 复杂类型必须添加注释说明

```typescript
/**
 * RoutePlugin - 核心路由插件
 * 负责解析type="route"的Handler元数据，注册HTTP路由到Hono实例
 *
 * @example
 * ```typescript
 * const routePlugin = new RoutePlugin({
 *   prefix: "/api",
 *   globalMiddlewares: [authMiddleware],
 * });
 * ```
 */
export class RoutePlugin implements Plugin<RouteModuleOptions> {
  // ...
}
```

### 导入顺序

1. 外部依赖（如 `hono`, `zod`）
2. 内部核心模块（如 `../../core/types`）
3. 内部插件模块（如 `./types`）
4. 类型导入使用 `import type`

```typescript
import { Context, MiddlewareHandler } from "hono";
import { Microservice } from "../../core/engine";
import logger from "../../core/logger";
import {
  HandlerMetadata,
  Plugin,
  PluginPriority,
} from "../../core/types";
import type { RouteOptions, RoutePluginOptions } from "./types";
```

### 导出规范

- **默认导出**: 仅用于单例（如 `logger`）
- **命名导出**: 优先使用命名导出
- **类型导出**: 使用 `export type` 或 `export { type ... }`

```typescript
// ✅ 正确
export class RoutePlugin { }
export type { RouteOptions };
export { Route } from "./decorator";

// ❌ 避免
export default RoutePlugin;
```

## 插件开发指南

### 插件接口

所有插件必须实现 `Plugin<TModuleOptions>` 接口：

```typescript
export interface Plugin<TModuleOptions = Record<string, any>> {
  name: string;
  priority?: PluginPriority | number;
  getModuleOptionsSchema?: () => PluginModuleOptionsSchema<TModuleOptions>;
  onInit?: (engine: Microservice) => void;
  onModuleLoad?: (modules: ModuleMetadata[]) => void;
  onHandlerLoad?: (handlers: HandlerMetadata[]) => void;
  onBeforeStart?: (engine: Microservice) => void;
  onAfterStart?: (engine: Microservice) => void | Promise<void>;
  onDestroy?: () => void | Promise<void>;
}
```

### 插件文件结构

每个插件应包含以下文件：

```
src/plugins/{plugin-name}/
  plugin.ts          # 插件主逻辑（实现 Plugin 接口）
  types.ts           # 类型定义（Options, Config 等）
  decorator.ts       # 装饰器实现（如 @Route, @Cache）
  index.ts           # 导出文件（导出插件类、装饰器、类型）
  {plugin-name}-plugin.test.ts  # 测试文件
```

**可选文件**（当代码复杂时建议拆分）：

```
src/plugins/{plugin-name}/
  utils.ts           # 工具函数（如参数验证、类型转换等）
  utils.test.ts      # 工具函数测试
  adapter.ts         # 适配器接口和实现（如缓存适配器、存储适配器）
  adapter.test.ts    # 适配器测试
  generator.ts       # 代码生成器（如客户端代码生成）
  generator.test.ts  # 生成器测试
  scheduler.ts       # 调度器（如定时任务调度器）
  mock-*.ts          # Mock 实现（如测试用的 Mock 对象）
  format.ts          # 格式化工具（如代码格式化）
  # ... 其他独立功能模块
```

**拆分原则**：
- 如果核心代码复杂或实现中的某些过程能单独拆成工具或独立实现，应当在模块目录下新建文件
- 每个独立的功能模块都应配备对应的测试文件
- 这样可以实现更清晰的架构和更好的测试覆盖

### 插件实现示例

```typescript
// types.ts
export interface MyPluginOptions {
  option1?: string;
  option2?: number;
}

export interface MyPluginModuleOptions {
  moduleOption?: boolean;
}

// plugin.ts
import { Plugin, PluginPriority } from "../../core/types";
import type { MyPluginModuleOptions, MyPluginOptions } from "./types";

export class MyPlugin implements Plugin<MyPluginModuleOptions> {
  public readonly name = "my-plugin";
  public readonly priority = PluginPriority.BUSINESS;
  
  private options: MyPluginOptions;
  
  constructor(options?: MyPluginOptions) {
    this.options = options || {};
  }
  
  getModuleOptionsSchema(): PluginModuleOptionsSchema<MyPluginModuleOptions> {
    return {
      _type: {} as MyPluginModuleOptions,
      validate: (options) => {
        // 验证逻辑
        return true;
      },
    };
  }
  
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    for (const handler of handlers) {
      if (handler.type === "my-type") {
        handler.wrap(async (next, instance, ...args) => {
          // 前置逻辑
          const result = await next();
          // 后置逻辑
          return result;
        });
      }
    }
  }
}

// decorator.ts
import { createMethodDecorator } from "../../metadata/metadata";
import type { MyPluginOptions } from "./types";

export function MyDecorator(options?: MyPluginOptions) {
  return createMethodDecorator({
    type: "my-type",
    options: options || {},
  });
}

// index.ts
export { MyPlugin } from "./plugin";
export { MyDecorator } from "./decorator";
export type { MyPluginOptions, MyPluginModuleOptions } from "./types";
```

### 代码拆分最佳实践

当插件代码复杂时，应该将独立的功能拆分成单独的文件，以提高代码可维护性和测试覆盖率。

#### 何时拆分

以下情况建议拆分代码：

1. **工具函数**: 参数验证、类型转换、数据格式化等可复用的工具函数
2. **适配器模式**: 需要支持多种实现的接口（如缓存适配器、存储适配器）
3. **代码生成器**: 生成客户端代码、类型定义等复杂逻辑
4. **调度器**: 定时任务调度、任务队列等独立功能
5. **Mock 实现**: 测试用的 Mock 对象（如 `mock-etcd.ts`）
6. **格式化工具**: 代码格式化、模板渲染等

#### 拆分示例

**示例 1: 工具函数拆分**

```typescript
// utils.ts - 独立的工具函数
/**
 * 构建参数验证 Schema
 */
export function buildParamsSchema(
  schemas: z.ZodTypeAny[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  // 实现逻辑
}

// utils.test.ts - 工具函数测试
describe("buildParamsSchema", () => {
  it("应该正确构建参数 Schema", () => {
    // 测试逻辑
  });
});

// plugin.ts - 插件主逻辑中使用工具函数
import { buildParamsSchema } from "./utils";

export class ActionPlugin implements Plugin {
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 使用 buildParamsSchema
  }
}
```

**示例 2: 适配器拆分**

```typescript
// adapter.ts - 适配器接口和实现
export interface CacheAdapter {
  get<T>(key: string): Promise<CacheItem<T> | null>;
  set<T>(key: string, item: CacheItem<T>): Promise<void>;
}

export class MemoryCacheAdapter implements CacheAdapter {
  // 实现逻辑
}

// adapter.test.ts - 适配器测试
describe("MemoryCacheAdapter", () => {
  it("应该正确存储和获取缓存", async () => {
    // 测试逻辑
  });
});

// plugin.ts - 插件主逻辑中使用适配器
import { CacheAdapter, MemoryCacheAdapter } from "./adapter";

export class CachePlugin implements Plugin {
  constructor(adapter?: CacheAdapter) {
    this.adapter = adapter || new MemoryCacheAdapter();
  }
}
```

**示例 3: 代码生成器拆分**

```typescript
// generator.ts - 代码生成器
export function generateClientCode(modules: ModuleInfo[]): string {
  // 生成逻辑
}

// generator.test.ts - 生成器测试
describe("generateClientCode", () => {
  it("应该正确生成客户端代码", () => {
    // 测试逻辑
  });
});

// plugin.ts - 插件主逻辑中使用生成器
import { generateClientCode } from "./generator";

export class ClientCodePlugin implements Plugin {
  onAfterStart(engine: Microservice): void {
    const code = generateClientCode(modules);
    // 使用生成的代码
  }
}
```

#### 拆分的好处

1. **清晰的架构**: 每个文件职责单一，易于理解
2. **更好的测试覆盖**: 独立的功能模块可以单独测试
3. **代码复用**: 工具函数可以在多个地方复用
4. **易于维护**: 修改某个功能时不会影响其他部分
5. **类型安全**: 每个模块都有明确的类型定义

#### 实际项目示例

参考以下插件中的拆分实践：

- **Action 插件**: `utils.ts` - 参数验证工具函数
- **Cache 插件**: `adapter.ts` - 缓存适配器接口和实现
- **ClientCode 插件**: `generator.ts`, `format.ts`, `utils.ts` - 代码生成、格式化、工具函数
- **Schedule 插件**: `scheduler.ts`, `utils.ts`, `mock-etcd.ts` - 调度器、工具函数、Mock 实现

### handler.wrap() 使用规范

`handler.wrap()` 用于构建洋葱圈包装链：

```typescript
handler.wrap(async (next, instance, ...args) => {
  // 前置逻辑：在原始方法执行前
  try {
    const result = await next(); // 调用下一个包装层或原始方法
    // 后置逻辑：在原始方法执行后（成功）
    return result;
  } catch (error) {
    // 错误处理
    throw error;
  }
});
```

**注意事项**:
- `next()` 必须被调用，否则原始方法不会执行
- `next()` 返回 Promise，必须使用 `await`
- 可以修改 `args` 或 `result`，但需谨慎

## 测试编写规范

### 测试框架

- **框架**: Vitest
- **文件命名**: `{name}-plugin.test.ts` 或 `{name}.test.ts`
- **测试结构**: `describe` → `it` / `test`

### 测试辅助工具

使用 `Testing.createTestEngine` 创建测试引擎：

```typescript
import { Testing } from "../../core/testing";
import { RoutePlugin } from "./index";

describe("RoutePlugin", () => {
  let engine: ReturnType<typeof Testing.createTestEngine>["engine"];
  let Module: ReturnType<typeof Testing.createTestEngine>["Module"];
  
  beforeEach(() => {
    const testEngine = Testing.createTestEngine({
      plugins: [new RoutePlugin()],
    });
    engine = testEngine.engine;
    Module = testEngine.Module;
  });
  
  it("应该正确注册路由", async () => {
    @Module("test-module")
    class TestService {
      @Route({ path: "/test" })
      test() {
        return { ok: true };
      }
    }
    
    const port = await engine.start(0); // 使用 0 获取随机端口
    const response = await fetch(`http://127.0.0.1:${port}/test`);
    expect(response.ok).toBe(true);
    await engine.stop();
  });
});
```

### 测试方法选择：`engine.handler` vs `engine.request`

**重要**: 根据测试场景选择合适的测试方法，避免不必要的 HTTP 服务器启动。

#### `engine.handler` - 用于不依赖 Hono 的场景

**适用场景**：
- Action 插件测试（不涉及 Hono 中间件）
- Cache 插件测试
- 其他不依赖 HTTP 层的插件测试
- 测试远程 RPC 调用逻辑

**优势**：
- 无需启动 HTTP 服务器，测试更快
- 更符合 RPC 调用的语义
- 完整的类型推导支持
- 自动执行包装链（缓存、限流等）

**使用示例**：

```typescript
@Module("users")
class UserService {
  @Action({ params: [z.string()] })
  getUser(id: string): { id: string; name: string } {
    return { id, name: "Alice" };
  }
}

// 获取 handler 并调用（类型自动推导）
const getUserHandler = engine.handler(UserService, "getUser");
const result = await getUserHandler("123");
// result 的类型自动推导为 { id: string; name: string }

// 链式调用
const result2 = await engine.handler(UserService, "getUser")("123");
```

#### `engine.request` - 用于依赖 Hono 的场景

**适用场景**：
- Route 插件测试（需要测试路由、中间件、Context 等）
- 需要测试完整 HTTP 请求/响应流程的场景
- 需要测试 Hono 中间件的场景

**优势**：
- 完整执行 Hono 中间件链
- 支持所有 HTTP 方法和请求选项
- 返回标准 `Response` 对象
- 无需启动 HTTP 服务器

**使用示例**：

```typescript
@Module("users")
class UserService {
  @Route({ path: "/users/:id" })
  getUser(ctx: Context) {
    const id = ctx.req.param("id");
    return { id, name: "Alice" };
  }
}

// 使用 request 方法（完整执行中间件）
const response = await engine.request("/users/123");
const data = await response.json();
// data = { id: "123", name: "Alice" }

// 使用 Request 对象
const request = new Request("http://localhost/users/123", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Bob" }),
});
const response2 = await engine.request(request);
```

#### 选择指南

| 场景 | 使用方法 | 原因 |
|------|---------|------|
| Action 插件测试 | `engine.handler` | 不依赖 Hono，表示 RPC 调用 |
| Route 插件测试 | `engine.request` | 需要测试路由和中间件 |
| Cache 插件测试 | `engine.handler` | 不依赖 Hono，测试包装链 |
| 中间件测试 | `engine.request` | 需要完整执行中间件链 |
| 集成测试 | `fetch` + `engine.start()` | 需要真实 HTTP 服务器 |

**注意事项**：
- **集成测试**：应使用 `fetch` + `engine.start()` 启动真实 HTTP 服务器，确保测试场景接近生产环境
- **engine.test.ts 中的特定测试**：可能故意设计为测试特定功能，保持原有方式
- **避免混用**：在同一测试文件中保持一致的测试方法

### 端口使用规范

**重要**: 测试中必须使用随机端口（`0`）避免端口冲突：

```typescript
// ✅ 正确
const port = await engine.start(0);

// ❌ 错误：不要使用固定端口
const port = await engine.start(3000);
```

**注意**: 使用 `engine.handler` 或 `engine.request` 时，无需启动 HTTP 服务器，因此不需要考虑端口问题。

### 异步测试

- 所有涉及 HTTP 请求的测试必须使用 `async/await`
- 使用 `Testing.wait()` 等待异步操作完成（如定时任务）

```typescript
it("应该等待异步操作", async () => {
  // 执行操作
  await Testing.wait(100); // 等待 100ms
  // 验证结果
});
```

### 测试覆盖

- **单元测试**: 测试单个函数/方法的行为
- **集成测试**: 测试插件与引擎的集成
- **边界测试**: 测试边界条件和错误情况

### Mock 使用

- 使用 `vi.fn()` 创建 mock 函数
- 使用 `vi.mock()` mock 模块（如需要）
- Mock 实现应放在单独文件（如 `mock-etcd.ts`）

## 错误处理规范

### 自定义错误类

定义继承 `Error` 的自定义错误类：

```typescript
// src/core/errors.ts
export class PluginNameRequiredError extends Error {
  constructor(pluginName?: string) {
    super(
      `Plugin name is required${pluginName ? ` (plugin: ${pluginName})` : ""}`
    );
    this.name = "PluginNameRequiredError";
  }
}
```

### 错误日志记录

使用 `logger` 记录错误：

```typescript
import logger from "../../core/logger";

try {
  // ...
} catch (error) {
  logger.error(`Error in ${context}`, error);
  throw error; // 或返回默认错误响应
}
```

### 错误转换（RoutePlugin）

`RoutePlugin` 支持错误转换函数：

```typescript
const routePlugin = new RoutePlugin({
  errorTransformer: async (ctx, error, handler) => {
    // 自定义错误响应
    return ctx.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  },
});
```

## 类型系统规范

### Zod Schema 定义

使用 Zod 定义运行时验证 Schema：

```typescript
import { z } from "nebula-engine";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().min(0),
});

type User = z.infer<typeof UserSchema>;
```

### 类型导出

- 使用 `export type` 导出类型
- 在 `index.ts` 中统一导出类型

```typescript
// types.ts
export interface RouteOptions { }
export type RoutePluginOptions = { };

// index.ts
export type { RouteOptions, RoutePluginOptions } from "./types";
```

### 类型推断

充分利用 TypeScript 类型推断：

```typescript
// ✅ 正确：利用类型推断
const options = { prefix: "/api" };
const plugin = new RoutePlugin(options);

// ❌ 避免：不必要的类型注解
const options: RoutePluginOptions = { prefix: "/api" };
```

## 常见任务指南

### 添加新插件

1. 在 `src/plugins/{plugin-name}/` 创建插件目录
2. 创建 `types.ts` 定义类型
3. 创建 `plugin.ts` 实现插件逻辑
4. 创建 `decorator.ts` 实现装饰器（如需要）
5. 创建 `index.ts` 导出所有内容
6. 创建 `{plugin-name}-plugin.test.ts` 编写测试
7. 在 `src/index.ts` 中导出插件

### 修改现有插件

1. **先阅读现有代码**: 理解插件的工作原理
2. **更新类型定义**: 如需要，先更新 `types.ts`
3. **实现功能**: 在 `plugin.ts` 中实现
4. **添加测试**: 在测试文件中添加测试用例
5. **更新文档**: 如需要，更新 README.md

### 修复 Bug

1. **重现问题**: 编写测试用例重现 bug
2. **定位问题**: 使用调试工具定位问题
3. **修复问题**: 修复代码
4. **验证修复**: 运行测试验证修复
5. **添加回归测试**: 确保 bug 不会再次出现

### 添加新功能

1. **设计 API**: 先设计 API 接口和类型
2. **实现功能**: 实现核心功能
3. **编写测试**: 编写完整的测试用例
4. **更新文档**: 更新 README.md 和相关文档
5. **考虑向后兼容**: 确保新功能不影响现有代码

## 禁止事项

### ❌ 不要做的事情

1. **不要使用默认插件**: 所有插件必须显式注册
2. **不要使用固定端口**: 测试中必须使用随机端口（`0`）
3. **不要忽略类型**: 所有代码必须有完整的类型定义
4. **不要跳过测试**: 新功能必须包含测试
5. **不要破坏向后兼容**: 修改 API 时考虑向后兼容性
6. **不要使用实验性装饰器**: 使用 `createMethodDecorator` 和 `createClassDecorator`
7. **不要直接修改核心代码**: 优先通过插件扩展功能
8. **不要忽略错误处理**: 所有错误必须被正确处理和记录

### ✅ 应该做的事情

1. **显式注册插件**: 使用 `Factory.create()` 显式注册所有插件
2. **使用随机端口**: 测试中使用 `engine.start(0)`
3. **提供完整类型**: 所有公共 API 必须有类型定义
4. **编写测试**: 新功能必须包含测试用例
5. **使用 JSDoc**: 所有公共 API 必须有文档注释
6. **遵循命名规范**: 遵循项目的命名规范
7. **使用 logger**: 使用 `logger` 记录日志，不要使用 `console.log`
8. **处理错误**: 正确处理和记录所有错误

## 参考资源

- [README.md](./README.md) - 项目主文档
- [docs/plugin-system.md](./docs/plugin-system.md) - 插件系统详细文档
- [src/core/types.ts](./src/core/types.ts) - 核心类型定义
- [src/core/testing.ts](./src/core/testing.ts) - 测试辅助工具

## 总结

遵循本指南可以确保代码质量、一致性和可维护性。在编写代码时，始终考虑：

1. **类型安全**: 充分利用 TypeScript 的类型系统
2. **测试覆盖**: 确保新功能有完整的测试覆盖
3. **文档完整**: 提供清晰的文档和示例
4. **错误处理**: 正确处理和记录所有错误
5. **向后兼容**: 考虑现有代码的兼容性

如有疑问，请参考现有代码实现或查阅项目文档。

