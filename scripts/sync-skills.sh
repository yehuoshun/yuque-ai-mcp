#!/usr/bin/env bash
# sync-skills.sh — 从 MCP 工具元数据同步到 yuque-ai-skills 仓库
#
# 用法：
#   ./scripts/sync-skills.sh <域> <工具文件名> <端点> <说明> [MCP工具名]
#
# 示例：
#   ./scripts/sync-skills.sh search hyde-search "GET /api/v2/search" "HyDE 降级搜索"
#   ./scripts/sync-skills.sh doc create-doc "POST /api/v2/repos/:book_id/docs" "创建文档" yuque_create_doc
#
# 自动做的事：
#   1. yuque-ai-skills/SKILL.md — 端点速查表追加一行
#   2. yuque-ai-skills/references/api/{域}_api.md — 追加端点条目
#   3. yuque-ai-skills/skills/{域}/{工具}.md — 生成模板文件
#   4. yuque-ai-skills/README.md — 更新工具覆盖表数量
#
# 输出：打印需要手动补充的内容清单

set -euo pipefail

DOMAIN="${1:?缺少参数：域}"
TOOL_FILE="${2:?缺少参数：工具文件名}"
ENDPOINT="${3:?缺少参数：端点}"
DESC="${4:?缺少参数：说明}"
MCP_TOOL_NAME="${5:-yuque_${TOOL_FILE//-/_}}"

SKILLS_DIR="/root/.openclaw/workspace/skills/yuque-ai-skills"
SKILL_FILE="${SKILLS_DIR}/skills/${DOMAIN}/${TOOL_FILE}.md"
API_REF="${SKILLS_DIR}/references/api/${DOMAIN}_api.md"

echo "=== 同步 yuque-ai-skills ==="
echo "  域:       ${DOMAIN}"
echo "  工具文件: ${TOOL_FILE}.md"
echo "  端点:     ${ENDPOINT}"
echo "  说明:     ${DESC}"
echo "  MCP工具名: ${MCP_TOOL_NAME}"
echo ""

# ── 1. SKILL.md 端点速查表 ──
SKILL_MD="${SKILLS_DIR}/SKILL.md"
TABLE_LINE="| \`${ENDPOINT}\` | ${DOMAIN} | ${DESC} | \`skills/${DOMAIN}/${TOOL_FILE}.md\` |"

if grep -qF "${ENDPOINT}" "${SKILL_MD}" 2>/dev/null; then
  echo "  ⏭ SKILL.md: 端点已存在，跳过"
else
  # 在最后一个表格行后插入
  LAST_TABLE_LINE=$(grep -n '^| `' "${SKILL_MD}" | tail -1 | cut -d: -f1)
  if [ -n "${LAST_TABLE_LINE}" ]; then
    sed -i "${LAST_TABLE_LINE}a\\${TABLE_LINE}" "${SKILL_MD}"
    echo "  ✅ SKILL.md: 已追加端点速查表条目"
  else
    echo "  ⚠️  SKILL.md: 未找到表格，请手动添加"
  fi
fi

# ── 2. references/api/{域}_api.md ──
if [ -f "${API_REF}" ]; then
  ENTRY="\n### ${MCP_TOOL_NAME}\n\n\`\`\`\n${ENDPOINT}\n\`\`\`\n\n${DESC}。\n\n<!-- TODO: 补充参数说明、响应示例、注意事项 -->\n"
  if grep -qF "${ENDPOINT}" "${API_REF}" 2>/dev/null; then
    echo "  ⏭ references/api/${DOMAIN}_api.md: 端点已存在，跳过"
  else
    echo -e "${ENTRY}" >> "${API_REF}"
    echo "  ✅ references/api/${DOMAIN}_api.md: 已追加端点条目"
  fi
else
  echo "  ⚠️  references/api/${DOMAIN}_api.md: 文件不存在，请手动创建"
fi

# ── 3. skills/{域}/{工具}.md ──
if [ -f "${SKILL_FILE}" ]; then
  echo "  ⏭ skills/${DOMAIN}/${TOOL_FILE}.md: 已存在，跳过"
else
  mkdir -p "$(dirname "${SKILL_FILE}")"
  cat > "${SKILL_FILE}" << EOF
# ${MCP_TOOL_NAME}

> 端点：\`${ENDPOINT}\`
> 说明：${DESC}

## 参数

<!-- TODO: 补充参数表 -->

## 响应

<!-- TODO: 补充响应示例 -->

## 使用场景

<!-- TODO: 什么时候用这个工具 -->

## 注意事项

<!-- TODO: 常见坑、限制、最佳实践 -->
EOF
  echo "  ✅ skills/${DOMAIN}/${TOOL_FILE}.md: 已生成模板"
fi

# ── 4. README.md 工具覆盖表 ──
README="${SKILLS_DIR}/README.md"
if [ -f "${README}" ]; then
  # 检查域是否已在覆盖表中
  if grep -qF "| ${DOMAIN} |" "${README}"; then
    # 域已存在，更新工具数
    CURRENT_COUNT=$(grep "| ${DOMAIN} |" "${README}" | grep -oP '\|\s*\K\d+' | head -1)
    if [ -n "${CURRENT_COUNT}" ]; then
      NEW_COUNT=$((CURRENT_COUNT + 1))
      sed -i "s/| ${DOMAIN} | ${CURRENT_COUNT} |/| ${DOMAIN} | ${NEW_COUNT} |/" "${README}"
      echo "  ✅ README.md: ${DOMAIN} 域工具数 ${CURRENT_COUNT} → ${NEW_COUNT}"
    fi
  else
    echo "  ⚠️  README.md: ${DOMAIN} 域不在覆盖表中，请手动添加"
  fi
  # 更新合计
  TOTAL_LINE=$(grep -n '合计' "${README}" | head -1 | cut -d: -f1)
  if [ -n "${TOTAL_LINE}" ]; then
    TOTAL=$(grep "合计" "${README}" | grep -oP '\*\*\K\d+' | head -1)
    if [ -n "${TOTAL}" ]; then
      NEW_TOTAL=$((TOTAL + 1))
      sed -i "${TOTAL_LINE}s/\*\*${TOTAL}\*\*/\*\*${NEW_TOTAL}\*\*/" "${README}"
      echo "  ✅ README.md: 合计 ${TOTAL} → ${NEW_TOTAL}"
    fi
  fi
fi

echo ""
echo "=== 同步完成 ==="
echo ""
echo "⚠️  需要手动补充："
echo "  1. skills/${DOMAIN}/${TOOL_FILE}.md — 参数表、响应示例、使用场景、注意事项"
echo "  2. references/api/${DOMAIN}_api.md — 参数说明、响应示例（搜索 TODO 标记）"
echo "  3. 检查 SKILL.md 端点速查表条目是否正确"
echo "  4. 检查 README.md 工具数是否正确"
echo ""
echo "完成后两个仓库分别 git commit + push"
