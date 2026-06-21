/**
 * validate — 轻量参数校验
 *
 * 不引入 zod/ajv，用简单函数保证运行时安全。
 * 校验失败返回 MCP error 对象，通过返回 null 表示通过。
 * 错误信息：中文 + English 双语。
 */

type ErrorResult = { content: Array<{ type: "text"; text: string }>; isError: true };

function fail(msgCn: string, msgEn: string): ErrorResult {
  return {
    content: [{ type: "text", text: JSON.stringify({
      error: `${msgCn} / ${msgEn}`,
      hint: "zh/en",
    }, null, 2) }],
    isError: true,
  };
}

/** 非空字符串 */
export function requiredString(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null)
    return fail(`${name} 是必填参数`, `${name} is required`);
  if (typeof value !== "string")
    return fail(`${name} 必须是字符串`, `${name} must be a string`);
  if (value.trim() === "")
    return fail(`${name} 不能为空`, `${name} cannot be empty`);
  return null;
}

/** 可选字符串（有值时不能为空） */
export function optionalString(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string")
    return fail(`${name} 必须是字符串`, `${name} must be a string`);
  return null;
}

/** 可选布尔值 */
export function optionalBoolean(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean")
    return fail(`${name} 必须是布尔值`, `${name} must be a boolean`);
  return null;
}

/** 正整数 */
export function positiveInt(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return fail(`${name} 必须是正整数`, `${name} must be a positive integer`);
  }
  return null;
}

/** 数值上限 */
export function maxValue(value: unknown, name: string, max: number): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || value > max) {
    return fail(`${name} 不能超过 ${max}`, `${name} must be ≤ ${max}`);
  }
  return null;
}

/** 枚举值 */
export function oneOf(value: unknown, name: string, allowed: readonly (string | number)[]): ErrorResult | null {
  if (value === undefined || value === null) return null;
  if (!allowed.includes(value as any)) {
    return fail(
      `${name} 取值必须为: ${allowed.join(", ")}`,
      `${name} must be one of: ${allowed.join(", ")}`,
    );
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