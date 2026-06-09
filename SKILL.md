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