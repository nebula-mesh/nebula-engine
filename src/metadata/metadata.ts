/**
 * 通用元数据管理工具库
 *
 * 提供类和方法装饰器的元数据收集能力，与业务逻辑解耦
 * 类似于 reflect-metadata，但更简单、更轻量
 *
 * 新设计：支持双向访问
 * - key -> classes: 通过装饰器 key 查找所有被装饰的类
 * - class -> keys: 通过类查找所有装饰它的 key
 * - class + key -> metadata: 通过类和 key 获取元数据
 */

// TypeScript 类型辅助
type Class = new (...args: any[]) => any;

/**
 * 固定的元数据键，用于在类上记录该类被哪些装饰器装饰了
 * 这个 key 存储的是 Set<symbol>，包含所有装饰该类的 key
 */
const DECORATED_KEYS_KEY = Symbol.for("imean:decoratedKeys");

/**
 * key -> classes 映射
 * 记录某个装饰器 key 装饰了哪些类
 * 使用 Map 而不是 WeakMap，因为我们需要能够遍历所有被装饰的类
 */
const keyToClassesMap = new Map<symbol, Set<Class>>();

/**
 * class -> keys 映射
 * 记录某个类被哪些装饰器 key 装饰了
 * 使用 WeakMap 存储，key 是类构造函数，value 是 Set<symbol>
 * 这个映射实际上存储在 classMetadataStore 中，使用 DECORATED_KEYS_KEY 作为 key
 */
// 注意：这个映射通过 classMetadataStore 和 DECORATED_KEYS_KEY 实现，不需要单独的 WeakMap

/**
 * 类级别的元数据存储（用于存储每个类独有的元数据）
 * 使用 WeakMap 存储，key 是类构造函数，value 是 Map<symbol, metadata>
 * 
 * 存储结构：
 * - key: 类构造函数
 * - value: Map<symbol, any>
 *   - DECORATED_KEYS_KEY -> Set<symbol> (记录该类被哪些 key 装饰)
 *   - 其他 key -> 实际的元数据
 */
export const classMetadataStore = new WeakMap<
  Class,
  Map<symbol, any>
>();

/**
 * 方法元数据存储（按类和方法名组织）
 * 使用 WeakMap 存储，key 是类构造函数，value 是 Map<symbol, MethodMetadata>
 */
const methodMetadataStore = new WeakMap<
  Class,
  Map<symbol, MethodMetadata>
>();

/**
 * 属性元数据存储（按类和属性名组织）
 * 使用 WeakMap 存储，key 是类构造函数，value 是 Map<symbol, FieldMetadata>
 */
const fieldMetadataStore = new WeakMap<
  Class,
  Map<symbol, FieldMetadata>
>();

/**
 * 方法元数据项
 */
export interface MethodMetadataItem {
  type: string;
  options?: any;
  [key: string]: any;
}

/**
 * 方法元数据存储结构（按方法名组织）
 */
export interface MethodMetadata {
  [methodName: string]: MethodMetadataItem[];
}

/**
 * 属性元数据项
 */
export interface FieldMetadataItem {
  type: string;
  options?: any;
  [key: string]: any;
}

/**
 * 属性元数据存储结构（按属性名组织）
 */
export interface FieldMetadata {
  [fieldName: string]: FieldMetadataItem[];
}

/**
 * 获取或创建类的元数据 Map
 * 
 * @param targetClass 类构造函数
 * @returns 类的元数据 Map
 */
function getOrCreateClassMetadataMap(targetClass: Class): Map<symbol, any> {
  let metadataMap = classMetadataStore.get(targetClass);
  if (!metadataMap) {
    metadataMap = new Map();
    classMetadataStore.set(targetClass, metadataMap);
  }
  return metadataMap;
}

/**
 * 获取或创建类被装饰的 keys Set
 * 
 * @param targetClass 类构造函数
 * @returns 装饰该类的 keys Set
 */
function getOrCreateDecoratedKeysSet(targetClass: Class): Set<symbol> {
  const metadataMap = getOrCreateClassMetadataMap(targetClass);
  let decoratedKeys = metadataMap.get(DECORATED_KEYS_KEY);
  if (!decoratedKeys) {
    decoratedKeys = new Set<symbol>();
    metadataMap.set(DECORATED_KEYS_KEY, decoratedKeys);
  }
  return decoratedKeys as Set<symbol>;
}

