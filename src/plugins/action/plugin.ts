import * as ejson from "ejson";
import { Context } from "hono";
import { Microservice } from "../../core/engine";
import logger from "../../core/logger";
import { nebulaId } from "../../core/nebula-id";
import {
  HandlerMetadata,
  Plugin,
  PluginModuleOptionsSchema,
  PluginPriority,
} from "../../core/types";
import { ActionModuleOptions, ActionOptions } from "./types";
import { buildActionPath, parseAndValidateParams } from "./utils";
import { RequestContext, createTraceContext } from "../telemetry/context";

/**
 * 检查对象是否是 AsyncIterable
 */
function isAsyncIterable(obj: any): obj is AsyncIterable<any> {
  return obj != null && typeof obj[Symbol.asyncIterator] === "function";
}

/**
 * ActionPlugin - 动作处理插件
 * 提供基于下标的参数传递、zod 校验和自动参数注入
 */
export class ActionPlugin implements Plugin<ActionModuleOptions> {
  public readonly name = "action-plugin";
  public readonly priority = PluginPriority.ROUTE; // 路由插件优先级最低，必须最后执行
  private engine!: Microservice;

  /**
   * 声明Module配置Schema（用于类型推导+运行时校验）
   */
  getModuleOptionsSchema(): PluginModuleOptionsSchema<ActionModuleOptions> {
    return {
      _type: {} as ActionModuleOptions,
      validate: (options) => {
        if (
          options.actionMiddlewares !== undefined &&
          !Array.isArray(options.actionMiddlewares)
        ) {
          return "actionMiddlewares must be an array";
        }
        return true;
      },
    };
  }

  /**
   * 引擎初始化钩子：获取Hono实例
   */
  onInit(engine: Microservice): void {
    this.engine = engine;
    logger.info("ActionPlugin initialized");
  }

