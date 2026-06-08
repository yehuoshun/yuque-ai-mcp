# 批量整理（reorganize）

把知识库 A 的文档批量复制到知识库 B，**源库不动**（只复制，不删除）。

> ⚠️ **关键区别**：
> - **整理**（本 skill）→ 复制到目标库，源库不动
> - **归档/迁移**（archive.md）→ 复制后删除源库文档

## 触发词

```
「整理到」「搬到」「复制到」「A库整理到B库」「分到」「归类到」
```

不触发：「归档」「迁移」「清理」「移走」→ 走 archive.md

## 工作流

### 阶段一：确认库

1. `yuque_list_repos` → 匹配源库 + 目标库
2. 匹配逻辑同 archive.md（id/slug/namespace/name）

### 阶段二：预览

```
📋 整理预览
源库：{源库name}（共 {total} 篇）→ 目标库：{目标库name}
模式：📋 复制（源库不动）
命中：{count} 篇
```

用户确认后执行。

### 阶段三：执行

```
MCP 工具：yuque_copy_docs_cross_book(
  source_book_id = 源库ID,
  target_book_id = 目标库ID,
  concurrency = 3
)
```

参数：
- `source_book_id`：源知识库 ID
- `target_book_id`：目标知识库 ID
- `doc_ids`：可选，指定文档列表；不传则复制全部
- `concurrency`：并行数，默认 3

如果源库有目录结构需要复制到目标库，分两步：
1. `yuque_get_toc_flat` 读取源库目录结构
2. `yuque_update_toc` 在目标库重建目录
3. `yuque_copy_docs_cross_book` 复制文档（按分类分组传 doc_ids）

### 阶段四：报告

```
✅ 整理完成
源库：{源库name} → 目标库：{目标库name}
模式：📋 复制（源库未动）
成功：{N} 篇 | 失败：{K} 篇
目标库：https://www.yuque.com/{namespace}
```

## 铁律

🚫 **整理操作不删除源库任何文档。** 如需要删除源库，使用 archive.md（归档/迁移）。

## 错误处理

| 场景 | 处理 |
|------|------|
| 源库不存在 | 「未找到源库」结束 |
| 源库为空 | 「源库没有文档」结束 |
| API 限流(429) | 内部重试，持续失败告用户 |
| 单篇写入失败 | 记录失败，继续下一篇 |
