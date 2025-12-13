import { promises as fs } from "fs";
import { Context } from "hono";
import { dirname } from "path";
import logger from "../../core/logger";
import {
  HandlerMetadata,
  Microservice,
  Plugin,
  PluginPriority,
} from "../../core/types";
import { generateClientCode } from "./generator";
import { convertHandlersToModuleInfoWithMetadata } from "./utils";

/**
 * ClientCodePlugin 配置选项
 */
export interface ClientCodePluginOptions {
  /**
   * 客户端代码保存路径（可选）
   * 如果设置，将在生成代码后自动保存到该路径
   * 通常用于开发阶段自动生成客户端代码用于调试或测试
   *
   * @example
   * ```ts
   * new ClientCodePlugin({ clientSavePath: "./generated/client.ts" })
   * ```
   */
  clientSavePath?: string;
}

/**
 * ClientCodePlugin - 客户端代码生成插件
 * 收集所有 Action handlers，生成类型化的客户端代码，
 * 并提供 /client.ts 路由供远程下载
 */
export class ClientCodePlugin implements Plugin {
  public readonly name = "client-code-plugin";
  public readonly priority = PluginPriority.ROUTE; // 路由插件优先级，在 ActionPlugin 之后

  private engine!: Microservice;
  private actionHandlers: HandlerMetadata[] = [];
  private generatedCode: string | null = null;
  private readonly clientSavePath?: string;

  constructor(options?: ClientCodePluginOptions) {
    this.clientSavePath = options?.clientSavePath;
  }

  /**
   * 引擎初始化钩子
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("ClientCodePlugin initialized");
  }

  /**
   * Handler加载钩子：收集所有 Action handlers
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 筛选出所有 type="action" 的 Handler
    const actionHandlers = handlers.filter(
      (handler) => handler.type === "action"
    );

    this.actionHandlers = actionHandlers;
    logger.info(
      `ClientCodePlugin collected ${actionHandlers.length} action handler(s)`
    );
  }

  /**
   * 引擎启动后钩子：注册客户端代码下载路由
   */
  async onAfterStart(engine: Microservice): Promise<void> {
    // 生成客户端代码
    await this.generateCode();

    // 注册路由：{prefix}/client.ts
    const prefix = engine.options.prefix || "";
    const clientPath = prefix ? `${prefix}/client.ts` : "/client.ts";

    // 获取 Hono 实例
    const hono = engine.getHono();

    // 注册路由
    hono.get(clientPath, async (ctx: Context) => {
      // 如果代码还未生成，重新生成
      if (!this.generatedCode) {
        await this.generateCode();
      }

      // 返回 TypeScript 代码
      return ctx.text(this.generatedCode || "", 200, {
        "Content-Type": "text/typescript; charset=utf-8",
        "Content-Disposition": `attachment; filename="client.ts"`,
      });
    });

    logger.info(`Client code available at ${clientPath}`);
  }

  /**
   * 生成客户端代码
   */
  private async generateCode(): Promise<void> {
    try {
      // 获取模块元数据映射函数
      const getModuleMetadata = (moduleClass: any) => {
        const modules = this.engine.getModules();
        const moduleMetadata = modules.find((m) => m.clazz === moduleClass);
        return moduleMetadata ? { name: moduleMetadata.name } : undefined;
      };

      // 将 handlers 转换为 ModuleInfo 格式
      const modules = convertHandlersToModuleInfoWithMetadata(
        this.actionHandlers,
        getModuleMetadata
      );

      // 生成代码
      this.generatedCode = await generateClientCode(modules);

      logger.debug(
        `Generated client code for ${Object.keys(modules).length} module(s)`
      );

      // 如果设置了保存路径，保存代码到文件
      if (this.clientSavePath && this.generatedCode) {
        await this.saveCodeToFile(this.clientSavePath, this.generatedCode);
      }
    } catch (error) {
      logger.error("Failed to generate client code", error);
      this.generatedCode = "// Error: Failed to generate client code";
    }
  }

  /**
   * 保存代码到文件
   */
  private async saveCodeToFile(path: string, code: string): Promise<void> {
    try {
      // 确保目录存在
      const dir = dirname(path);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      await fs.writeFile(path, code, "utf-8");
      logger.info(`Client code saved to ${path}`);
    } catch (error) {
      logger.error(`Failed to save client code to ${path}`, error);
      // 不抛出错误，避免影响主流程
    }
  }
}
