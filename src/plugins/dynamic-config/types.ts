import type { z } from "zod";

/**
 * 配置项元数据
 *
 * 定义配置的基本信息，包括键、描述、Schema、默认值等
 */
export interface ConfigMetadata {
  /**
   * 配置键（用于 etcd 存储）
   */
  key: string;

  /**
   * 配置描述
   */
  description?: string;

  /**
   * 配置的 Zod Schema（用于运行时验证）
   */
  schema?: z.ZodTypeAny;

  /**
   * 默认值
   */
  defaultValue?: any;

  /**
   * 是否为敏感信息（日志中脱敏）
   */
  sensitive?: boolean;
}

/**
 * 动态配置装饰器选项
 *
 * 扩展 ConfigMetadata，添加 onChange 回调支持
 *
 * 配置优先级：ETCD > 环境变量 > defaultValue
 * 环境变量名由 key 自动转换（kebab-case -> UPPER_SNAKE_CASE）
 *
 * 💡 **推荐**：直接使用 UPPER_SNAKE_CASE 格式作为 key，与环境变量名保持一致
 *
 * @example
 * ```typescript
 * // 推荐：使用 UPPER_SNAKE_CASE 格式 + 属性装饰器
 * @Config({
 *   key: "MAX_CONNECTIONS",  // 直接对应环境变量 MAX_CONNECTIONS
 *   defaultValue: 100,
 * })
 * maxConnections!: number;  // TypeScript 完美推断类型
 *
 * // 也支持：使用 kebab-case 格式（自动转换）
 * @Config({
 *   key: "max-connections",  // 自动转换为环境变量 MAX_CONNECTIONS
 *   defaultValue: 100,
 * })
 * maxConnections!: number;
 * ```
 */
export interface DynamicConfigOptions extends ConfigMetadata {
  /**
   * 配置变更回调（可选）
   *
   * 当配置值发生变化时，会触发此回调函数
   *
   * @param newValue 新的配置值
   * @param oldValue 旧的配置值
   */
  onChange?: (newValue: any, oldValue: any) => void | Promise<void>;
}

/**
 * 插件配置选项
 *
 * 定义 DynamicConfigPlugin 的初始化选项
 */
export interface DynamicConfigPluginOptions {
  /**
   * Etcd3 客户端实例
   * 如果未提供且 useMockEtcd 为 false，插件将使用默认配置
   */
  etcdClient?: Etcd3;

  /**
   * 是否使用 Mock Etcd（用于测试和本地开发）
   * @default false
   */
  useMockEtcd?: boolean;

  /**
   * etcd 配置键前缀
   * @default "/config"
   */
  etcdPrefix?: string;

  /**
   * 是否启用配置缓存（缓存到 MySQL）
   * @default false
   */
  enablePersistence?: boolean;

  /**
   * MySQL 数据库配置（当 enablePersistence 为 true 时需要）
   */
  mysql?: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };

  /**
   * 配置同步间隔（毫秒）
   * 从 MySQL 同步配置到 etcd 的间隔
   * @default 30000 (30秒)
   */
  syncInterval?: number;
}

/**
 * 配置存储接口
 *
 * 定义配置存储的标准操作，支持 etcd 和内存两种实现
 */
export interface ConfigStorage {
  /**
   * 获取配置
   */
  get(key: string): Promise<any>;

  /**
   * 设置配置
   */
  set(key: string, value: any, metadata?: ConfigMetadata): Promise<void>;

  /**
   * 删除配置
   */
  delete(key: string): Promise<void>;

  /**
   * 获取所有配置
   */
  getAll(prefix?: string): Promise<Map<string, any>>;

  /**
   * 监听配置变化
   */
  watch(
    key: string,
    callback: (newValue: any, oldValue: any) => void
  ): () => void;

  /**
   * 同步获取缓存的配置（不访问 etcd）
   * 用于 configProxy 的同步访问
   */
  getCached?(key: string): any;
}

/**
 * 配置项（用于前端管理界面）
 *
 * 包含配置的详细信息，用于前端展示和编辑
 */
export interface ConfigItem {
  /**
   * 配置键
   */
  key: string;

  /**
   * 配置值
   */
  value: any;

  /**
   * 配置描述
   */
  description?: string;

  /**
   * 配置类型
   */
  type: string;

  /**
   * 是否为敏感信息
   */
  sensitive: boolean;

  /**
   * 创建时间
   */
  createdAt: Date;

  /**
   * 更新时间
   */
  updatedAt: Date;

  /**
   * 创建人
   */
  createdBy?: string;

  /**
   * 更新人
   */
  updatedBy?: string;
}

/**
 * 配置变更历史
 *
 * 记录配置的每次变更，用于审计和回滚
 */
export interface ConfigHistory {
  /**
   * 历史 ID
   */
  id: string;

  /**
   * 配置键
   */
  key: string;

  /**
   * 旧值
   */
  oldValue: any;

  /**
   * 新值
   */
  newValue: any;

  /**
   * 变更时间
   */
  changedAt: Date;

  /**
   * 变更人
   */
  changedBy: string;

  /**
   * 变更原因
   */
  reason?: string;
}

/**
 * Module 配置选项
 *
 * 用于 @Module 装饰器的 options 参数
 */
export interface DynamicConfigModuleOptions {
  /**
   * 配置命名空间（用于区分不同模块的配置）
   *
   * 默认使用模块名
   */
  configNamespace?: string;
}

/**
 * Etcd3 类型定义
 *
 * 避免直接依赖 etcd3 包，提供最小化的类型定义
 */
export interface Etcd3 {
  get(key: string): {
    string(): Promise<string | null>;
  };
  put(key: string): {
    value(value: string): Promise<void>;
  };
  delete(): {
    key(key: string): Promise<void>;
  };
  getAll(): {
    prefix(prefix: string): {
      strings(): Promise<Record<string, string>>;
    };
  };
  watch(): Watch;
}

export interface Watch {
  key(key: string): WatchBuilder;
}

export interface WatchBuilder {
  create(): Promise<Watcher>;
}

export interface Watcher {
  on(event: "put", callback: (kv: { key: Buffer; value: Buffer }) => void): void;
  on(event: "delete", callback: (kv: { key: Buffer }) => void): void;
  cancel(): void;
}
