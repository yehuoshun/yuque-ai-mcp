# KV 键值存储 API 参考

> 语雀 KV 存储方案：单文档 JSON map，依赖语雀知识库作为存储后端。

## 存储模型

```
KV 知识库 (repo)
├── 文档 cnblogs (slug=cnblogs, body={"cnblogs-123": "https://...", ...})
├── 文档 weibo   (slug=weibo,   body={"weibo-456": "https://...", ...})
└── 文档 crawler (slug=crawler, body={"abc123": "https://...", ...})
```

- 一个 namespace = 一篇语雀文档
- 文档 slug = namespace
- 文档 body = JSON 字符串 `{"key": "value", ...}`
- 格式：markdown（纯文本 JSON，不渲染）

## 使用场景

1. **RSS 去重**：`namespace = source`（如 `cnblogs`），`key = slug`（如 `cnblogs-123456`），`value = url`
2. **爬虫去重**：`namespace = source` 或 `crawler`，`key = md5(url) 前 12 位`，`value = url`
3. **通用配置**：任意 key-value 存储

## 配置

```json
{
  "kv": {
    "enabled": true,
    "default_repo": { "id": 0 }
  }
}
```

## API 调用次数

| 操作 | API 调用次数 | 说明 |
|------|-------------|------|
| get | 1 次 GET | 读文档获取 JSON map |
| set（创建） | 1 次 GET + 1 次 POST | 读 map → 创建新文档 |
| set（更新） | 1 次 GET + 1 次 PUT | 读 map → 更新已有文档 |
| delete | 1 次 GET + 1 次 PUT | 读 map → 更新 |
| list | 1 次 GET | 列出所有文档 |

## 与旧方案对比

| 对比项 | 旧方案（每 key 一篇文档） | 新方案（单文档 JSON map） |
|--------|--------------------------|--------------------------|
| RSS 10 篇去重 | 10 次 GET + 10 次 POST | 1 次 GET + 1 次 PUT |
| KV 知识库内容 | 几百篇标记文档 | 几个 namespace 文档 |
| 批量操作 | 不支持 | 天然支持（一次读全量） |
| 扩展性 | 随条目线性增长 | 随 namespace 增长（极慢） |