/**
 * 注册装饰器 key 和类的关联关系（双向映射）
 * 
 * @param targetClass 类构造函数
 * @param metadataKey 装饰器 key
 */
function registerKeyClassRelation(targetClass: Class, metadataKey: symbol): void {
  // 1. 在类上记录这个 key
  const decoratedKeys = getOrCreateDecoratedKeysSet(targetClass);
  decoratedKeys.add(metadataKey);

  // 2. 在 keyToClassesMap 中记录这个类
  if (!keyToClassesMap.has(metadataKey)) {
    keyToClassesMap.set(metadataKey, new Set());
  }
  keyToClassesMap.get(metadataKey)!.add(targetClass);
}

/**
 * 创建类装饰器工厂
 *
 * @param metadataKey 元数据的键（可选，默认使用内置键）
 * @returns 类装饰器工厂函数
 *
 * @example
 * ```typescript
 * const Module = createClassDecorator();
 *
 * @Module({ name: "user-module", version: "1.0.0" })
 * class UserService {}
 * ```
 */
export function createClassDecorator(metadataKey: symbol = Symbol.for("imean:classMetadata")) {
  return function <T extends Class>(
    metadata?: Record<string, any>
  ): (target: T, context: ClassDecoratorContext) => void {
    return function (target: T, context: ClassDecoratorContext) {
      context.addInitializer(function (this: any) {
        // 注册双向映射关系
        registerKeyClassRelation(target, metadataKey);

        // 获取或创建该类的元数据 Map
        const metadataMap = getOrCreateClassMetadataMap(target);

        // 获取现有的元数据
        const existingMetadata = metadataMap.get(metadataKey) || {};

        // 合并元数据
        const mergedMetadata = {
          ...existingMetadata,
          ...metadata,
        };

        // 存储到类级别的 store
        metadataMap.set(metadataKey, mergedMetadata);
      });
    };
  };
}

/**
 * 创建方法装饰器工厂
 *
 * @param metadataKey 元数据的键（可选，默认使用内置键）
 * @returns 方法装饰器工厂函数
 *
 * @example
 * ```typescript
 * const Handler = createMethodDecorator();
 *
 * class UserService {
 *   @Handler({ type: 'route', options: { method: 'GET' } })
 *   getUser() {}
 * }
 * ```
 */
export function createMethodDecorator(
  metadataKey: symbol = Symbol.for("imean:methodMetadata")
) {
  return function <T = Record<string, any>>(
    metadata: T & { type: string }
  ): (target: Function, context: ClassMethodDecoratorContext) => void {
    return function (target: Function, context: ClassMethodDecoratorContext) {
      const methodName = context.name.toString();

      // 定义收集元数据的函数
      const collectMetadata = (targetClass: Class) => {
        if (!targetClass) return;

        // 注册双向映射关系（方法装饰器也会在类上注册）
        registerKeyClassRelation(targetClass, metadataKey);

        // 获取或创建该类的元数据 Map
        let metadataMap = methodMetadataStore.get(targetClass);
        if (!metadataMap) {
          metadataMap = new Map();
          methodMetadataStore.set(targetClass, metadataMap);
        }

        // 获取现有的元数据存储（按方法名组织）
        const existingMetadataMap: MethodMetadata =
          metadataMap.get(metadataKey) || {};

        // 获取该方法的现有元数据列表
        const existingMetadata: MethodMetadataItem[] =
          existingMetadataMap[methodName] || [];

        // 创建新的元数据项
        const newMetadata: MethodMetadataItem = {
          ...metadata,
          type: metadata.type,
        };

        // 追加到现有元数据列表（支持多应用）
        existingMetadataMap[methodName] = [...existingMetadata, newMetadata];

        // 存储到全局 store
        metadataMap.set(metadataKey, existingMetadataMap);
      };

      // 尝试获取类构造函数
      let targetClass: Class | null = null;
      try {
        if (target.constructor && typeof target.constructor === "function") {
          targetClass = target.constructor as Class;
        }
      } catch (e) {
        // 如果无法访问，将在 addInitializer 中处理
      }

      // 如果类可用，立即收集
      if (targetClass) {
        collectMetadata(targetClass);
      }

      // 同时在 addInitializer 中收集（用于实例化时的情况）
      context.addInitializer(function (this: any) {
        const instanceClass = this.constructor as Class;
        if (instanceClass && instanceClass !== targetClass) {
          collectMetadata(instanceClass);
        }
      });
    };
  };
}