  /**
   * Handler加载钩子：解析type="action"的Handler元数据，注册HTTP路由
   */
  onHandlerLoad(handlers: HandlerMetadata[]): void {
    // 筛选出所有type="action"的Handler元数据
    const actionHandlers = handlers.filter(
      (handler) => handler.type === "action",
    );

    logger.info(`Found ${actionHandlers.length} action handler(s)`);

    for (const handler of actionHandlers) {
      const actionOptions = handler.options as ActionOptions;
      const methodName = handler.methodName;
      const moduleClass = handler.module;

      // 获取模块实例
      const moduleInstance = this.engine.get(moduleClass);
      if (!moduleInstance) {
        logger.warn(
          `Module instance not found for ${moduleClass.name}, skipping action registration`,
        );
        continue;
      }

      // 获取模块配置
      const moduleMetadata = this.engine
        .getModules()
        .find((m: any) => m.clazz === moduleClass);
      if (!moduleMetadata) {
        logger.warn(
          `Module metadata not found for ${moduleClass.name}, skipping action registration`,
        );
        continue;
      }
      const moduleOptions = (moduleMetadata.options ||
        {}) as ActionModuleOptions;

      // 构建路由路径（引擎prefix + 模块名 + Handler名）
      const enginePrefix = this.engine.options.prefix || "";
      const actionPath = buildActionPath(
        enginePrefix,
        moduleMetadata.name,
        methodName,
      );

      // 获取参数校验 schemas
      const paramSchemas = actionOptions.params || [];
      const returnSchema = actionOptions.returns;

      // 构建路由处理器
      const actionHandler = async (ctx: Context) => {
        // 引擎保证此时原型上的方法已经被所有包装插件包装
        // 直接调用方法名即可获取包装后的方法
        const method = (moduleInstance as any)[methodName];
        if (typeof method !== "function") {
          const errorResponse = ejson.stringify({
            success: false,
            error: "Action method not found",
          });
          return ctx.text(errorResponse, 500, {
            "Content-Type": "application/json",
          });
        }

        try {
          // 解析请求体中的下标参数
          // 支持 GET 请求（从 query 参数解析）和 POST 等（从 body 解析）
          let body: any = {};
          if (ctx.req.method === "GET") {
            // GET 请求从 query 参数解析
            const url = new URL(ctx.req.url);
            url.searchParams.forEach((value, key) => {
              body[key] = value;
            });
          } else {
            // POST 等请求从 body 解析，使用 ejson 反序列化以支持更多数据类型
            try {
              const rawBody = await ctx.req.text();
              if (rawBody) {
                body = ejson.parse(rawBody);
              }
            } catch (parseError) {
              // 如果 ejson 解析失败，尝试 JSON 解析（向后兼容）
              try {
                body = await ctx.req.json().catch(() => ({}));
              } catch {
                body = {};
              }
            }
          }

          // 解析并验证参数（一次性验证所有参数）
          const validation = parseAndValidateParams(body, paramSchemas);
          if (!validation.success) {
            const errors = validation.error.issues || [];
            const errorMessage = `Validation failed: ${errors
              .map((e) => {
                // 处理路径：如果是参数索引（数字），显示为参数位置；否则显示为路径
                const path = e.path || [];
                const pathStr =
                  path.length > 0
                    ? path
                        .map((p, i) => {
                          // 第一个路径是参数索引（"0", "1"等），转换为参数位置
                          if (
                            i === 0 &&
                            typeof p === "string" &&
                            /^\d+$/.test(p)
                          ) {
                            return `参数[${p}]`;
                          }
                          // 后续路径是嵌套属性
                          return String(p);
                        })
                        .join(".")
                    : "unknown";
                return `${pathStr}: ${e.message}`;
              })
              .join(", ")}`;
            const errorResponse = ejson.stringify({
              success: false,
              error: errorMessage,
            });
            return ctx.text(errorResponse, 400, {
              "Content-Type": "application/json",
            });
          }

          // 调用方法，自动注入参数
          // 检查方法是否需要 Context 参数：如果方法的参数数量比定义的参数多 1，则第一个参数是 Context
          const methodLength = method.length;
          const paramsLength = paramSchemas.length;
          const args = [...validation.data];

          // 如果方法参数数量比定义的参数多 1，且第一个参数可能是 Context
          if (methodLength > paramsLength) {
            // 将 Context 作为第一个参数注入
            args.unshift(ctx);
          }

          // 创建追踪上下文并使用 RequestContext 运行方法
          const headersRecord: Record<string, string> = {};
          const headers = ctx.req.raw.headers;
          if (headers) {
            headers.forEach((value: string, key: string) => {
              headersRecord[key] = value;
            });
          }

          const traceContext = createTraceContext(headersRecord, () =>
            nebulaId(),
          );

          const requestContext = {
            trace: traceContext,
            request: {
              method: ctx.req.method,
              path: actionPath,
              headers: headersRecord,
            },
          };

          const result = await RequestContext.run(requestContext, () =>
            method.apply(moduleInstance, args),
          );

          // 如果是流式返回（async generator），转换为 HTTP 流式响应（SSE 格式）
          if (actionOptions.stream) {
            if (!isAsyncIterable(result)) {
              const errorResponse = ejson.stringify({
                success: false,
                error: "Stream action must return AsyncIterable",
              });
              return ctx.text(errorResponse, 500, {
                "Content-Type": "application/json",
              });
            }

            // 使用流式响应格式
            // 客户端使用 tryParseCompleteJson 函数来处理流式响应，支持从缓冲区解析完整的 JSON 对象
            // 格式：{ value?: T, done: boolean, error?: string }
            // 客户端会累积不完整的 chunk 到缓冲区，然后使用 tryParseCompleteJson 解析完整的 JSON 对象
            // 所以我们可以直接发送 JSON 对象，客户端会自动处理合并的 chunk
            const encoder = new TextEncoder();
            const iterator = result[Symbol.asyncIterator]();
            const stream = new ReadableStream<Uint8Array>({
              async start(controller) {
                try {
                  while (true) {
                    const { value, done } = await iterator.next();
                    if (done) {
                      // 发送结束标记
                      controller.enqueue(
                        encoder.encode(ejson.stringify({ done: true })),
                      );
                      controller.close();
                      break;
                    }
                    // 发送数据块，每个 JSON 对象是完整的
                    // 客户端会使用 tryParseCompleteJson 来处理可能被合并的 chunk
                    controller.enqueue(
                      encoder.encode(ejson.stringify({ value, done: false })),
                    );
                  }
                } catch (error) {
                  // 发送错误
                  controller.enqueue(
                    encoder.encode(
                      ejson.stringify({
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                        done: true,
                      }),
                    ),
                  );
                  controller.close();
                }
              },
            });

            return new Response(stream, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              },
            });
          }

          // 校验返回值（如果提供了 return schema）
          if (returnSchema) {
            const returnValidation = returnSchema.safeParse(result);
            if (!returnValidation.success) {
              logger.error(
                `Return value validation failed for ${moduleClass.name}.${methodName}`,
                returnValidation.error,
              );
              const returnErrors = returnValidation.error.issues || [];
              const errorMessage = `Return value validation failed: ${returnErrors
                .map((e) => {
                  const path = e.path || [];
                  const pathStr =
                    path.length > 0
                      ? path.map((p) => String(p)).join(".")
                      : "root";
                  return `${pathStr}: ${e.message}`;
                })
                .join(", ")}`;
              const errorResponse = ejson.stringify({
                success: false,
                error: errorMessage,
              });
              return ctx.text(errorResponse, 400, {
                "Content-Type": "application/json",
              });
            }
            // 使用 ejson 序列化成功响应
            const successResponse = ejson.stringify({
              success: true,
              data: returnValidation.data,
            });
            return ctx.text(successResponse, 200, {
              "Content-Type": "application/json",
            });
          }

          // 使用 ejson 序列化成功响应
          const successResponse = ejson.stringify({
            success: true,
            data: result,
          });
          return ctx.text(successResponse, 200, {
            "Content-Type": "application/json",
          });
        } catch (error) {
          logger.error(
            `Error in action handler ${moduleClass.name}.${methodName}`,
            error,
          );
          const errorResponse = ejson.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return ctx.text(errorResponse, 500, {
            "Content-Type": "application/json",
          });
        }
      };

      // 获取 Hono 实例
      const hono = this.engine.getHono();

      // 应用模块级中间件
      let route = hono;
      if (
        moduleOptions.actionMiddlewares &&
        moduleOptions.actionMiddlewares.length > 0
      ) {
        route = route.use(actionPath, ...moduleOptions.actionMiddlewares);
      }

      // 应用动作级中间件
      if (actionOptions.middlewares && actionOptions.middlewares.length > 0) {
        route = route.use(actionPath, ...actionOptions.middlewares);
      }

      // 注册路由（固定支持 GET 和 POST）
      route.get(actionPath, actionHandler);
      route.post(actionPath, actionHandler);
      logger.info(
        `[注册动作] ${moduleClass.name}.${methodName} ${actionOptions.description}`,
      );
    }
  }
}
