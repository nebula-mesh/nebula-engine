# SchedulePlugin - 调度任务插件

## 概述

`SchedulePlugin` 是一个基于 etcd 选举机制的分布式定时任务插件。它确保在多个微服务实例中，只有一个实例会执行定时任务，避免重复执行。

## 功能特性

- ✅ 基于 etcd 的分布式选举机制
- ✅ 支持固定频率（FIXED_RATE）和固定延迟（FIXED_DELAY）两种调度模式
- ✅ 自动故障转移：当 leader 实例宕机时，其他实例会自动接管
- ✅ 集成 OpenTelemetry 追踪
- ✅ 优雅关闭：停止时自动清理所有定时器和选举

## 安装依赖

```bash
npm install etcd3
```

## 使用方法

### 方式一：使用真实的 etcd（生产环境）

#### 1. 创建 etcd 客户端

```typescript
import { Etcd3 } from "etcd3";

const etcdClient = new Etcd3({
  hosts: ["localhost:2379"],
  // 可选：认证信息
  auth: {
    username: "root",
    password: "password",
  },
});
```

#### 2. 创建引擎并注册插件

```typescript
import { Factory } from "@imean/service-engine";
import { SchedulePlugin } from "@imean/service-engine/plugins/schedule";
import { Etcd3 } from "etcd3";

const etcdClient = new Etcd3({
  hosts: ["localhost:2379"],
});

const { Module, Microservice } = Factory.create(
  new SchedulePlugin({
    etcdClient,
  })
);
```

### 方式二：使用 Mock Etcd（测试和本地开发）

如果不想依赖真实的 etcd 服务，可以使用内置的 Mock Etcd。Mock Etcd 会自动选举自己作为 leader，适合单实例开发和测试场景。

```typescript
import { Factory } from "@imean/service-engine";
import { SchedulePlugin } from "@imean/service-engine/plugins/schedule";

const { Module, Microservice } = Factory.create(
  new SchedulePlugin({
    useMockEtcd: true, // 启用 Mock Etcd，无需真实 etcd 服务
  })
);
```

**注意**：
- `useMockEtcd: true` 时，插件会自动使用内置的 `MockEtcd3`
- Mock Etcd 始终选举自己作为 leader，适合单实例场景
- 如果同时提供了 `etcdClient` 和 `useMockEtcd: true`，会优先使用提供的 `etcdClient`

### 3. 使用 @Schedule 装饰器

```typescript
import { Module } from "./engine";
import { Schedule, ScheduleMode } from "@imean/service-engine/plugins/schedule";

@Module("user-service")
class UserService {
  /**
   * 固定频率模式：每 5 秒执行一次
   * 无论任务执行时间多长，都会按照固定间隔执行
   */
  @Schedule({
    interval: 5000, // 5 秒
    mode: ScheduleMode.FIXED_RATE,
  })
  async syncUsers() {
    console.log("同步用户数据...");
    // 执行同步逻辑
  }

  /**
   * 固定延迟模式：任务执行完成后，等待 10 秒再执行下一次
   * 如果任务执行了 15 秒，则下次执行在 25 秒后
   */
  @Schedule({
    interval: 10000, // 10 秒
    mode: ScheduleMode.FIXED_DELAY,
  })
  async cleanupExpiredData() {
    console.log("清理过期数据...");
    // 执行清理逻辑
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 模拟耗时操作
  }
}
```

### 4. 启动引擎

```typescript
const engine = new Microservice({
  name: "my-service",
  version: "1.0.0",
});

await engine.start(3000);
```

## 调度模式说明

### FIXED_RATE（固定频率）

- **特点**：无论任务执行时间多长，都会按照固定间隔执行
- **适用场景**：需要定期执行的任务，执行时间较短且稳定
- **示例**：每 5 秒检查一次系统状态

```typescript
@Schedule({
  interval: 5000,
  mode: ScheduleMode.FIXED_RATE,
})
async checkSystemStatus() {
  // 快速检查系统状态
}
```

### FIXED_DELAY（固定延迟）

- **特点**：任务执行完成后，等待固定间隔再执行下一次
- **适用场景**：任务执行时间不确定，需要等待上次任务完成后再执行
- **示例**：数据同步任务，需要等待上次同步完成

```typescript
@Schedule({
  interval: 60000, // 1 分钟
  mode: ScheduleMode.FIXED_DELAY,
})
async syncData() {
  // 可能执行 30 秒或更长时间
  await longRunningTask();
}
```

## 选举机制

插件使用 etcd 的选举机制来确保只有一个实例执行任务：

1. **选举键格式**：`/schedule/{serviceName}/{moduleName}/{methodName}`
2. **服务 ID**：每个实例使用唯一的服务 ID 参与选举
3. **自动故障转移**：当 leader 实例宕机时，etcd 会自动选择新的 leader

## 注意事项

1. **etcd 配置**：必须正确配置 etcd 客户端，否则调度任务不会启动
2. **网络连接**：确保所有实例都能连接到 etcd 集群
3. **任务幂等性**：建议任务设计为幂等的，避免重复执行导致的问题
4. **资源清理**：引擎停止时会自动清理所有定时器和选举，无需手动处理

## 错误处理

插件会自动记录错误日志，但不会中断引擎的运行：

- 如果 etcd 连接失败，会记录警告日志，但不会启动调度任务
- 如果任务执行失败，会记录错误日志，但不会影响其他任务
- 如果选举失败，会记录错误日志，但不会影响其他功能

