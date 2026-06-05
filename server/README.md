# yuque-mcp-server

语雀 MCP Server — 通过 MCP 协议管理语雀知识库、文档、小记。

> ⚠️ **免责声明**：本项目非语雀官方产品。涉及文档创建/修改/删除操作，使用前请备份重要数据。作者不对任何数据丢失或账号限制承担责任。

## 安装

```bash
npm install -g yuque-mcp-server
# 或
npx yuque-mcp
```

## 配置

```json
{
  "mcpServers": {
    "yuque-mcp": {
      "command": "npx",
      "args": ["yuque-mcp"],
      "env": {
        "YUQUE_TOKEN": "<你的API Token>",
        "YUQUE_GROUP": "<用户名>",
        "YUQUE_INDEX_BOOKS": "[{\"book_id\":456,\"namespace\":\"group/index-lib\"}]",
        "YUQUE_GRAPH_BOOK": "{\"book_id\":789,\"namespace\":\"group/graph-lib\"}",
        "YUQUE_SEARCH_CONCURRENCY": "5",
        "YUQUE_COOKIE": "<Cookie>",
        "YUQUE_CTOKEN": "<CSRF Token>",
        "YUQUE_USER_ID": "<用户ID>"
      }
    }
  }
}
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `YUQUE_TOKEN` | ✅ | 语雀 API Token |
| `YUQUE_GROUP` | ✅ | 用户名/团队名 |
| `YUQUE_INDEX_BOOKS` | | 索引库列表（JSON 数组，对应 route_books 配置项） |
| `YUQUE_GRAPH_BOOK` | | 图谱库（JSON 对象） |
| `YUQUE_SEARCH_CONCURRENCY` | | 搜索/批量读取并发数（默认 5） |
| `YUQUE_COOKIE` | | 登录 Cookie（上传附件/回收站管理用） |
| `YUQUE_CTOKEN` | | CSRF Token |
| `YUQUE_USER_ID` | | 用户 ID |
| `YUQUE_CONFIG_PATH` | | 配置文件路径（覆盖环境变量） |

> 也可用配置文件：创建 `yuque-config.json`，通过 `YUQUE_CONFIG_PATH` 指定路径。

## Tools (49)

### 知识库
- `yuque_list_repos` · `yuque_get_repo` · `yuque_create_repo` · `yuque_update_repo` · `yuque_delete_repo`

### 知识库分组 ⚠️ 需 Cookie
- `yuque_list_repo_groups` · `yuque_create_book_stack` · `yuque_update_book_stack` · `yuque_sort_book_stacks` · `yuque_move_books`

### 文档
- `yuque_list_docs` · `yuque_get_doc` · `yuque_create_doc` · `yuque_update_doc` · `yuque_delete_doc`
- `yuque_list_doc_versions` · `yuque_get_doc_version`

### 目录
- `yuque_list_toc` · `yuque_update_toc` · `yuque_remove_toc_node`

### 小记
- `yuque_list_notes` · `yuque_get_note` · `yuque_create_note` · `yuque_update_note` · `yuque_delete_note` · `yuque_restore_note`

### 搜索 & 批量
- `yuque_search` · `yuque_batch_get_docs_body`

### 知识库搜索 & 索引构建
- `yuque_kb_search` · `yuque_index_create` · `yuque_index_update_entries`

### 导入 & 上传
- `yuque_import_doc` · `yuque_upload_attachment`

### 用户 & 健康
- `yuque_health_check` · `yuque_get_user` · `yuque_get_user_stats`

### 群组
- `yuque_list_group_users` · `yuque_update_group_user` · `yuque_remove_group_user`

### 统计
- `yuque_get_group_stats` · `yuque_get_member_stats` · `yuque_get_book_stats` · `yuque_get_doc_stats`

### 回收站 ⚠️ 需 Cookie
- `yuque_list_recycles` · `yuque_restore_recycle` · `yuque_destroy_recycle`

### 配置
- `yuque_reload_config` · `yuque_config_status` · `yuque_config_update`

## 许可证

MIT
