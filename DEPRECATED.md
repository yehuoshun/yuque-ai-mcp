# DEPRECATED — 已停止维护

**日期**: 2026-06-06

## 废弃原因

关键词索引架构过于复杂：

- 总库路由层 + 子库索引层 + entries + weight + 搜索面 + 增量 diff
- 语雀搜索 API 不稳定（AND 查询命中率低）
- 关键词覆盖不全，新知识库接入要跑完整索引构建流程
- 维护成本远超收益

## 废弃范围

| 功能 | 状态 |
|------|------|
| 索引构建 (`yuque_index_*`) | ❌ 废弃 |
| 知识库搜索 (`yuque_kb_search`) | ❌ 废弃 |
| 图谱 (`yuque_graph_*`) | ❌ 废弃 |
| 增量更新 (`yuque_diff_index`) | ❌ 废弃 |
| 基础 CRUD (list_repos, list_toc, get_doc, create_doc 等) | ✅ 仍可用 |

## 替代方案

TOC 树导航（无向量 RAG）：

```
yuque_list_repos → LLM 选知识库
       ↓
yuque_list_toc  → LLM 导航选文档
       ↓
yuque_get_doc   → LLM 生成答案
```

零预处理、零索引维护、零向量库。标题质量好的知识库即开即用。
