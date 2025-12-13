/**
 * 优雅停机插件配置选项
 */
export interface GracefulShutdownPluginOptions {
  /**
   * 停机超时时间（毫秒）
   * 默认：10分钟（600000ms）
   */
  shutdownTimeout?: number;

  /**
   * 是否启用优雅停机
   * 默认：true
   */
  enabled?: boolean;
}

