import { createClassDecorator } from "../metadata/metadata";
import { Microservice } from "./engine";
import { MicroserviceOptions, ModuleDecorator, Plugin } from "./types";

/**
 * 从插件数组中提取聚合的配置类型
 */
type ExtractPluginOptions<T extends readonly Plugin<any>[]> =
  T extends readonly [infer P1, ...infer Rest]
    ? P1 extends Plugin<infer T1>
      ? Rest extends readonly Plugin<any>[]
        ? T1 & ExtractPluginOptions<Rest>
        : T1
      : ExtractPluginOptions<Rest extends readonly Plugin<any>[] ? Rest : []>
    : Record<string, any>;

/**
 * 从 Factory.create 返回值中提取 Microservice 实例类型
 */
export type FactoryMicroservice<T extends ReturnType<typeof Factory.create>> =
  T["Microservice"] extends new (options: any) => infer Instance
    ? Instance
    : never;

/**
 * 从 Factory.create 返回值中提取 Module 装饰器类型
 */
export type FactoryModule<T extends ReturnType<typeof Factory.create>> =
  T["Module"];

/**
 * Factory - 创建类型化的引擎实例
 * 
 * 注意：所有插件都必须显式注册，不会自动包含任何默认插件
 */
export class Factory {
  /**
   * 创建类型化的引擎工厂
   *
   * @param plugins 插件列表（必须显式提供所有需要的插件）
   * @returns 包含类型化的 Module 装饰器和 Microservice 类的对象
   */
  static create<TPlugins extends readonly Plugin<any>[]>(
    ...plugins: TPlugins
  ): {
    Module: ModuleDecorator<ExtractPluginOptions<TPlugins>>;
    Microservice: new (options: MicroserviceOptions) => Microservice<
      ExtractPluginOptions<TPlugins>
    >;
  } {
    type TAggregatedOptions = ExtractPluginOptions<TPlugins>;

    // 为每个工厂创建过程生成唯一的 key
    // 使用 Symbol 和时间戳确保唯一性
    const moduleMetadataKey = Symbol.for(
      `imean:moduleMetadata:${Date.now()}:${Math.random()}`
    );

    // 创建一个类型化的 Microservice 类
    class TypedMicroservice extends Microservice<TAggregatedOptions> {
      constructor(options: MicroserviceOptions) {
        // 传递唯一的 key 给父类，用于模块发现
        super(options, moduleMetadataKey);
        // 注册所有插件（在父类构造函数之后，直接访问 protected 成员）
        for (const plugin of plugins) {
          this.registerPlugin(plugin);
        }
      }
    }

    // 创建类型化的 Module 装饰器
    // 使用唯一的 key，这样不同工厂创建的装饰器会使用不同的 key
    const baseDecorator = createClassDecorator(moduleMetadataKey);

    const Module: ModuleDecorator<TAggregatedOptions> = (
      name: string,
      options?: TAggregatedOptions
    ) => {
      // 创建类级别的元数据（每个类独有的）
      const classMetadata = {
        name: name || undefined,
        options: (options || {}) as TAggregatedOptions,
      };
      return baseDecorator(classMetadata) as any;
    };

    return {
      Module,
      Microservice: TypedMicroservice,
    };
  }
}
