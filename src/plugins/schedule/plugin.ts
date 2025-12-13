import logger from "../../core/logger";
import {
  HandlerMetadata,
  Microservice,
  Plugin,
  PluginPriority,
} from "../../core/types";
import { MockEtcd3 } from "./mock-etcd";
import { Scheduler } from "./scheduler";
import { SchedulePluginOptions, Etcd3 } from "./types";
import { extractScheduleMetadata } from "./utils";

/**
 * SchedulePlugin - 调度任务插件
 * 使用 etcd 选举机制实现分布式定时任务，确保多个实例中只有一个执行任务
 */
export class SchedulePlugin implements Plugin {
  public readonly name = "schedule-plugin";
  public readonly priority = PluginPriority.BUSINESS; // 业务逻辑优先级

  private engine!: Microservice;
  private scheduler: Scheduler | null = null;
  private etcdClient: Etcd3 | null = null;
  private scheduleHandlers: HandlerMetadata[] = [];
  private useMockEtcd: boolean = false;

  constructor(options?: SchedulePluginOptions) {
    if (options?.useMockEtcd) {
      // 使用 Mock Etcd（用于测试和本地开发）
      this.useMockEtcd = true;
      this.etcdClient = new MockEtcd3();
      logger.info("SchedulePlugin: Using MockEtcd3 for local development/testing");
    } else if (options?.etcdClient) {
      // 使用真实的 etcd 客户端
      this.etcdClient = options.etcdClient as Etcd3;
    }
  }

  /**
   * 引擎初始化钩子
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("SchedulePlugin initialized");
  }

  /**
   * Handler加载钩子：收集所有调度任务
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 筛选出所有 type="schedule" 的 handlers
    this.scheduleHandlers = handlers.filter(
      (handler) => handler.type === "schedule"
    );
    logger.info(
      `SchedulePlugin: Found ${this.scheduleHandlers.length} schedule handler(s)`
    );
  }

  /**
   * 引擎启动后钩子：启动所有调度任务
   */
  async onAfterStart(engine: Microservice): Promise<void> {
    // 如果没有配置 etcd 客户端且未启用 mock，跳过调度任务
    if (!this.etcdClient) {
      logger.warn(
        "SchedulePlugin: etcdClient not configured and useMockEtcd is false, schedule tasks will not start"
      );
      return;
    }

    // 创建调度器实例
    this.scheduler = new Scheduler(this.etcdClient);

    // 获取所有模块
    const modules = engine.getModules();

    // 获取所有 Handler 元数据（需要在引擎加载完成后获取）
    // 由于 onAfterStart 在引擎启动后调用，此时 handlers 已经加载完成
    // 我们需要从引擎中获取 handlers，但由于引擎没有暴露这个接口，
    // 我们需要在 onHandlerLoad 中保存 handlers
    if (!this.scheduleHandlers) {
      logger.warn(
        "SchedulePlugin: No schedule handlers found, schedule tasks will not start"
      );
      return;
    }

    // 提取调度元数据
    const scheduleMetadataMap = extractScheduleMetadata(this.scheduleHandlers);

    // 生成服务 ID（使用服务名称和实例标识）
    const serviceId = `${engine.options.name}-${Date.now()}-${Math.random()}`;

    // 遍历所有模块，查找调度任务
    for (const moduleMetadata of modules) {
      const moduleClass = moduleMetadata.clazz;
      const moduleName = moduleMetadata.name;

      // 获取模块实例
      const moduleInstance = engine.get(moduleClass);

      // 获取该模块的调度元数据
      const moduleScheduleMetadata = scheduleMetadataMap.get(moduleClass);
      if (!moduleScheduleMetadata || moduleScheduleMetadata.size === 0) {
        continue;
      }

      // 遍历所有调度任务
      for (const [methodName, metadata] of moduleScheduleMetadata.entries()) {
        // 获取方法
        const method = (moduleInstance as any)[methodName];
        if (typeof method !== "function") {
          logger.warn(
            `SchedulePlugin: Method ${moduleName}.${methodName} is not a function, skipping`
          );
          continue;
        }

        // 生成选举键（使用服务名称、模块名和方法名）
        const electionKey = `/schedule/${engine.options.name}/${moduleName}/${methodName}`;

        // 生成唯一的服务 ID（每个任务使用不同的 ID）
        const taskServiceId = `${serviceId}-${moduleName}-${methodName}`;

        // 启动调度任务
        try {
          await this.scheduler.startSchedule(
            taskServiceId,
            moduleName,
            methodName,
            electionKey,
            metadata,
            method.bind(moduleInstance)
          );

          logger.info(
            `SchedulePlugin: Started schedule task ${moduleName}.${methodName} (interval: ${metadata.interval}ms, mode: ${metadata.mode})`
          );
        } catch (error) {
          logger.error(
            `SchedulePlugin: Failed to start schedule task ${moduleName}.${methodName}:`,
            error
          );
        }
      }
    }
  }

  /**
   * 引擎销毁钩子：停止所有调度任务
   */
  async onDestroy(): Promise<void> {
    if (this.scheduler) {
      try {
        await this.scheduler.stop();
        logger.info("SchedulePlugin: All schedule tasks stopped");
      } catch (error) {
        logger.error("SchedulePlugin: Error stopping schedule tasks:", error);
      }
    }
  }
}

