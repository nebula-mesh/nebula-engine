# 通用元数据工具库

## 概述

`metadata.ts` 是一个轻量级的装饰器元数据管理工具库，类似于 `reflect-metadata`，但更简单、更轻量。

## 特性

- ✅ 基于 Stage 3 装饰器标准（TypeScript 5.0+）
- ✅ 无需外部依赖
- ✅ 支持类装饰器和方法装饰器
- ✅ 支持方法装饰器多应用（同一方法可被多个装饰器标注）
- ✅ **支持双向访问**：通过 key 查找类，通过类查找 key
- ✅ 类型安全
- ✅ 简单够用

## 设计原理

### 核心数据结构

新设计采用**双向映射**机制，实现了装饰器 key 和类之间的双向访问：

#### 1. key -> classes 映射

```typescript
const keyToClassesMap = new Map<symbol, Set<Class>>();
```

- **用途**：记录某个装饰器 key 装饰了哪些类
- **存储位置**：全局 Map（非 WeakMap），因为需要能够遍历所有被装饰的类
- **访问方式**：通过 `getClassesByKey(key)` 获取所有被该 key 装饰的类

#### 2. class -> keys 映射

```typescript
// 通过 classMetadataStore 和固定的 DECORATED_KEYS_KEY 实现
const DECORATED_KEYS_KEY = Symbol.for("nebula:decoratedKeys");
// 存储在 classMetadataStore 中：classMetadataStore.get(class).get(DECORATED_KEYS_KEY) -> Set<symbol>
```

- **用途**：记录某个类被哪些装饰器 key 装饰了
- **存储位置**：存储在 `classMetadataStore` 中，使用固定的 `DECORATED_KEYS_KEY` 作为 key
- **访问方式**：通过 `getKeysByClass(target)` 获取装饰该类的所有 key

#### 3. class + key -> metadata 映射

```typescript
const classMetadataStore = new WeakMap<Class, Map<symbol, any>>();
```

- **用途**：存储真正的元数据
- **存储结构**：
  - key: 类构造函数
  - value: Map<symbol, any>
    - `DECORATED_KEYS_KEY` -> `Set<symbol>`（记录该类被哪些 key 装饰）
    - 其他 key -> 实际的元数据对象
- **访问方式**：通过 `getClassMetadata(target, key)` 获取元数据

### 双向映射维护机制

当装饰器应用到类上时，系统会自动维护双向映射：

```typescript
function registerKeyClassRelation(targetClass: Class, metadataKey: symbol): void {
  // 1. 在类上记录这个 key（class -> keys）
  const decoratedKeys = getOrCreateDecoratedKeysSet(targetClass);
  decoratedKeys.add(metadataKey);

  // 2. 在 keyToClassesMap 中记录这个类（key -> classes）
  if (!keyToClassesMap.has(metadataKey)) {
    keyToClassesMap.set(metadataKey, new Set());
  }
  keyToClassesMap.get(metadataKey)!.add(targetClass);
}
```

### 设计优势

1. **双向访问**：
   - 通过 key 可以找到所有被装饰的类（无需知道类名）
   - 通过类可以找到所有装饰它的 key（了解类的装饰情况）

2. **元数据存储分离**：
   - 映射关系存储在全局 Map 和类上的固定 key
   - 真正的元数据存储在类上，通过 key 访问

3. **内存安全**：
   - 使用 WeakMap 存储类相关的数据，避免内存泄漏
   - keyToClassesMap 使用普通 Map，但只存储类引用，不阻止垃圾回收

### 使用场景示例

#### 场景 1：通过 key 查找所有被装饰的类

```typescript
const Module = createClassDecorator();
const key = Symbol.for("nebula:classMetadata");

@Module({ name: "user-module" })
class UserService {}

@Module({ name: "order-module" })
class OrderService {}

// 无需知道类名，直接通过 key 查找所有模块
const allModules = getClassesByKey(key);
// Set { UserService, OrderService }

// 遍历所有模块并获取元数据
for (const ModuleClass of allModules) {
  const metadata = getClassMetadata(ModuleClass, key);
  console.log(metadata.name); // "user-module", "order-module"
}
```

#### 场景 2：查看类被哪些装饰器装饰

