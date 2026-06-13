# yuque-ai-mcp

语雀全功能 MCP Server。当用户提到「语雀」「yuque」「知识库」「文档」「团队」等关键词时触发。

## 触发场景

- 语雀知识库管理（创建、删除、列表）
- 文档操作（读写、搜索、导入导出）
- 用户信息查询
- 回收站管理
- 目录 TOC 导航

## API 端点索引

| 端点 | 域 | 说明 |
|------|-----|------|
| `GET /api/v2/user` | user | 获取当前 Token 的用户详情 |
| `GET /api/v2/hello` | user | 心跳检测，验证 Token 有效性 |
| `GET /api/v2/users/:id/groups` | user | 获取用户所属的团队列表 |
| `GET /api/v2/search` | search | 通用搜索文档/知识库 |
| RAG 检索增强 | search | RAG 搜索 + 读文档（搜索结果自动获取文档内容） |
| `GET /api/v2/groups/:login/users` | group | 获取团队成员列表 |
| `PUT /api/v2/groups/:login/users/:id` | group | 变更团队成员角色 |
| `DELETE /api/v2/groups/:login/users/:id` | group | 删除团队成员 |
| `GET /api/v2/repos/:book_id/docs` | doc | 获取知识库文档列表 |
| `POST /api/v2/repos/:book_id/docs` | doc | 创建文档 |
| `GET /api/v2/repos/docs/:id` | doc | 获取文档详情 |
| `PUT /api/v2/repos/:book_id/docs/:id` | doc | 更新文档 |
| `DELETE /api/v2/repos/:book_id/docs/:id` | doc | 删除文档 |
| `GET /api/v2/doc_versions` | doc | 获取文档历史版本列表 |
| `GET /api/v2/doc_versions/:id` | doc | 获取文档历史版本详情 |
| `GET /api/v2/repos/:book_id/toc` | toc | 获取知识库目录 |
| `PUT /api/v2/repos/:book_id/toc` | toc | 更新知识库目录 |
| `GET /api/v2/users/:login/repos` | repo | 获取知识库列表（用户） |
| `POST /api/v2/users/:login/repos` | repo | 创建知识库（用户） |
| `GET /api/v2/repos/:book_id` | repo | 获取知识库详情 |
| `PUT /api/v2/repos/:book_id` | repo | 更新知识库 |
| `DELETE /api/v2/repos/:book_id` | repo | 删除知识库 |
| `GET /api/v2/groups/:login/statistics` | statistic | 获取团队汇总统计数据 |
| `GET /api/v2/groups/:login/statistics/members` | statistic | 获取团队成员统计数据 |
| `GET /api/v2/groups/:login/statistics/books` | statistic | 获取团队知识库统计数据 |
| `GET /api/v2/groups/:login/statistics/docs` | statistic | 获取团队文档统计数据 |
| `GET /api/v2/notes` | note | 获取小记列表 |
| `GET /api/v2/notes/:id` | note | 获取小记详情 |
| `POST /api/v2/notes` | note | 创建小记 |
| `PUT /api/v2/notes/:id` | note | 更新小记 |
| `GET /api/mine/recycles` | recycle | 列出回收站项目 |
| `PUT /api/mine/recycles/:id/restore` | recycle | 恢复回收站项目 |
| `DELETE /api/mine/recycles/:id` | recycle | 彻底删除回收站项目 |
| `POST /api/upload/attach` | upload | 上传文件到语雀 CDN |
| `无（纯工具函数）` | doc | 生成文档嵌入阅读器 URL |
| `GET /api/v2/yfm/boards` | board | 获取文档中的画板资源（思维导图/流程图/架构图） |
| `POST /api/v2/yfm/boards` | board | 在文档中创建画板资源（思维导图/流程图/架构图） |
| `PUT /api/v2/yfm/boards` | board | 更新文档中的画板资源（思维导图/流程图/架构图） |
| 批量 GET（并发） | doc | 批量获取文档详情（只读，max 20） |
| 批量 GET（并发） | repo | 批量获取知识库详情（只读，max 20） |
| 无（批量操作） | doc | 批量导出知识库文档为 Markdown（含图片下载/降级） |

## 错误码

所有工具共用统一错误处理。API 失败时返回结构化错误信息（含状态码、中文描述、响应摘要）。

完整错误码及处理策略见 `references/api/errors.md`。

## 配置

复制 `config/config.example.json` 为 `config/config.json` 并填入 Token：

```json
{
  "token": "语雀 API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "cookie": "可选，回收站功能需要",
  "ctoken": "可选，回收站功能需要"
}
```