import { Microservice } from "../../core/engine";
import {
  HandlerMetadata,
  Plugin,
  PluginPriority,
} from "../../core/types";
import logger from "../../core/logger";
import { GracefulShutdownPluginOptions } from "./types";

/**
 * 优雅停机插件
 * 
 * 功能：
 * 1. 追踪所有处理器的执行状态（包括 Action、Route、Schedule 等）
 * 2. 监听系统停机信号（SIGINT、SIGTERM 等）
 * 3. 收到信号后，等待所有正在执行的处理器完成
 * 4. 如果超时或所有处理完成，执行优雅停机
 * 
 * @example
 * ```typescript
 * // 使用默认配置（10分钟超时）
 * const gracefulShutdownPlugin = new GracefulShutdownPlugin();
 * 
 * // 自定义超时时间（5分钟）
 * const gracefulShutdownPlugin = new GracefulShutdownPlugin({
 *   shutdownTimeout: 5 * 60 * 1000, // 5分钟
 * });
 * ```
 */
export class GracefulShutdownPlugin implements Plugin {
  public readonly name = "graceful-shutdown-plugin";
  public readonly priority = PluginPriority.SYSTEM; // 系统级插件，最高优先级

  private engine: Microservice | null = null;
  private options: Required<GracefulShutdownPluginOptions>;
  
  // 正在执行的处理器计数
  private activeHandlers: number = 0;
  
  // 是否正在停机
  private isShuttingDown: boolean = false;
  
  // 停机超时定时器
  private shutdownTimer: NodeJS.Timeout | null = null;
  
  // 信号监听器（用于清理）
  private signalListeners: Map<string, () => void> = new Map();

  constructor(options?: GracefulShutdownPluginOptions) {
    this.options = {
      shutdownTimeout: options?.shutdownTimeout ?? 10 * 60 * 1000, // 默认10分钟
      enabled: options?.enabled ?? true,
    };
  }

  /**
   * 引擎初始化钩子
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("GracefulShutdownPlugin initialized");
  }

  /**
   * Handler加载钩子：拦截所有处理器，追踪执行状态
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    if (!this.options.enabled) {
      return;
    }

    // 拦截所有处理器（包括 action、route、schedule 等）
    for (const handler of handlers) {
      handler.wrap(async (next, instance, ...args) => {
        // 如果正在停机，拒绝新的请求
        if (this.isShuttingDown) {
          throw new Error("Service is shutting down, new requests are not accepted");
        }

        // 增加活跃处理器计数
        this.incrementActiveHandlers();

        try {
          // 执行处理器
          const result = await next();
          return result;
        } catch (error) {
          // 即使出错也要减少计数
          throw error;
        } finally {
          // 减少活跃处理器计数
          this.decrementActiveHandlers();
        }
      });
    }

    logger.info(
      `GracefulShutdownPlugin: Tracking ${handlers.length} handler(s)`
    );
  }

  /**
   * 引擎启动后钩子：注册系统信号监听器
   */
  async onAfterStart(engine: Microservice): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    this.engine = engine;
    this.registerSignalHandlers();
    logger.info(
      `GracefulShutdownPlugin: Signal handlers registered, shutdown timeout: ${this.options.shutdownTimeout}ms`
    );
  }

  /**
   * 注册系统信号监听器
   */
  private registerSignalHandlers(): void {
    // 支持的信号列表（兼容不同操作系统）
    const signals: NodeJS.Signals[] = [
      "SIGINT",   // Ctrl+C (Unix/Linux/Mac)
      "SIGTERM",  // 终止信号 (Unix/Linux/Mac)
      "SIGBREAK", // Ctrl+Break (Windows)
    ];

    for (const signal of signals) {
      // 检查信号是否在当前平台支持
      if (process.platform === "win32" && signal === "SIGTERM") {
        // Windows 不支持 SIGTERM，跳过
        continue;
      }

      const handler = () => {
        logger.info(`GracefulShutdownPlugin: Received ${signal} signal`);
        this.initiateShutdown();
      };

      // 注册信号监听器
      process.on(signal, handler);
      
      // 保存监听器引用，用于清理
      this.signalListeners.set(signal, handler);
    }
  }

  /**
   * 增加活跃处理器计数
   */
  private incrementActiveHandlers(): void {
    this.activeHandlers++;
    logger.debug(
      `GracefulShutdownPlugin: Active handlers: ${this.activeHandlers}`
    );
  }

  /**
   * 减少活跃处理器计数
   */
  private decrementActiveHandlers(): void {
    this.activeHandlers = Math.max(0, this.activeHandlers - 1);
    logger.debug(
      `GracefulShutdownPlugin: Active handlers: ${this.activeHandlers}`
    );

    // 如果正在停机且所有处理器已完成，立即执行停机
    if (this.isShuttingDown && this.activeHandlers === 0) {
      logger.info(
        "GracefulShutdownPlugin: All handlers completed, proceeding with shutdown"
      );
      this.completeShutdown();
    }
  }

  /**
   * 启动优雅停机流程
   */
  private async initiateShutdown(): Promise<void> {
    // 防止重复调用
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info(
      `GracefulShutdownPlugin: Initiating graceful shutdown, waiting for ${this.activeHandlers} active handler(s) to complete`
    );

    // 如果当前没有活跃的处理器，立即停机
    if (this.activeHandlers === 0) {
      logger.info(
        "GracefulShutdownPlugin: No active handlers, proceeding with shutdown immediately"
      );
      await this.completeShutdown();
      return;
    }

    // 设置超时定时器
    this.shutdownTimer = setTimeout(() => {
      logger.warn(
        `GracefulShutdownPlugin: Shutdown timeout (${this.options.shutdownTimeout}ms) reached, forcing shutdown`
      );
      this.completeShutdown();
    }, this.options.shutdownTimeout);

    // 等待所有处理器完成（通过 decrementActiveHandlers 触发）
    // 如果超时，completeShutdown 会被定时器调用
  }

  /**
   * 完成停机流程
   */
  private async completeShutdown(): Promise<void> {
    // 清除超时定时器
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    // 清理信号监听器
    this.cleanupSignalHandlers();

    // 停止引擎
    if (this.engine) {
      try {
        await this.engine.stop();
        logger.info("GracefulShutdownPlugin: Engine stopped successfully");
      } catch (error) {
        logger.error("GracefulShutdownPlugin: Failed to stop engine", error);
      }
    }

    // 退出进程
    logger.info("GracefulShutdownPlugin: Process exiting");
    process.exit(0);
  }

  /**
   * 清理信号监听器
   */
  private cleanupSignalHandlers(): void {
    for (const [signal, handler] of this.signalListeners.entries()) {
      process.removeListener(signal, handler);
    }
    this.signalListeners.clear();
  }

  /**
   * 引擎销毁钩子：清理资源
   */
  async onDestroy(): Promise<void> {
    // 清理信号监听器
    this.cleanupSignalHandlers();

    // 清除超时定时器
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    logger.info("GracefulShutdownPlugin: Cleaned up");
  }

  /**
   * 获取当前活跃处理器数量（用于测试和监控）
   */
  getActiveHandlersCount(): number {
    return this.activeHandlers;
  }

  /**
   * 检查是否正在停机（用于测试和监控）
   */
  isShuttingDownNow(): boolean {
    return this.isShuttingDown;
  }
}