```typescript
const Module = createClassDecorator();
const Config = createClassDecorator(Symbol.for("config"));
const Cache = createClassDecorator(Symbol.for("cache"));

@Module({ name: "test" })
@Config({ env: "prod" })
@Cache({ ttl: 60 })
class TestService {}

// 查看类被哪些装饰器装饰
const keys = getKeysByClass(TestService);
// Set { Symbol(nebula:classMetadata), Symbol(config), Symbol(cache) }

// 遍历所有 key 并获取对应的元数据
for (const key of keys) {
  const metadata = getClassMetadata(TestService, key);
  console.log(key.toString(), metadata);
}
```

## API

### 创建装饰器

#### `createClassDecorator(metadataKey?)`

创建类装饰器工厂函数。

```typescript
import { createClassDecorator } from "./metadata/metadata";

const Module = createClassDecorator();

@Module({ name: "user-module", version: "1.0.0" })
class UserService {}
```

#### `createMethodDecorator(metadataKey?)`

创建方法装饰器工厂函数。

```typescript
import { createMethodDecorator } from "./metadata/metadata";

const Handler = createMethodDecorator();

class UserService {
  @Handler({ type: "route", options: { method: "GET" } })
  getUser() {}
}
```

### 双向访问 API（新功能）

#### `getClassesByKey(metadataKey)`

通过装饰器 key 获取所有被装饰的类。

```typescript
import { getClassesByKey } from "./metadata/metadata";

const key = Symbol.for("nebula:classMetadata");
const classes = getClassesByKey(key);
// Set { UserService, OrderService, ... }
```

#### `getKeysByClass(target)`

获取类被哪些装饰器 key 装饰了。

```typescript
import { getKeysByClass } from "./metadata/metadata";

const keys = getKeysByClass(UserService);
// Set { Symbol(nebula:classMetadata), Symbol(config), ... }
```

### 读取元数据

#### `getClassMetadata(target, metadataKey?)`

获取类的元数据。

```typescript
import { getClassMetadata } from "./metadata/metadata";

const metadata = getClassMetadata(UserService);
console.log(metadata.name); // 'user-module'
```

#### `getMethodMetadata(target, methodName, metadataKey?)`

获取方法的元数据列表。

```typescript
import { getMethodMetadata } from "./metadata/metadata";

const metadataList = getMethodMetadata(UserService, "getUser");
console.log(metadataList); // [{ type: 'route', options: {...} }]
```

#### `getAllMethodMetadata(target, metadataKey?)`

获取类的所有方法元数据。

```typescript
import { getAllMethodMetadata } from "./metadata/metadata";

const allMetadata = getAllMethodMetadata(UserService);
// Map<string, MethodMetadataItem[]>
```

### 检查元数据

#### `hasClassMetadata(target, metadataKey?)`

检查类是否有元数据。

#### `hasMethodMetadata(target, methodName, metadataKey?)`

检查方法是否有元数据。

## 使用示例

### 基础用法

```typescript
import { createClassDecorator, createMethodDecorator } from "./metadata/metadata";

// 创建装饰器
const Module = createClassDecorator();
const Handler = createMethodDecorator();

// 使用装饰器
@Module({ name: "user-service" })
class UserService {
  @Handler({ type: "route", options: { method: "GET" } })
  getUser() {
    return { id: 1 };
  }
}

// 读取元数据
import { getClassMetadata, getMethodMetadata } from "./metadata/metadata";

const classMeta = getClassMetadata(UserService);
const methodMeta = getMethodMetadata(UserService, "getUser");
```

### 双向访问示例

```typescript
import {
  createClassDecorator,
  getClassesByKey,
  getKeysByClass,
  getClassMetadata,
} from "./metadata/metadata";

const Module = createClassDecorator();
const key = Symbol.for("nebula:classMetadata");

@Module({ name: "user-module" })
class UserService {}

@Module({ name: "order-module" })
class OrderService {}

// 方式 1：通过 key 查找所有被装饰的类
const allModules = getClassesByKey(key);
console.log(allModules.size); // 2

// 遍历所有模块
for (const ModuleClass of allModules) {
  const metadata = getClassMetadata(ModuleClass, key);
  console.log(metadata.name);
}

// 方式 2：查看类被哪些装饰器装饰
const keys = getKeysByClass(UserService);
console.log(keys.has(key)); // true
```

### 自定义元数据键