/**
 * 创建属性装饰器工厂
 *
 * @param metadataKey 元数据的键（可选，默认使用内置键）
 * @returns 属性装饰器工厂函数
 *
 * @example
 * ```typescript
 * const ConfigField = createFieldDecorator();
 *
 * class UserService {
 *   @ConfigField({ type: 'dynamic-config', key: 'MAX_CONNECTIONS' })
 *   maxConnections!: number;
 * }
 * ```
 */
export function createFieldDecorator(
  metadataKey: symbol = Symbol.for("imean:fieldMetadata")
) {
  return function <T = Record<string, any>>(
    metadata: T & { type: string }
  ): (target: undefined, context: ClassFieldDecoratorContext) => void {
    return function (target: undefined, context: ClassFieldDecoratorContext) {
      const fieldName = context.name.toString();

      // 定义收集元数据的函数
      const collectMetadata = (targetClass: Class) => {
        if (!targetClass) return;

        // 注册双向映射关系（属性装饰器也会在类上注册）
        registerKeyClassRelation(targetClass, metadataKey);

        // 获取或创建该类的元数据 Map
        let metadataMap = fieldMetadataStore.get(targetClass);
        if (!metadataMap) {
          metadataMap = new Map();
          fieldMetadataStore.set(targetClass, metadataMap);
        }

        // 获取现有的元数据存储（按属性名组织）
        const existingMetadataMap: FieldMetadata =
          metadataMap.get(metadataKey) || {};

        // 获取该属性的现有元数据列表
        const existingMetadata: FieldMetadataItem[] =
          existingMetadataMap[fieldName] || [];

        // 创建新的元数据项
        const newMetadata: FieldMetadataItem = {
          ...metadata,
          type: metadata.type,
        };

        // 追加到现有元数据列表（支持多应用）
        existingMetadataMap[fieldName] = [...existingMetadata, newMetadata];

        // 存储到全局 store
        metadataMap.set(metadataKey, existingMetadataMap);
      };

      // 在 addInitializer 中收集元数据
      context.addInitializer(function (this: any) {
        const instanceClass = this.constructor as Class;
        if (instanceClass) {
          collectMetadata(instanceClass);
        }
      });
    };
  };
}

/**
 * 通过装饰器 key 获取所有被装饰的类
 *
 * @param metadataKey 装饰器 key
 * @returns 被该 key 装饰的所有类的 Set
 *
 * @example
 * ```typescript
 * const Module = createClassDecorator();
 * const key = Symbol.for("imean:classMetadata");
 *
 * @Module({ name: "module1" })
 * class Module1 {}
 *
 * @Module({ name: "module2" })
 * class Module2 {}
 *
 * const classes = getClassesByKey(key);
 * // Set { Module1, Module2 }
 * ```
 */
export function getClassesByKey(metadataKey: symbol): Set<Class> {
  return keyToClassesMap.get(metadataKey) || new Set();
}

/**
 * 获取类被哪些装饰器 key 装饰了
 *
 * @param target 类或类实例
 * @returns 装饰该类的所有 key 的 Set
 *
 * @example
 * ```typescript
 * const Module = createClassDecorator();
 * const Config = createClassDecorator(Symbol.for("config"));
 *
 * @Module({ name: "test" })
 * @Config({ env: "prod" })
 * class TestService {}
 *
 * const keys = getKeysByClass(TestService);
 * // Set { Symbol(imean:classMetadata), Symbol(config) }
 * ```
 */
