/**
 * doc/diff — 对比文档两个版本的内容差异
 *
 * 端点：GET /api/v2/doc_versions/:id（内部调用两次）
 * 职责：拉取两个版本的 body，做逐行 diff，输出结构化变更报告
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";

// ─── 简单 LCS diff（不依赖外部库） ──────────────────────────

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  line: string;
}

function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // LCS 表
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯
  const result: DiffLine[] = [];
  let i = m, j = n;
  const temp: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: "unchanged", line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: "added", line: newLines[j - 1] });
      j--;
    } else {
      temp.push({ type: "removed", line: oldLines[i - 1] });
      i--;
    }
  }

  return temp.reverse();
}

// ─── 工具定义 ────────────────────────────────────────────────

export const docDiff: McpTool = {
  name: "yuque_diff_doc_versions",
  description:
    "Compare two document versions and show line-level diff (added/removed/unchanged). " +
    "Pulls version bodies via API, computes diff locally, no external dependencies.",

  inputSchema: {
    type: "object",
    properties: {
      version_id_1: {
        type: "number",
        description: "First version ID (required, older version)",
      },
      version_id_2: {
        type: "number",
        description: "Second version ID (required, newer version)",
      },
      max_lines: {
        type: "number",
        description: "Max diff lines to show in preview (default 200, 0 = all)",
      },
      context_lines: {
        type: "number",
        description: "Unchanged context lines around changes (default 3, 0 = no context)",
      },
    },
    required: ["version_id_1", "version_id_2"],
  },

  async handler(args) {
    // @validate
    const v1 = requiredString(args?.version_id_1?.toString(), "version_id_1");
    if (v1) return v1;
    const v2 = requiredString(args?.version_id_2?.toString(), "version_id_2");
    if (v2) return v2;

    const versionId1 = args?.version_id_1 as number;
    const versionId2 = args?.version_id_2 as number;
    const maxLines = (args?.max_lines as number) ?? 200;
    const contextLines = (args?.context_lines as number) ?? 3;

    // 拉取两个版本的 body
    const [data1, data2] = await Promise.all([
      apiGet(`/doc_versions/${versionId1}`, undefined, "Get version 1"),
      apiGet(`/doc_versions/${versionId2}`, undefined, "Get version 2"),
    ]);

    if (isErrorResult(data1)) return data1;
    if (isErrorResult(data2)) return data2;

    const body1 = (data1 as any)?.data?.body ?? "";
    const body2 = (data2 as any)?.data?.body ?? "";
    const title1 = (data1 as any)?.data?.title ?? "";
    const title2 = (data2 as any)?.data?.title ?? "";
    const createdAt1 = (data1 as any)?.data?.created_at ?? "";
    const createdAt2 = (data2 as any)?.data?.created_at ?? "";

    if (!body1 && !body2) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "两个版本都没有 body 内容" }, null, 2),
        }],
        isError: true,
      };
    }

    // 执行 diff
    const diff = diffLines(body1, body2);

    // 统计
    const added = diff.filter(d => d.type === "added").length;
    const removed = diff.filter(d => d.type === "removed").length;
    const unchanged = diff.filter(d => d.type === "unchanged").length;
    const totalChanges = added + removed;
    const totalLines = diff.length;
    const similarity = totalLines > 0
      ? Math.round((unchanged / totalLines) * 10000) / 100
      : 100;

    // 生成带上下文的预览
    let preview = "";
    const lines = maxLines === 0 ? diff.length : Math.min(maxLines, diff.length);

    if (contextLines === 0) {
      // 无上下文：只显示变更行
      const changed = diff.filter(d => d.type !== "unchanged");
      preview = changed.slice(0, lines).map(d => {
        const prefix = d.type === "added" ? "+" : "-";
        return `${prefix} ${d.line}`;
      }).join("\n");
    } else {
      // 带上下文
      const result: string[] = [];
      let lastPrinted = -contextLines - 1;

      for (let i = 0; i < diff.length && result.length < lines; i++) {
        const d = diff[i];
        if (!d) continue;
        if (d.type !== "unchanged") {
          // 在变更前添加上下文
          const ctxStart = Math.max(i - contextLines, lastPrinted + 1, 0);
          for (let c = ctxStart; c < i; c++) {
            if (result.length >= lines) break;
            result.push(`  ${diff[c].line}`);
          }
          const prefix = d.type === "added" ? "+" : "-";
          result.push(`${prefix} ${d.line}`);
          lastPrinted = i;
        } else if (i - lastPrinted <= contextLines && i > lastPrinted) {
          // 变更后的上下文
          result.push(`  ${d.line}`);
          lastPrinted = i;
        }
      }

      preview = result.join("\n");
    }

    const output = {
      version_1: {
        id: versionId1,
        title: title1,
        created_at: createdAt1,
        lines: body1.split("\n").length,
      },
      version_2: {
        id: versionId2,
        title: title2,
        created_at: createdAt2,
        lines: body2.split("\n").length,
      },
      stats: {
        total_lines: totalLines,
        added_lines: added,
        removed_lines: removed,
        unchanged_lines: unchanged,
        total_changes: totalChanges,
        similarity_pct: similarity,
      },
      diff_preview: preview,
      note: maxLines > 0 && totalChanges > maxLines
        ? `预览截断：仅显示前 ${maxLines} 行差异（共 ${totalChanges} 行变更）`
        : undefined,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    };
  },
};