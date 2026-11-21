/**
 * validate — 轻量参数校验
 *
 * 不引入 zod/ajv，用简单函数保证运行时安全。
 * 校验失败返回 MCP error 对象，通过返回 null 表示通过。
 * 错误信息：中文 + English 双语。
 */

type ErrorResult = { content: Array<{ type: "text"; text: string }>; isError: true };

export function fail(msgCn: string, msgEn: string): ErrorResult {
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

/**
 * 宽松 ID：接受 number 或纯数字字符串（MCP 客户端常把 id 传成 string）。
 * 数字型接口（/notes/:id、/doc_versions/:id、/mine/recycles/:id）用这一对。
 */
export function reqId(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null)
    return fail(`${name} 是必填参数`, `${name} is required`);
  const bad = fail(`${name} 必须是正整数或数字字符串`, `${name} must be a positive integer or numeric string`);
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) return bad;
    return null;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!/^\d+$/.test(t) || Number(t) < 1) return bad;
    return null;
  }
  return bad;
}

/** 可选的宽松 ID（有值时同 reqId，未给则放行） */
export function optId(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null) return null;
  return reqId(value, name);
}

/** 宽松 ID：number 或非空字符串都接受（接口既收数字 id 又收 slug/namespace 时用） */
export function reqIdLike(value: unknown, name: string): ErrorResult | null {
  if (value === undefined || value === null)
    return fail(`${name} 是必填参数`, `${name} is required`);
  const bad = fail(`${name} 必须是正整数或非空字符串`, `${name} must be a positive integer or non-empty string`);
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) return bad;
    return null;
  }
  if (typeof value === "string" && value.trim() !== "") return null;
  return bad;
}

/** 归一化为 number（调用前先用 reqId / optId 校验） */
export function toIdNum(value: unknown): number {
  return typeof value === "number" ? value : Number(String(value).trim());
}

/** 归一化为 string（调用前先用 reqIdLike 校验） */
export function toIdStr(value: unknown): string {
  return String(value).trim();
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

/**
 * 解析 batch-get 的 ids 参数：接受 string（JSON 数组）或直接 array
 * MCP CLI 传 `[1,2,3]` 时可能是 string 也可能是 array，取决于 CLI 实现
 */
export function idsArgToArray(value: unknown): (string | number)[] | ErrorResult {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  return fail("ids 必须是合法 JSON 数组或数组 / ids must be a valid JSON array or array", "zh/en");
}

/** 批量校验，返回第一个失败的结果 */
export function check(...results: (ErrorResult | null)[]): ErrorResult | null {
  for (const r of results) {
    if (r !== null) return r;
  }
  return null;
}