export function getKeysByClass(target: any): Set<symbol> {
  // 获取类构造函数
  let targetClass: Class | null = null;

  if (target && typeof target === "function" && target.prototype) {
    // target 是类构造函数
    targetClass = target as Class;
  } else if (
    target &&
    target.constructor &&
    typeof target.constructor === "function"
  ) {
    // target 是实例，通过 constructor 获取类
    targetClass = target.constructor as Class;
  }

  if (!targetClass) {
    return new Set();
  }

  // 从类级别的 store 获取装饰的 keys
  const metadataMap = classMetadataStore.get(targetClass);
  if (!metadataMap) {
    return new Set();
  }

  return (metadataMap.get(DECORATED_KEYS_KEY) as Set<symbol>) || new Set();
}

/**
 * 获取类的元数据
 *
 * @param target 类或类实例
 * @param metadataKey 元数据键（可选）
 * @returns 类的元数据对象
 */
export function getClassMetadata(
  target: any,
  metadataKey: symbol = Symbol.for("imean:classMetadata")
): any {
  // 获取类构造函数
  let targetClass: Class | null = null;

  if (target && typeof target === "function" && target.prototype) {
    // target 是类构造函数
    targetClass = target as Class;
  } else if (
    target &&
    target.constructor &&
    typeof target.constructor === "function"
  ) {
    // target 是实例，通过 constructor 获取类
    targetClass = target.constructor as Class;
  }

  if (!targetClass) {
    return {};
  }

  // 从类级别的 store 获取元数据
  const metadataMap = classMetadataStore.get(targetClass);
  if (!metadataMap) {
    return {};
  }

  return metadataMap.get(metadataKey) || {};
}

/**
 * 获取方法的元数据列表
 *
 * @param target 类或类实例
 * @param methodName 方法名
 * @param metadataKey 元数据键（可选）
 * @returns 方法的元数据列表
 */
export function getMethodMetadata(
  target: any,
  methodName: string | symbol,
  metadataKey: symbol = Symbol.for("imean:methodMetadata")
): MethodMetadataItem[] {
  // 获取类构造函数
  let targetClass: Class | null = null;

  if (target && typeof target === "function" && target.prototype) {
    // target 是类构造函数
    targetClass = target as Class;
  } else if (
    target &&
    target.constructor &&
    typeof target.constructor === "function"
  ) {
    // target 是实例，通过 constructor 获取类
    targetClass = target.constructor as Class;
  }

  if (!targetClass) {
    return [];
  }

  // 从全局 store 获取元数据
  const metadataMap = methodMetadataStore.get(targetClass);
  if (!metadataMap) {
    return [];
  }

  const methodMetadata: MethodMetadata = metadataMap.get(metadataKey) || {};
  return methodMetadata[String(methodName)] || [];
}

/**
 * 获取类的所有方法元数据
 *
 * @param target 类或类实例
 * @param metadataKey 元数据键（可选）
 * @returns 所有方法的元数据映射（方法名 -> 元数据列表）
 */
export function getAllMethodMetadata(
  target: any,
  metadataKey: symbol = Symbol.for("imean:methodMetadata")
): Map<string | symbol, MethodMetadataItem[]> {
  const result = new Map<string | symbol, MethodMetadataItem[]>();

  // 获取类构造函数
  let targetClass: Class | null = null;

  if (target && typeof target === "function" && target.prototype) {
    // target 是类构造函数
    targetClass = target as Class;
  } else if (
    target &&
    target.constructor &&
    typeof target.constructor === "function"
  ) {
    // target 是实例，通过 constructor 获取类
    targetClass = target.constructor as Class;
  }

  if (!targetClass) {
    return result;
  }

  // 从全局 store 获取元数据
  const metadataMap = methodMetadataStore.get(targetClass);
  if (!metadataMap) {
    return result;
  }

  const allMetadata: MethodMetadata = metadataMap.get(metadataKey) || {};

  // 遍历所有方法的元数据
  for (const [methodName, metadataList] of Object.entries(allMetadata)) {
    if (metadataList.length > 0) {
      result.set(methodName, metadataList);
    }
  }

  return result;
}

/**
 * 检查类是否有指定的元数据键
 *
 * @param target 类或类实例
 * @param metadataKey 元数据键（可选）
 * @returns 是否存在元数据
 */
