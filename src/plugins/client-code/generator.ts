import { type z } from "zod";
import { formatCode } from "./format";
import type { ModuleInfo } from "./types";

/**
 * 获取 Zod 类型的 TypeScript 类型字符串
 */
export function getZodTypeString(
  schema: z.ZodType<any>,
  defaultOptional: boolean = false
): string {
  // 递归处理可空和可选类型
  function processType(type: z.ZodType<any>): string {
    if (!type) {
      return "unknown";
    }
    // Zod 4.x: 使用 _def 访问内部定义，使用 as any 避免类型错误
    const def = (type as any)._def as any;

    // Zod 4.x: 使用 def.type 替代 def.typeName
    const typeName = def.type;

    // 处理可空类型
    if (typeName === "nullable") {
      return `${processType(def.innerType)} | null`;
    }

    // 处理可选类型
    if (typeName === "optional") {
      return processType(def.innerType);
    }

    // 处理 transform 类型 (ZodEffects/ZodPipe)
    // Zod 4.x: transform 变成了 pipe 类型，使用 def.in
    if (typeName === "pipe" && def.in) {
      return processType(def.in);
    }
    // Zod 3.x: 使用 def.schema (兼容旧版本)
    if (typeName === "effects" && def.schema) {
      return processType(def.schema);
    }

    // 处理基础类型
    // Zod 4.x: 只使用新的类型名称（如 "string", "number" 等）
    switch (typeName) {
      case "string": {
        return "string";
      }
      case "number": {
        return "number";
      }
      case "bigint": {
        return "bigint";
      }
      case "boolean": {
        return "boolean";
      }
      case "array": {
        // Zod 4.x: 使用 def.element
        const elementType = processType(def.element);
        return `${elementType}[]`;
      }
      case "date": {
        return "Date";
      }
      case "object": {
        // Zod 4.x: shape 是一个对象，不再是函数
        const shape = typeof def.shape === "function" ? def.shape() : def.shape;
        const props = Object.entries(shape)
          .map(([key, value]) => {
            if (key.includes("-")) {
              key = `'${key}'`;
            }
            const fieldDef = (value as any)._def as any;
            const fieldTypeName = fieldDef.type;
            const isOptional = fieldTypeName === "optional";
            const isDefault = defaultOptional && fieldTypeName === "default";
            const fieldType = processType(
              isOptional ? fieldDef.innerType : value
            );
            return `${key}${isOptional || isDefault ? "?" : ""}: ${fieldType}`;
          })
          .join("; ");
        return `{ ${props} }`;
      }

      case "union": {
        return def.options
          .map((opt: z.ZodType<any>) => processType(opt))
          .join(" | ");
      }
      case "null": {
        return "null";
      }
      case "promise": {
        return `Promise<${processType(def.type)}>`;
      }
      case "void": {
        return "void";
      }
      case "record": {
        // Zod 4.x: z.record(valueType) 时，只有 keyType（实际上是 valueType），keyType 默认为 string
        // z.record(keyType, valueType) 时，keyType 和 valueType 都存在
        if (def.valueType) {
          const keyType = def.keyType ? processType(def.keyType) : "string";
          return `Record<${keyType}, ${processType(def.valueType)}>`;
        } else if (def.keyType) {
          // z.record(valueType) 的情况，keyType 实际上是 valueType
          return `Record<string, ${processType(def.keyType)}>`;
        }
        return "Record<string, any>";
      }
      case "map": {
        return `Map<${processType(def.keyType)}, ${processType(
          def.valueType
        )}>`;
      }
      case "any": {
        return "any";
      }
      case "unknown": {
        return "unknown";
      }
      case "enum": {
        // Zod 4.x: 使用 def.entries，entries 是一个对象
        const values = def.entries ? Object.values(def.entries) : [];
        return (
          "(" +
          values.map((opt: unknown) => `"${String(opt)}"`).join(" | ") +
          ")"
        );
      }
      case "default": {
        return processType(def.innerType);
      }
      default: {
        if (type.safeParse(new Uint8Array()).success) {
          return "Uint8Array";
        }
        return "unknown";
      }
    }
  }

  return processType(schema);
}

/**
 * 生成客户端代码
 * @param modules 模块信息
 * @returns 生成的客户端代码
 */
export async function generateClientCode(
  modules: Record<string, ModuleInfo>
): Promise<string> {
  const imports = [
    "// 这个文件是自动生成的，请不要手动修改",
    "",
    'import { MicroserviceClient as BaseMicroserviceClient } from "imean-service-client";',
    'export * from "imean-service-client";',
    "",
  ].join("\n");

  /**
   * 将模块名转换为有效的 TypeScript 标识符
   * 例如: "user-service" -> "UserService"
   */
  function toPascalCase(moduleName: string): string {
    return moduleName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
  }

  /**
   * 将模块名转换为有效的 TypeScript 属性名（驼峰命名）
   * 例如: "user-service" -> "userService"
   */
  function toCamelCase(moduleName: string): string {
    const parts = moduleName.split("-");
    return (
      parts[0] +
      parts
        .slice(1)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("")
    );
  }

  const interfaces = Object.entries(modules)
    .map(([name, module]) => {
      const methods = Object.entries(module.actions)
        .map(([actionName, action]) => {
          if (!action.params) {
            throw new Error(`Missing params for action ${actionName}`);
          }

          // 使用 getZodTypeString 提取参数和返回值类型
          // 优先使用 paramNames，如果没有则使用 param.description，最后使用 arg${index}
          const paramNames = action.paramNames || [];
          const params = action.params
            .map((param: z.ZodType<any>, index: any) => {
              const paramName =
                paramNames[index] ||
                param.description ||
                `arg${index}`;
              // 检查参数是否可选或有默认值
              const paramDef = (param as any)._def as any;
              const isOptional = param.isOptional();
              const hasDefault = paramDef?.type === "default";
              return `${paramName}${isOptional || hasDefault ? "?" : ""}: ${getZodTypeString(
                param,
                true
              )}`;
            })
            .join(", ");

          const returnType = action.returns
            ? getZodTypeString(action.returns)
            : "void";

          return `
        /**
         * ${action.description || ""}
         */
        ${actionName}: (${params}) => Promise<${
          action.stream ? `AsyncIterable<${returnType}>` : returnType
        }>;`;
        })
        .join("\n    ");

      const interfaceName = `${toPascalCase(name)}Module`;
      return `export interface ${interfaceName} {
    ${methods}
}`;
    })
    .join("\n\n");

  const clientClass = `export class MicroserviceClient extends BaseMicroserviceClient {
  constructor(options: any) {
    super(options);
  }

  ${Object.entries(modules)
    .map(([name, module]) => {
      const methods = Object.entries(module.actions)
        .map(([actionName, action]) => {
          return `${actionName}: { idempotent: ${!!action.idempotence}, stream: ${!!action.stream} }`;
        })
        .join(",\n      ");

      const propertyName = toCamelCase(name);
      const interfaceName = `${toPascalCase(name)}Module`;

      return `public readonly ${propertyName} = this.registerModule<${interfaceName}>("${name}", {
      ${methods}
    });`;
    })
    .join("\n\n  ")}
}`;

  return await formatCode([imports, interfaces, clientClass].join("\n\n"));
}
