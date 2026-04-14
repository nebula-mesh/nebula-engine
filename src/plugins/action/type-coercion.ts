/**
 * 类型兼容处理模块
 * 在 Zod 验证之前对输入数据进行类型转换，使得类型检查更加宽容
 */

export interface CoercionResult<T = any> {
  success: boolean;
  value?: T;
  error?: string;
}

function isString(value: any): value is string {
  return typeof value === "string";
}

function isNumber(value: any): value is number {
  return typeof value === "number" && !isNaN(value);
}

function isBoolean(value: any): value is boolean {
  return typeof value === "boolean";
}

function isUndefined(value: any): value is undefined {
  return value === undefined;
}

function isNull(value: any): value is null {
  return value === null;
}

function isEmptyString(value: any): boolean {
  return isString(value) && value.trim() === "";
}

export function coerceStringToNumber(value: any): CoercionResult<number> {
  if (isNumber(value)) {
    return { success: true, value };
  }
  if (isString(value)) {
    const trimmed = value.trim();
    if (trimmed === "") {
      return {
        success: false,
        error: "Empty string cannot be converted to number",
      };
    }
    const num = Number(trimmed);
    if (isNumber(num)) {
      return { success: true, value: num };
    }
    return {
      success: false,
      error: `String "${value}" cannot be parsed as number`,
    };
  }
  return { success: false, error: `Cannot convert ${typeof value} to number` };
}

export function coerceNumberToString(value: any): CoercionResult<string> {
  if (isString(value)) {
    return { success: true, value };
  }
  if (isNumber(value)) {
    return { success: true, value: String(value) };
  }
  if (isBoolean(value)) {
    return { success: true, value: String(value) };
  }
  return { success: false, error: `Cannot convert ${typeof value} to string` };
}

export function coerceStringToBoolean(value: any): CoercionResult<boolean> {
  if (isBoolean(value)) {
    return { success: true, value };
  }
  if (isString(value)) {
    const lower = value.toLowerCase().trim();
    if (lower === "true" || lower === "1" || lower === "yes") {
      return { success: true, value: true };
    }
    if (lower === "false" || lower === "0" || lower === "no") {
      return { success: true, value: false };
    }
    return {
      success: false,
      error: `String "${value}" cannot be parsed as boolean`,
    };
  }
  if (isNumber(value)) {
    return { success: true, value: value !== 0 };
  }
  return { success: false, error: `Cannot convert ${typeof value} to boolean` };
}

export function coerceNumberToBoolean(value: any): CoercionResult<boolean> {
  if (isBoolean(value)) {
    return { success: true, value };
  }
  if (isNumber(value)) {
    return { success: true, value: value !== 0 };
  }
  if (isString(value)) {
    return coerceStringToBoolean(value);
  }
  return { success: false, error: `Cannot convert ${typeof value} to boolean` };
}

function getDefType(schema: any): string | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  return schema.def?.type;
}

function getInnerType(schema: any): any {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  return schema.def?.innerType || schema.def?.schema || schema;
}

export function isOptional(schema: any): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const typeName = getDefType(schema);
  if (typeName === "optional") {
    return true;
  }
  if (schema.isOptional && typeof schema.isOptional === "function") {
    return schema.isOptional();
  }
  return false;
}

export function isNullable(schema: any): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const typeName = getDefType(schema);
  if (typeName === "nullable") {
    return true;
  }
  if (schema.isNullable && typeof schema.isNullable === "function") {
    return schema.isNullable();
  }
  return false;
}

export function isStringType(schema: any): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const typeName = getDefType(schema);
  if (typeName === "string") {
    return true;
  }
  return false;
}

export function isNumberType(schema: any): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const typeName = getDefType(schema);
  if (typeName === "number") {
    return true;
  }
  return false;
}

export function isBooleanType(schema: any): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const typeName = getDefType(schema);
  if (typeName === "boolean") {
    return true;
  }
  return false;
}

function getTargetType(schema: any): string | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const typeName = getDefType(schema);
  if (typeName === "optional" || typeName === "nullable") {
    return getTargetType(getInnerType(schema));
  }
  return typeName;
}

export interface CoerceOptions {
  coerceStringToNumber?: boolean;
  coerceNumberToString?: boolean;
  coerceStringToBoolean?: boolean;
  coerceNumberToBoolean?: boolean;
  coerceNullToOptional?: boolean;
}

const DEFAULT_COERCE_OPTIONS: CoerceOptions = {
  coerceStringToNumber: true,
  coerceNumberToString: false,
  coerceStringToBoolean: true,
  coerceNumberToBoolean: true,
  coerceNullToOptional: true,
};

export function coerceBody(
  body: any,
  schemas: any[],
  options: CoerceOptions = DEFAULT_COERCE_OPTIONS,
): any {
  if (!body || typeof body !== "object") {
    return body;
  }

  if (!Array.isArray(schemas) || schemas.length === 0) {
    return body;
  }

  const coercedBody: any = {};

  for (const key of Object.keys(body)) {
    const index = parseInt(key, 10);
    if (isNaN(index) || index < 0 || index >= schemas.length) {
      coercedBody[key] = body[key];
      continue;
    }

    const schema = schemas[index];
    const value = body[key];

    if (value === undefined) {
      coercedBody[key] = value;
      continue;
    }

    if (value === null) {
      if (options.coerceNullToOptional && isNullable(schema)) {
        coercedBody[key] = null;
      } else if (options.coerceNullToOptional && isOptional(schema)) {
        coercedBody[key] = undefined;
      } else {
        coercedBody[key] = null;
      }
      continue;
    }

    if (isEmptyString(value) && (isOptional(schema) || isNullable(schema))) {
      coercedBody[key] = isNullable(schema) ? null : undefined;
      continue;
    }

    let coerced = false;
    const targetType = getTargetType(schema);

    if (
      options.coerceStringToNumber &&
      targetType === "number" &&
      isString(value)
    ) {
      const result = coerceStringToNumber(value);
      if (result.success) {
        coercedBody[key] = result.value;
        coerced = true;
      }
    }

    if (
      !coerced &&
      options.coerceStringToBoolean &&
      targetType === "boolean" &&
      isString(value)
    ) {
      const result = coerceStringToBoolean(value);
      if (result.success) {
        coercedBody[key] = result.value;
        coerced = true;
      }
    }

    if (
      !coerced &&
      options.coerceNumberToString &&
      targetType === "string" &&
      isNumber(value)
    ) {
      const result = coerceNumberToString(value);
      if (result.success) {
        coercedBody[key] = result.value;
        coerced = true;
      }
    }

    if (
      !coerced &&
      options.coerceNumberToBoolean &&
      targetType === "boolean" &&
      isNumber(value)
    ) {
      const result = coerceNumberToBoolean(value);
      if (result.success) {
        coercedBody[key] = result.value;
        coerced = true;
      }
    }

    if (!coerced) {
      coercedBody[key] = value;
    }
  }

  return coercedBody;
}