export function hasClassMetadata(
  target: any,
  metadataKey: symbol = Symbol.for("imean:classMetadata")
): boolean {
  // 获取类构造函数
  let targetClass: Class | null = null;

  if (target && typeof target === "function" && target.prototype) {
    // target 是类构造函数
    targetClass = target as Class;
  } else if (
    target &&
    target.constructor &&
    typeof target.constructor === "function"
  ) {
    // target 是实例，通过 constructor 获取类
    targetClass = target.constructor as Class;
  }

  if (!targetClass) {
    return false;
  }

  // 从全局 store 检查
  const metadataMap = classMetadataStore.get(targetClass);
  if (!metadataMap) {
    return false;
  }

  return metadataMap.has(metadataKey) && metadataMap.get(metadataKey) != null;
}

/**
 * 检查方法是否有元数据
 *
 * @param target 类或类实例
 * @param methodName 方法名
 * @param metadataKey 元数据键（可选）
 * @returns 是否存在元数据
 */
export function hasMethodMetadata(
  target: any,
  methodName: string | symbol,
  metadataKey: symbol = Symbol.for("imean:methodMetadata")
): boolean {
  const metadata = getMethodMetadata(target, methodName, metadataKey);
  return metadata.length > 0;
}

/**
 * 获取属性的元数据列表
 *
 * @param target 类或类实例
 * @param fieldName 属性名
 * @param metadataKey 元数据键（可选）
 * @returns 属性的元数据列表
 */
export function getFieldMetadata(
  target: any,
  fieldName: string | symbol,
  metadataKey: symbol = Symbol.for("imean:fieldMetadata")
): FieldMetadataItem[] {
  // 获取类构造函数
  let targetClass: Class | null = null;

  if (target && typeof target === "function" && target.prototype) {
    // target 是类构造函数
    targetClass = target as Class;
  } else if (
    target &&
    target.constructor &&
    typeof target.constructor === "function"
  ) {
    // target 是实例，通过 constructor 获取类
    targetClass = target.constructor as Class;
  }

  if (!targetClass) {
    return [];
  }

  // 从全局 store 获取元数据
  const metadataMap = fieldMetadataStore.get(targetClass);
  if (!metadataMap) {
    return [];
  }

  const fieldMetadata: FieldMetadata = metadataMap.get(metadataKey) || {};
  return fieldMetadata[String(fieldName)] || [];
}

/**
 * 获取类的所有属性元数据
 *
 * @param target 类或类实例
 * @param metadataKey 元数据键（可选）
 * @returns 所有属性的元数据映射（属性名 -> 元数据列表）
 */
export function getAllFieldMetadata(
  target: any,
  metadataKey: symbol = Symbol.for("imean:fieldMetadata")
): Map<string | symbol, FieldMetadataItem[]> {
  const result = new Map<string | symbol, FieldMetadataItem[]>();

  // 获取类构造函数
  let targetClass: Class | null = null;

  if (target && typeof target === "function" && target.prototype) {
    // target 是类构造函数
    targetClass = target as Class;
  } else if (
    target &&
    target.constructor &&
    typeof target.constructor === "function"
  ) {
    // target 是实例，通过 constructor 获取类
    targetClass = target.constructor as Class;
  }

  if (!targetClass) {
    return result;
  }

  // 从全局 store 获取元数据
  const metadataMap = fieldMetadataStore.get(targetClass);
  if (!metadataMap) {
    return result;
  }

  const allMetadata: FieldMetadata = metadataMap.get(metadataKey) || {};

  // 遍历所有属性的元数据
  for (const [fieldName, metadataList] of Object.entries(allMetadata)) {
    if (metadataList.length > 0) {
      result.set(fieldName, metadataList);
    }
  }

  return result;
}

/**
 * 检查属性是否有元数据
 *
 * @param target 类或类实例
 * @param fieldName 属性名
 * @param metadataKey 元数据键（可选）
 * @returns 是否存在元数据
 */
export function hasFieldMetadata(
  target: any,
  fieldName: string | symbol,
  metadataKey: symbol = Symbol.for("imean:fieldMetadata")
): boolean {
  const metadata = getFieldMetadata(target, fieldName, metadataKey);
  return metadata.length > 0;
}
