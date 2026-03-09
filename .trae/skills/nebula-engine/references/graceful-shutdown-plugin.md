# GracefulShutdown Plugin

GracefulShutdown（优雅停机）插件确保服务在停止时能够优雅地处理完所有正在进行的请求，避免请求中断导致的数据问题。

## 快速开始

```typescript
import { Factory, ActionPlugin, GracefulShutdownPlugin, Module, Action } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new GracefulShutdownPlugin()  // 默认配置
);

const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});

@Module("user")
class UserService {
  @Action({})
  async processData(id: string) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { id, status: "done" };
  }
}

engine.start({ port: 3000 });
```

## 工作原理

GracefulShutdown 插件在服务停止时：

1. **追踪请求** - 记录正在处理的请求数量
2. **接收信号** - 监听 SIGINT 信号（Ctrl+C）
3. **停止接收新请求** - 拒绝新的请求
4. **等待处理完成** - 等待现有请求处理完成
5. **超时保护** - 如果超时则强制停机
6. **退出进程** - 调用 process.exit(0)

## 使用场景

### 防止请求中断

```typescript
@Module("order")
class OrderService {
  @Action({})
  async createOrder(data: any) {
    // 模拟订单创建流程
    await saveToDatabase(data);
    await sendNotification(data);
    await updateInventory(data);
    return { success: true };
  }
}
```

如果没有优雅停机，在处理订单时按 Ctrl+C，可能导致：
- 订单数据只保存了一半
- 通知未发送
- 库存未更新

使用 GracefulShutdown 插件后：
- 按 Ctrl+C 时，插件会等待当前订单处理完成
- 确保数据一致性

### 数据导出

```typescript
@Module("export")
class ExportService {
  @Action({})
  async exportLargeData(format: string) {
    const data = await queryLargeDataset();
    await writeToFile(data, format);
    return { recordCount: data.length };
  }
}
```

导出大量数据时需要较长时间，优雅停机确保数据导出完整。

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| shutdownTimeout | `number` | 600000 | 停机超时时间（毫秒），默认 10 分钟 |
| enabled | `boolean` | true | 是否启用优雅停机 |

### 自定义超时时间

```typescript
new GracefulShutdownPlugin({
  shutdownTimeout: 30000, // 30 秒超时
})
```

### 禁用插件

```typescript
new GracefulShutdownPlugin({
  enabled: false, // 禁用优雅停机，立即停机
})
```

## 行为说明

### 正常停机流程

1. 服务运行中...
2. 用户按下 Ctrl+C（发送 SIGINT 信号）
3. 插件标记服务为"停机中"，拒绝新请求
4. 等待现有请求处理完成
5. 所有请求处理完毕，进程退出

```bash
# 启动服务
node server.ts
# 服务运行中...

# 按下 Ctrl+C
^C
# 等待请求处理完成...
# 停机完成，进程退出
```

### 超时停机流程

1. 服务运行中...
2. 用户按下 Ctrl+C
3. 插件开始等待请求完成
4. 30 秒后仍有请求未完成
5. 强制停机，进程退出

### API 可用性

- **正常运行时** - 所有请求正常处理
- **停机期间** - 新请求会收到错误响应

## 完整示例

### 服务端定义

```typescript
import { Factory, ActionPlugin, GracefulShutdownPlugin, Module, Action } from "nebula-engine";
import { z } from "nebula-engine";

const { Module, Microservice } = Factory.create(
  new ActionPlugin(),
  new GracefulShutdownPlugin({
    shutdownTimeout: 60000, // 1 分钟超时
  })
);

const engine = new Microservice({
  name: "order-service",
  version: "1.0.0",
  prefix: "/api",
});

// 模拟订单数据
const orders = new Map<string, any>();

@Module("order")
class OrderService {
  /**
   * 创建订单 - 需要完整的事务处理
   */
  @Action({
    params: [z.string(), z.number()],
    returns: z.object({
      orderId: z.string(),
      status: z.string(),
    }),
  })
  async createOrder(productName: string, quantity: number) {
    // 模拟多个步骤的处理
    await new Promise((resolve) => setTimeout(resolve, 500)); // 验证库存
    await new Promise((resolve) => setTimeout(resolve, 500)); // 创建订单记录
    await new Promise((resolve) => setTimeout(resolve, 500)); // 扣减库存
    await new Promise((resolve) => setTimeout(resolve, 500)); // 发送通知

    const orderId = `order-${Date.now()}`;
    const order = {
      orderId,
      productName,
      quantity,
      status: "created",
    };
    orders.set(orderId, order);

    return { orderId, status: "created" };
  }

  /**
   * 获取订单
   */
  @Action({
    params: [z.string()],
    returns: z.object({
      orderId: z.string(),
      status: z.string(),
    }).nullable(),
  })
  getOrder(orderId: string) {
    return orders.get(orderId) || null;
  }
}

engine.start({ port: 3000 });
```

### 停机测试

```bash
# 1. 启动服务
node server.ts
# 服务运行在 http://localhost:3000

# 2. 发送一个长时间处理的请求
curl -X POST "http://localhost:3000/api/order/createOrder" \
  -H "Content-Type: application/ejson" \
  -d '{"0":"商品A","1":2}'

# 3. 在请求处理期间按下 Ctrl+C
^C

# 4. 观察日志
# - 插件检测到停机信号
# - 等待当前请求完成
# - 请求完成后自动退出
```

## 注意事项

1. **自动启用** - 插件默认启用，无需额外配置
2. **信号处理** - 监听 SIGINT 信号（Ctrl+C）
3. **超时保护** - 防止无限等待，设置合理的超时时间
4. **进程退出** - 停机完成后会自动调用 process.exit(0)
5. **生产环境** - 强烈建议在生产环境中启用，确保数据一致性