## 示例：完整的使用场景

```typescript
import { Factory } from "@imean/service-engine";
import { SchedulePlugin, Schedule, ScheduleMode } from "@imean/service-engine/plugins/schedule";
import { Etcd3 } from "etcd3";

// 1. 创建 etcd 客户端
const etcdClient = new Etcd3({
  hosts: ["etcd1:2379", "etcd2:2379", "etcd3:2379"],
});

// 2. 创建引擎
const { Module, Microservice } = Factory.create(
  new SchedulePlugin({
    etcdClient,
  })
);

// 3. 定义服务模块
@Module("data-service")
class DataService {
  @Schedule({
    interval: 30000, // 30 秒
    mode: ScheduleMode.FIXED_RATE,
  })
  async syncData() {
    console.log("同步数据...");
    // 同步逻辑
  }

  @Schedule({
    interval: 600000, // 10 分钟
    mode: ScheduleMode.FIXED_DELAY,
  })
  async cleanupOldData() {
    console.log("清理旧数据...");
    // 清理逻辑
  }
}

// 4. 启动引擎
const engine = new Microservice({
  name: "data-service",
  version: "1.0.0",
});

await engine.start(3000);
console.log("服务已启动，调度任务已注册");
```

### 本地开发/测试（使用 Mock Etcd）

```typescript
import { Factory } from "@imean/service-engine";
import { SchedulePlugin, Schedule, ScheduleMode } from "@imean/service-engine/plugins/schedule";

// 1. 创建引擎（使用 Mock Etcd，无需真实 etcd 服务）
const { Module, Microservice } = Factory.create(
  new SchedulePlugin({
    useMockEtcd: true, // 启用 Mock Etcd
  })
);

// 2. 定义服务模块
@Module("data-service")
class DataService {
  @Schedule({
    interval: 30000, // 30 秒
    mode: ScheduleMode.FIXED_RATE,
  })
  async syncData() {
    console.log("同步数据...");
    // 同步逻辑
  }
}

// 3. 启动引擎
const engine = new Microservice({
  name: "data-service",
  version: "1.0.0",
});

await engine.start(3000);
console.log("服务已启动，调度任务已注册（使用 Mock Etcd）");
```

## API 参考

### ScheduleOptions

```typescript
interface ScheduleOptions {
  /**
   * 执行间隔（毫秒）
   */
  interval: number;

  /**
   * 调度模式（默认 FIXED_RATE）
   */
  mode?: ScheduleMode;
}
```

### SchedulePluginOptions

```typescript
interface SchedulePluginOptions {
  /**
   * Etcd3 客户端实例
   * 如果未提供且 useMockEtcd 为 false，插件将不会启动调度任务
   */
  etcdClient?: Etcd3;

  /**
   * 是否使用 Mock Etcd（用于测试和本地开发）
   * 当设置为 true 时，将使用内置的 MockEtcd3，始终选举自己作为 leader
   * 这样可以在没有真实 etcd 的情况下运行调度任务
   * 
   * @default false
   */
  useMockEtcd?: boolean;
}
```

## 测试

### 单元测试（使用 Mock ETCD）

默认的测试使用 `MockEtcd3`，无需真实的 ETCD 服务：

```bash
npm test src/plugins/schedule/schedule-plugin.test.ts
```

### 集成测试（使用真实 ETCD）

为了验证插件与真实 ETCD 的集成，项目提供了专门的集成测试文件 `schedule-plugin-etcd.test.ts`。

#### 启动 ETCD 服务（使用 Docker）

**Linux/macOS:**

```bash
docker run -d --name etcd-test \
  -p 2379:2379 \
  -p 2380:2380 \
  -e ALLOW_NONE_AUTHENTICATION=yes \
  bitnami/etcd:latest
```

**Windows (PowerShell):**

```powershell
docker run -d --name etcd-test `
  -p 2379:2379 `
  -p 2380:2380 `
  -e ALLOW_NONE_AUTHENTICATION=yes `
  bitnami/etcd:latest
```

#### 运行真实 ETCD 测试

```bash
# 运行所有测试（包括真实 ETCD 测试）
npm test src/plugins/schedule/schedule-plugin-etcd.test.ts

# 运行特定测试
npm test -- src/plugins/schedule/schedule-plugin-etcd.test.ts -t "基本功能"
```

**注意**：
- 如果 ETCD 服务不可用，测试会自动跳过并显示提示信息
- 测试会自动清理 ETCD 中的测试数据（使用 `/schedule/` 前缀）
- 可以通过环境变量 `ETCD_HOSTS` 指定 ETCD 地址（默认 `127.0.0.1:2379`）

#### 停止和清理 ETCD 服务

**Linux/macOS:**

```bash
docker stop etcd-test && docker rm etcd-test
```

**Windows (PowerShell):**

```powershell
docker stop etcd-test; docker rm etcd-test
```

### 真实 ETCD 测试覆盖的场景

集成测试覆盖以下场景：

1. **基本功能**
   - 使用真实 ETCD 客户端启动调度任务
   - 支持 FIXED_RATE 和 FIXED_DELAY 模式

2. **分布式选举**
   - 多个实例中只有一个执行任务（分布式锁）
   - Leader 停止后由其他实例接管

3. **错误处理**
   - ETCD 连接错误处理
   - 任务执行错误处理

4. **清理和停止**
   - 引擎停止时正确清理资源
   - 能够正常重启

5. **性能和稳定性**
   - 处理大量并发任务
   - 长时间稳定运行

