/**
 * errors — 语雀 API 错误码处理
 *
 * 职责：统一映射 HTTP 状态码 + 语雀业务 code → 错误描述，提供 handleApiError 工具函数
 */

/** HTTP 状态码 → 错误描述 */
const STATUS_MAP: Record<number, string> = {
  400: "Bad request — invalid parameters",
  401: "Unauthorized — token missing or invalid",
  403: "Forbidden — insufficient permissions",
  404: "Not found — entity does not exist",
  422: "Unprocessable — parameter validation failed",
  429: "Rate limited — too many requests",
  500: "Internal server error",
};

/** 语雀业务 code → 错误描述 */
const YUQUE_CODE_MAP: Record<string, string> = {
  invalid_params: "参数无效，请检查必填字段和格式 / Invalid parameters — check required fields and formats",
  not_found: "Entity not found — check the ID or slug",
  permission_denied: "Permission denied — check token scope or team membership",
  user_not_found: "User not found — check login or ID",
  book_not_found: "Repository not found — check book_id or namespace",
  doc_not_found: "Document not found — check doc ID or slug",
  note_not_found: "Note not found — check note ID",
  group_not_found: "Group not found — check group login or ID",
  recycle_not_found: "Recycle bin item not found — check recycle_id",
  version_not_found: "Version not found — check version ID",
  toc_not_found: "TOC not found — check book_id",
  slug_conflict: "Slug conflict — a document with this slug already exists",
  book_slug_conflict: "Repository slug conflict — a repo with this slug already exists",
  token_expired: "Token expired — regenerate your API token",
  token_invalid: "Token invalid — check your API token",
  scope_insufficient: "Scope insufficient — token lacks required API scope",
  rate_limit: "Rate limit exceeded — slow down and retry",
  upload_failed: "Upload failed — check file size, type, and cookie/ctoken",
  cookie_required: "Cookie required — this operation needs cookie + ctoken in config.json",
  membership_required: "Membership required — upgrade to access this feature",
  body_parse_failed: "Request body parse failed — check JSON format",
  too_many_requests: "Too many requests — back off and retry",
  book_full: "cannot create more than 5000 documents in a book from api",
};

/** 解析语雀业务 code */
function parseYuqueCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.code && typeof parsed.code === "string") {
      return parsed.code;
    }
    if (parsed?.message && typeof parsed.message === "string") {
      // 有些端点不返回 code，只返回 message
      return undefined;
    }
  } catch {
    // body 不是 JSON
  }
  return undefined;
}

/**
 * 解析语雀 API 响应错误，返回结构化错误信息
 *
 * @param res - fetch Response 对象
 * @param context - 操作上下文（如「获取用户信息」），用于拼错误前缀
 * @returns 格式化的错误对象，可直接作为 MCP tool 返回值
 */
export async function handleApiError(
  res: Response,
  context: string,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}> {
  const status = res.status;
  const statusLabel = STATUS_MAP[status] ?? `Unknown error (HTTP ${status})`;

  let detail = "";
  let body = "";

  // 读取响应 body
  try {
    body = await res.text();
  } catch {
    // 读 body 失败，忽略
  }

  // 先尝试解析语雀业务 code
  const yuqueCode = body ? parseYuqueCode(body) : undefined;
  const yuqueLabel = yuqueCode ? YUQUE_CODE_MAP[yuqueCode] : undefined;

  // 构建详情
  if (yuqueLabel) {
    detail += `\nYuque code: ${yuqueCode} — ${yuqueLabel}`;
  } else if (body) {
    // 尝试提取 message 字段
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message && typeof parsed.message === "string") {
        detail += `\nMessage: ${parsed.message}`;
      } else if (body.length < 500) {
        detail += `\nResponse: ${body}`;
      }
    } catch {
      if (body.length < 500) detail += `\nResponse: ${body}`;
    }
  }

  // 429 限流：提取 X-RateLimit-* 头
  if (status === 429) {
    const limit = res.headers.get("X-RateLimit-Limit");
    const remaining = res.headers.get("X-RateLimit-Remaining");
    const retryAfter = res.headers.get("Retry-After");
    const parts: string[] = [];
    if (limit) parts.push(`Limit: ${limit}/hour`);
    if (remaining !== null) parts.push(`Remaining: ${remaining}`);
    if (retryAfter) parts.push(`Retry-After: ${retryAfter}s`);
    if (parts.length) detail += `\nRate info: ${parts.join(", ")}`;
  }

  return {
    content: [
      {
        type: "text",
        text: `${context} failed — ${statusLabel}${detail}`,
      },
    ],
    isError: true,
  };
}

/**
 * 删除操作二次确认参数 schema
 *
 * 用法：在需要确认的删除工具 inputSchema 中展开此对象
 */
export const confirmationParam = {
  confirm: {
    type: "string",
    description:
      "Confirmation token. Must be set to the exact string 'DELETE' to proceed. This is a safety guard against accidental deletion.",
  },
} as const;

/**
 * 检查确认参数，未确认则返回错误
 *
 * @returns null 表示确认通过，否则返回错误对象
 */
export function checkConfirmation(
  args: Record<string, unknown> | undefined,
): { content: Array<{ type: "text"; text: string }>; isError: true } | null {
  if (args?.confirm !== "DELETE") {
    return {
      content: [
        {
          type: "text",
          text: "⚠️ 危险操作需二次确认，请将参数 `confirm` 设为 'DELETE' 后重试 / Destructive operation requires confirmation. Set parameter `confirm` to the exact string 'DELETE' to proceed.",
        },
      ],
      isError: true,
    };
  }
  return null;
}

/** 检测是否为语雀"知识库已满"的错误（超过 5000 文档） */
export function isBookFullError(err: unknown): boolean {
  const e = err as { isError?: boolean; content?: Array<{ type: string; text: string }> };
  if (!e?.isError || !e?.content?.[0]?.text) return false;
  const msg = e.content[0].text.toLowerCase();
  return msg.includes(YUQUE_CODE_MAP.book_full);
}