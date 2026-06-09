# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 团队汇总统计数据

```http
GET /api/v2/groups/{login}/statistics
```

**用途**：获取团队维度的汇总统计数据。

> ⚠️ Token 需要 `statistic:read` 权限。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `login` | path | string | 团队的 Login 或 ID（必填） |

### 返回结构

```json
{
  "data": {
    "bizdate": "string",
    "user_id": "string",
    "organization_id": "string",
    "member_count": "string",
    "collaborator_count": "string",
    "day_read_count": "string",
    "day_write_count": "string",
    "write_count": "string",
    "read_count": "string",
    "read_count_30": "string",
    "read_count_365": "string",
    "comment_count": "string",
    "comment_count_30": "string",
    "comment_count_365": "string",
    "like_count": "string",
    "like_count_30": "string",
    "like_count_365": "string",
    "follow_count": "string",
    "collect_count": "string",
    "doc_count": "string",
    "sheet_count": "string",
    "board_count": "string",
    "show_count": "string",
    "resource_count": "string",
    "artboard_count": "string",
    "attachment_count": "string",
    "book_count": "string",
    "public_book_count": "string",
    "private_book_count": "string",
    "book_book_count": "string",
    "book_resource_count": "string",
    "book_design_count": "string",
    "book_thread_count": "string",
    "data_usage": "string",
    "grains_count": "string",
    "grains_count_sum": "string",
    "grains_count_consume": "string",
    "interaction_people_count": "string",
    "content_count": "string",
    "collaboration_count": "string",
    "working_hours": "string",
    "baike": "string",
    "table_count": "string"
  }
}
```

### 返回字段 (V2GroupStatistics)

| 字段 | 类型 | 说明 |
|------|------|------|
| `bizdate` | string | 统计日期 (YYYYMMDD) |
| `organization_id` | string | 团队 ID |
| `member_count` | string | 成员数 |
| `collaborator_count` | string | 协作者数 |
| `day_read_count` | string | 当日阅读量 |
| `day_write_count` | string | 当日编辑次数 |
| `write_count` | string | 编辑次数 |
| `read_count` | string | 阅读量 |
| `read_count_30` | string | 阅读量（30天） |
| `read_count_365` | string | 阅读量（一年） |
| `comment_count` | string | 评论量 |
| `comment_count_30` | string | 评论量（30天） |
| `comment_count_365` | string | 评论量（一年） |
| `like_count` | string | 点赞量 |
| `like_count_30` | string | 点赞量（30天） |
| `like_count_365` | string | 点赞量（一年） |
| `follow_count` | string | 关注量 |
| `collect_count` | string | 收藏量 |
| `doc_count` | string | 文档数量 |
| `sheet_count` | string | 表格数量 |
| `board_count` | string | 画板数量 |
| `show_count` | string | 演示文稿数量 |
| `resource_count` | string | 资源数量 |
| `artboard_count` | string | 图集数量 |
| `attachment_count` | string | 附件数量 |
| `book_count` | string | 知识库总数 |
| `public_book_count` | string | 公开知识库数 |
| `private_book_count` | string | 私密知识库数 |
| `book_book_count` | string | 文档知识库数 |
| `book_resource_count` | string | 资源知识库数 |
| `book_design_count` | string | 图片知识库数 |
| `book_thread_count` | string | 话题知识库数 |
| `data_usage` | string | 流量使用量 |
| `grains_count` | string | 当前稻谷数 |
| `grains_count_sum` | string | 累计获得稻谷数 |
| `grains_count_consume` | string | 已消耗稻谷数 |
| `interaction_people_count` | string | 知识交流人数 |
| `content_count` | string | 知识财富数 |
| `collaboration_count` | string | 知识协同次数 |
| `working_hours` | string | 协同提效时长（小时） |
| `baike` | string | 百科全书卷数 |
| `table_count` | string | 数据表数量 |