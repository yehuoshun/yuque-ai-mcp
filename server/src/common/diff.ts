/**
 * common/diff — 纯函数 LCS diff 算法
 *
 * 不依赖外部库，零依赖。
 * 被 diff-doc.ts 等工具共用。
 */

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  line: string;
}

/** 对两段文本做逐行 LCS diff，返回 diff 行列表 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
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