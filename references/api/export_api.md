# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

### 单篇导出

```http
GET /api/v2/repos/{book_id}/docs/{doc_id}?raw=1
```

获取文档 Markdown 原文后保存为 `{标题}.md`。

```python
# 示例
body = api.get_doc_body(book_id, doc_id)
with open(f"{title}.md", "w", encoding="utf-8") as f:
    f.write(body)
```

### 批量导出

完整流程：

1. **获取目录树**：`GET /repos/{book_id}/toc`
2. **递归展开所有文档节点**：遍历 `children`，收集所有 `type=DOC` 的 `doc_id`
3. **并发下载**：`ThreadPoolExecutor(max_workers=3)` 并发调 `GET /repos/{book_id}/docs/{doc_id}?raw=1`
4. **根据 TOC 创建目录结构**：`os.makedirs()` 按层级创建文件夹
5. **下载文档中引用的图片**：正则提取 `![](...)`，下载到本地并替换路径
6. **交叉引用替换**：`[文档名](slug)` 内部链接替换为 `.md` 相对路径

### 增量导出

1. 记录上次导出时间戳 `last_export`
2. `list_all_docs(book_id)` 获取全部文档，筛选 `updated_at > last_export`
3. 仅导出变更文档，覆盖本地对应文件
4. 更新 `last_export` 时间戳

## 文件上传 API