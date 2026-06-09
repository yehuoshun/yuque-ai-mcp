# yuque-ai-mcp

语雀全功能 MCP Server。当用户提到「语雀」「yuque」「知识库」「文档」「团队」等关键词时触发。

## 触发场景

- 语雀知识库管理（创建、删除、列表）
- 文档操作（读写、搜索、导入导出）
- 用户信息查询
- 回收站管理
- 目录 TOC 导航

## 工具速查

| 工具 | 域 | 说明 |
|------|-----|------|
| `yuque_get_user` | user | 获取当前 Token 的用户详情 |
| `yuque_hello` | user | 心跳检测，验证 Token 有效性 |
| `yuque_get_user_groups` | user | 获取用户所属的团队列表 |
| `yuque_search` | search | 通用搜索文档/知识库 |
| `yuque_get_group_users` | group | 获取团队成员列表 |
| `yuque_update_group_user` | group | 变更团队成员角色 |
| `yuque_delete_group_user` | group | 删除团队成员 |
| `yuque_list_docs` | doc | 获取知识库文档列表 |
| `yuque_create_doc` | doc | 创建文档 |
| `yuque_get_doc` | doc | 获取文档详情 |
| `yuque_update_doc` | doc | 更新文档 |
| `yuque_delete_doc` | doc | 删除文档 |
| `yuque_get_doc_versions` | doc | 获取文档历史版本 |
| `yuque_get_doc_version_detail` | doc | 获取文档历史版本详情 |
| `yuque_get_toc` | toc | 获取知识库目录 |
| `yuque_list_repos` | repo | 获取知识库列表 |
| `yuque_create_repo` | repo | 创建知识库 |
| `yuque_get_repo` | repo | 获取知识库详情 |
| `yuque_update_repo` | repo | 更新知识库 |

## 错误码

所有工具共用统一错误处理。API 失败时返回结构化错误信息（含状态码、中文描述、响应摘要）。

完整错误码及处理策略见 `references/api/errors.md`。