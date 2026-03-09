# Telemetry Plugin

Telemetry（遥测）插件提供分布式追踪功能，自动收集请求的调用链、性能指标和错误信息，帮助监控和调试微服务。

## 快速开始

```typescript
import { Factory, ActionPlugin, TelemetryPlugin, Module, Action } from "nebula-engine";
import { SpanCollector, ConsoleExporter } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new TelemetryPlugin({
    serviceName: "my-service",
    exporter: new ConsoleExporter(),
  })
);

const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});

@Module("user")
class UserService {
  @Action({})
  getUser(id: string) {
    return { id, name: "张三" };
  }
}

engine.start({ port: 3000 });
```

## 工作原理

Telemetry 插件在每个请求处理时：

1. **生成追踪 ID** - 为每个请求生成唯一的 traceId 和 spanId
2. **收集数据** - 记录模块名、方法名、参数、返回值、耗时等
3. **追踪缓存** - 配合 Cache 插件，标记缓存命中/未命中
4. **追踪错误** - 记录失败请求的错误信息
5. **导出数据** - 通过 Exporter 发送到追踪系统

## 数据模型

### TraceSpan

每次请求会产生一个 Span，包含以下信息：

| 字段 | 类型 | 说明 |
|------|------|------|
| traceId | `string` | 全局追踪 ID |
| spanId | `string` | 当前 Span ID |
| parentId | `string` | 父 Span ID |
| serviceName | `string` | 服务名称 |
| moduleName | `string` | 模块名称 |
| actionName | `string` | 方法名称 |
| params | `any[]` | 请求参数 |
| result | `any` | 返回结果 |
| cacheHit | `boolean` | 是否缓存命中 |
| duration | `number` | 执行耗时（毫秒） |
| success | `boolean` | 是否成功 |
| error | `string` | 错误信息 |

## 配置选项

### TelemetryPlugin 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| serviceName | `string` | 必填 | 服务名称 |
| serviceVersion | `string` | - | 服务版本 |
| exporter | `TelemetryExporter` | 必填 | 数据导出器 |
| batch | `{ size, flushInterval }` | - | 批量导出配置 |
| sampling | `{ rate, minDuration }` | - | 采样配置 |
| collect | `{ params, result, maxParamSize, maxResultSize }` | - | 数据收集配置 |

### 数据收集配置

```typescript
new TelemetryPlugin({
  serviceName: "my-service",
  exporter: new ConsoleExporter(),
  collect: {
    params: true,        // 收集请求参数
    result: false,       // 不收集返回结果
    maxParamSize: 1024,  // 参数最大长度
    maxResultSize: 2048, // 返回值最大长度
  },
})
```

### 采样配置

```typescript
new TelemetryPlugin({
  serviceName: "my-service",
  exporter: new ConsoleExporter(),
  sampling: {
    rate: 0.5,           // 采样率 50%
    minDuration: 100,    // 耗时超过 100ms 的请求必定采样
  },
})
```

### 批量导出配置

```typescript
new TelemetryPlugin({
  serviceName: "my-service",
  exporter: new ConsoleExporter(),
  batch: {
    size: 10,           // 积累 10 个 Span 后导出
    flushInterval: 5000, // 或者每 5 秒导出一次
  },
})
```

## 使用场景

### 性能监控

```typescript
@Module("order")
class OrderService {
  @Action({})
  async createOrder(data: any) {
    // 处理订单
    return { orderId: "123", status: "created" };
  }
}
```

通过 Telemetry 可以监控：
- 每个订单创建的平均耗时
- 哪些订单创建失败
- 缓存命中情况

### 错误追踪

```typescript
@Module("user")
class UserService {
  @Action({})
  getUser(id: string) {
    if (!id) {
      throw new Error("用户 ID 不能为空");
    }
    return { id, name: "张三" };
  }
}
```

错误信息会被自动记录：
```json
{
  "actionName": "getUser",
  "success": false,
  "error": "用户 ID 不能为空"
}
```

### 缓存命中率分析

配合 Cache 插件使用：

```typescript
@Module("product")
class ProductService {
  @Cache({ ttl: 60000 })
  @Action({})
  getProduct(id: string) {
    return { id, name: "商品A" };
  }
}
```

第二次调用会标记 `cacheHit: true`，帮助分析缓存效果。

