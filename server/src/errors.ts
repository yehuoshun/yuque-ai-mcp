/**
 * errors — 语雀 API 错误码处理
 *
 * 职责：统一映射 HTTP 状态码 → 中文错误描述，提供 handleApiError 工具函数
 */

/** 错误码 → 中文描述 */
const STATUS_MAP: Record<number, string> = {
  400: "请求参数非法",
  401: "Token/Scope 未通过鉴权",
  403: "无操作权限",
  404: "实体未找到",
  422: "请求参数校验失败",
  429: "访问频率超限",
  500: "内部错误",
};

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
  const label = STATUS_MAP[status] ?? `未知错误 (${status})`;

  let detail = "";
  try {
    const body = await res.text();
    if (body) detail = `\n响应: ${body.slice(0, 500)}`;
  } catch {
    // 读 body 失败，忽略
  }

  return {
    content: [
      {
        type: "text",
        text: `${context}失败 — ${label}${detail}`,
      },
    ],
    isError: true,
  };
}