```typescript
import { createMethodDecorator } from "./metadata/metadata";

const CUSTOM_KEY = Symbol.for("my-custom-key");
const Handler = createMethodDecorator(CUSTOM_KEY);

class Service {
  @Handler({ type: "custom" })
  method() {}
}
```

### 多装饰器应用

```typescript
const Handler = createMethodDecorator();

class Service {
  // 同一方法可以被多个装饰器标注
  @Handler({ type: "route", options: { method: "GET" } })
  @Handler({ type: "cache", options: { ttl: 60 } })
  @Handler({ type: "auth", options: { required: true } })
  getUser() {}
}

// 读取时会返回所有元数据
const metadata = getMethodMetadata(Service, "getUser");
// [{ type: 'route', ... }, { type: 'cache', ... }, { type: 'auth', ... }]
```

## 与 reflect-metadata 的区别

| 特性     | reflect-metadata         | metadata.ts            |
| -------- | ------------------------ | ---------------------- |
| 标准     | 实验性装饰器             | Stage 3 装饰器         |
| 依赖     | 需要包                   | 无依赖                 |
| API      | `Reflect.defineMetadata` | `createClassDecorator` |
| 性能     | 运行时反射               | 直接属性访问           |
| 类型安全 | 部分                     | 完全                   |
| 双向访问 | 不支持                   | ✅ 支持                |

## 设计原则

1. **简单够用**：只提供必要的功能，不包含业务逻辑
2. **类型安全**：完整的 TypeScript 类型支持
3. **无依赖**：不依赖任何外部库
4. **标准化**：使用最新的装饰器标准
5. **双向访问**：支持通过 key 查找类，通过类查找 key

## 在框架中的使用

框架使用此工具库来实现：

- `Handler` 装饰器：基于 `createMethodDecorator`
- `Module` 装饰器：基于 `createClassDecorator`
- 元数据读取：使用 `getMethodMetadata` 和 `getAllMethodMetadata`
- **类发现**：使用 `getClassesByKey` 查找所有被装饰的类（无需知道类名）

这样的设计使得装饰器功能与框架业务逻辑完全解耦，可以独立使用或替换。

## 数据流图

```
装饰器应用流程：
┌─────────────────────────────────────────────────────────────┐
│  @Module({ name: "user-module" })                           │
│  class UserService {}                                        │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  registerKeyClassRelation(UserService, key)                  │
└─────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────────┐   ┌───────────────────┐
│ keyToClassesMap   │   │ classMetadataStore│
│ key -> Set<Class> │   │ class -> Map<...> │
│                   │   │   DECORATED_KEYS  │
│ key: {            │   │   KEY -> Set<key> │
│   UserService     │   │   key -> metadata │
│ }                 │   │ }                 │
└───────────────────┘   └───────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌───────────────────┐   ┌───────────────────┐
│ getClassesByKey() │   │ getKeysByClass()  │
│ 通过 key 找类      │   │ 通过类找 key       │
└───────────────────┘   └───────────────────┘
```

## 实现细节

### 1. 装饰器应用时的处理

当装饰器应用到类上时，`createClassDecorator` 会：

1. 调用 `registerKeyClassRelation` 注册双向映射
2. 将元数据存储到 `classMetadataStore` 中

### 2. 方法装饰器的处理

方法装饰器也会在类上注册 key，这样可以通过 `getKeysByClass` 找到所有装饰该类的 key（包括类装饰器和方法装饰器的 key）。

### 3. 内存管理

- `classMetadataStore` 和 `methodMetadataStore` 使用 WeakMap，不会阻止垃圾回收
- `keyToClassesMap` 使用普通 Map，但只存储类引用，类被回收后引用会失效（虽然 Set 中仍保留引用，但不影响功能）
- 如果需要完全清理，可以考虑添加清理函数（当前版本暂未实现）

## 注意事项

1. **keyToClassesMap 的内存**：使用普通 Map 而非 WeakMap，因为需要能够遍历所有被装饰的类。如果类被回收，Map 中的引用会变成"僵尸引用"，但不影响功能。

2. **装饰器执行时机**：装饰器在类定义时执行，但 `addInitializer` 中的代码在类实例化时执行。因此双向映射的注册发生在类实例化时。

3. **方法装饰器**：方法装饰器也会在类上注册 key，这意味着 `getKeysByClass` 会返回包括方法装饰器 key 在内的所有 key。