## 导出器

### ConsoleExporter

控制台输出，适合开发和调试：

```typescript
import { ConsoleExporter } from "nebula-engine";

new TelemetryPlugin({
  serviceName: "my-service",
  exporter: new ConsoleExporter(),
})
```

输出示例：
```json
{
  "traceId": "abc123",
  "spanId": "span456",
  "moduleName": "user",
  "actionName": "getUser",
  "duration": 25,
  "success": true
}
```

### 自定义 Exporter

实现 TelemetryExporter 接口：

```typescript
class CustomExporter implements TelemetryExporter {
  private buffer: TraceSpan[] = [];

  async export(spans: TraceSpan[]): Promise<void> {
    this.buffer.push(...spans);
    
    // 发送到远程服务
    await fetch("http://telemetry-server:8080/collect", {
      method: "POST",
      body: JSON.stringify(this.buffer),
    });
    
    this.buffer = [];
  }
}

new TelemetryPlugin({
  serviceName: "my-service",
  exporter: new CustomExporter(),
})
```

### SpanCollector

内置的批量收集器：

```typescript
import { SpanCollector, ConsoleExporter } from "nebula-engine";

const collector = new SpanCollector({
  batchSize: 10,
  flushInterval: 5000,
}, new ConsoleExporter());

new TelemetryPlugin({
  serviceName: "my-service",
  exporter: collector,
})
```

## 分布式追踪

### 链路传播

Telemetry 插件会自动在请求头中传递追踪上下文：

```
X-Trace-TraceId: abc123
X-Trace-SpanId: span456
X-Trace-ParentId: parent789
```

### 跨服务追踪

服务 A 调用服务 B 时：

```typescript
// 服务 A
const response = await fetch("http://service-b/user/1", {
  headers: {
    "X-Trace-TraceId": currentTraceId,
    "X-Trace-SpanId": currentSpanId,
  },
});
```

服务 B 会接收这些 header 并创建子 Span，形成完整的调用链。

## 完整示例

### 服务端定义

```typescript
import { Factory, ActionPlugin, TelemetryPlugin, CachePlugin, Module, Action, Cache, ConsoleExporter } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new CachePlugin(),
  new TelemetryPlugin({
    serviceName: "user-service",
    serviceVersion: "1.0.0",
    exporter: new ConsoleExporter(),
    collect: {
      params: true,
      result: true,
      maxParamSize: 512,
      maxResultSize: 1024,
    },
    sampling: {
      rate: 1.0,
    },
  })
);

const engine = new Microservice({
  name: "user-service",
  version: "1.0.0",
  prefix: "/api",
});

const users = new Map([
  ["1", { id: "1", name: "张三", age: 25 }],
  ["2", { id: "2", name: "李四", age: 30 }],
]);

@Module("user")
class UserService {
  @Cache({ ttl: 60000 })
  @Action({
    params: [z.string()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }).nullable(),
  })
  getUser(id: string) {
    return users.get(id) || null;
  }

  @Action({
    params: [z.string(), z.string(), z.number()],
    returns: z.object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
    }),
  })
  createUser(name: string, email: string, age: number) {
    const id = String(users.size + 1);
    const user = { id, name, age };
    users.set(id, user);
    return user;
  }
}

engine.start({ port: 3000 });
```

### 输出示例

```json
{
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "spanId": "span001",
  "serviceName": "user-service",
  "moduleName": "user",
  "actionName": "getUser",
  "params": ["1"],
  "result": { "id": "1", "name": "张三", "age": 25 },
  "cacheHit": false,
  "duration": 12,
  "success": true
}
```

第二次调用相同参数：
```json
{
  "traceId": "550e8400-e29b-41d4-a716-446655440001",
  "spanId": "span002",
  "moduleName": "user",
  "actionName":  "params": "getUser",
 ["1"],
  "cacheHit": true,
  "duration": 2,
  "success": true
}
```

## 注意事项

1. **必填配置** - serviceName 和 exporter 是必填选项
2. **隐私保护** - 默认不收集 params 和 result，使用 collect 配置启用
3. **性能影响** - 生产环境建议使用采样率控制开销
4. **批量导出** - 使用 batch 配置减少网络开销
5. **配合其他插件** - 与 CachePlugin 配合可追踪缓存命中情况
