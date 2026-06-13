/**
 * validate — 轻量参数校验
 *
 * 不引入 zod/ajv，用简单函数保证运行时安全。
 * 校验失败返回 MCP error 对象，通过返回 null 表示通过。
 */

type ErrorResult = { content: Array<{ type: "text"; text: string }>; isError: true };

function fail(msg: string): ErrorResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: `Invalid parameter: ${msg}` }, null, 2) }], isError: true };
}

/** 非空字符串 */
export function requiredString(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null) return fail(`${name} is required`);
  if (typeof value !== "string") return fail(`${name} must be a string`);
  if (value.trim() === "") return fail(`${name} cannot be empty`);
  return null;
}

/** 可选字符串（有值时不能为空） */
export function optionalString(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return fail(`${name} must be a string`);
  return null;
}

/** 正整数 */
export function positiveInt(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return fail(`${name} must be a positive integer`);
  }
  return null;
}

/** 数值上限 */
export function maxValue(value: unknown, name: string, max: number): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || value > max) {
    return fail(`${name} must be ≤ ${max}`);
  }
  return null;
}

/** 枚举值 */
export function oneOf(value: unknown, name: string, allowed: readonly (string | number)[]): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (!allowed.includes(value as any)) {
    return fail(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return null;
}

/** 批量校验，返回第一个失败的结果 */
export function check(...results: (ErrorResult | null)[]): ErrorResult | null {
  for (const r of results) {
    if (r !== null) return r;
  }
  return null;
}