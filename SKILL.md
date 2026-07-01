# yuque-ai-mcp

语雀全功能 MCP Server，63 个工具 / 15 个域。当用户提到「语雀」「yuque」「知识库」「文档」「团队」等关键词时触发。

## 触发场景

- 语雀知识库管理（创建、删除、列表、复制、导出）
- 文档操作（读写、搜索、导入导出、版本对比）
- 用户/团队信息查询
- 回收站管理
- 目录 TOC 导航
- 画板（思维导图/流程图）
- 统计数据
- 小记
- RSS 抓取
- 网页爬虫
- KV 存储

## API 端点索引

### user（3 工具）
| 工具 | 说明 |
|------|------|
| `yuque_hello` | 心跳检测，验证 Token 有效性 |
| `yuque_get_user` | 获取当前 Token 的用户详情 |
| `yuque_get_user_groups` | 获取用户所属的团队列表 |

### search（3 工具）
| 工具 | 说明 |
|------|------|
| `yuque_search` | 通用搜索文档/知识库 |
| `yuque_rag_search` | RAG 检索增强搜索 + 自动获取文档内容 |
| `yuque_web_search` | Cookie 态 Web 搜索，返回完整文档对象 + 精确总数 + 高亮摘要 |

### group（3 工具）
| 工具 | 说明 |
|------|------|
| `yuque_get_group_users` | 获取团队成员列表 |
| `yuque_update_group_user` | 变更团队成员角色 |
| `yuque_delete_group_user` | 删除团队成员 |

### doc（15 工具）
| 工具 | 说明 |
|------|------|
| `yuque_list_docs` | 获取知识库文档列表 |
| `yuque_create_doc` | 创建文档 |
| `yuque_get_doc` | 获取文档详情（支持 ID 或 slug） |
| `yuque_update_doc` | 更新文档 |
| `yuque_delete_doc` | 删除文档 |
| `yuque_batch_get_docs` | 批量获取文档详情（max 20） |
| `yuque_get_doc_versions` | 获取文档历史版本列表 |
| `yuque_get_doc_version_detail` | 获取文档历史版本详情 |
| `yuque_diff_doc_versions` | 对比两个版本的行级差异 |
| `yuque_copy_doc` | 单文档跨库复制 |
| `yuque_export_doc` | 导出单篇文档为 Markdown 文件（不含资源下载，需调 yuque_export_resources） |
| `yuque_export_resources` | 下载文档中的图片/附件到本地目录，返回 URL→本地路径映射 |
| `yuque_import_url` | 从网页 URL 导入文档 |
| `yuque_import_file` | 从本地文件导入文档（direct/upload_assets/embed_assets） |
| `yuque_embed_url` | 生成文档嵌入阅读器 URL |

### toc（3 工具）
| 工具 | 说明 |
|------|------|
| `yuque_get_toc` | 获取知识库目录 |
| `yuque_update_toc` | 更新知识库目录 |
| `yuque_batch_update_toc` | 批量更新目录（Agent 出计划，Tool 执行） |

### repo（8 工具）
| 工具 | 说明 |
|------|------|
| `yuque_list_repos` | 获取知识库列表（用户/团队） |
| `yuque_create_repo` | 创建知识库 |
| `yuque_get_repo` | 获取知识库详情 |
| `yuque_update_repo` | 更新知识库 |
| `yuque_delete_repo` | 删除知识库 |
| `yuque_batch_get_repos` | 批量获取知识库详情（max 20） |
| `yuque_copy_repo` | 批量跨库复制（LLM 分类 + 目录重建） |
| `yuque_export_repo` | 批量导出知识库为 Markdown（按 TOC 目录结构） |

### statistic（4 工具）
| 工具 | 说明 |
|------|------|
| `yuque_get_group_statistics` | 获取团队汇总统计数据 |
| `yuque_get_member_statistics` | 获取团队成员统计数据 |
| `yuque_get_book_statistics` | 获取团队知识库统计数据 |
| `yuque_get_doc_statistics` | 获取团队文档统计数据 |

### note（4 工具）
| 工具 | 说明 |
|------|------|
| `yuque_list_notes` | 获取小记列表 |
| `yuque_get_note` | 获取小记详情 |
| `yuque_create_note` | 创建小记 |
| `yuque_update_note` | 更新小记 |

### recycle（3 工具）
| 工具 | 说明 |
|------|------|
| `yuque_list_recycles` | 列出回收站项目 |
| `yuque_restore_recycle` | 恢复回收站项目 |
| `yuque_destroy_recycle` | 彻底删除回收站项目 |

### upload（1 工具）
| 工具 | 说明 |
|------|------|
| `yuque_upload_attachment` | 上传文件到语雀 CDN |

### board（3 工具）
| 工具 | 说明 |
|------|------|
| `yuque_get_board` | 获取文档中的画板资源 |
| `yuque_create_board` | 在文档中创建画板资源 |
| `yuque_update_board` | 更新文档中的画板资源 |

### rss（3 工具）
| 工具 | 说明 |
|------|------|
| `yuque_rss_list_sources` | 列出所有可用 RSS 数据源及 feed 类型 |
| `yuque_rss_fetch` | 抓取 RSS/Atom Feed，解析后去重写入语雀 |
| `yuque_rss_schedule` | 分析更新频率，生成推荐抓取时间并写入配置 |

### crawler（4 工具）
| 工具 | 说明 |
|------|------|
| `yuque_crawl_fetch` | 抓取网页原始 HTML |
| `yuque_crawl_extract` | CSS 选择器从 HTML 提取内容 |
| `yuque_crawl_save` | 去重 + 写入语雀（接收 Agent 清洗后的内容） |
| `yuque_crawl_schedule` | 分析爬虫抓取频率，生成推荐抓取时间 |

> **清洗规范**：Agent 负责 fetch → 提取正文 → HTML→Markdown → 传干净 body 给 `crawl_save`。详见 `references/api/crawler_api.md`。

### mine（2 工具）
| 工具 | 说明 |
|------|------|
| `yuque_get_book_stacks` | 获取知识库分组（书架）列表 |
| `yuque_get_editor_center` | 获取个人编辑中心全景数据 |

### kv（4 工具）
| 工具 | 说明 |
|------|------|
| `yuque_kv_get` | 读取 KV 命名空间的完整 JSON map（分片合并） |
| `yuque_kv_set` | 增量设置 key-value，超 250KB 自动分片 |
| `yuque_kv_delete` | 遍历分片查找并删除 key |
| `yuque_kv_list` | 列出已配置的 KV 命名空间 |

## 错误码

所有工具共用统一错误处理。API 失败时返回结构化错误信息（含状态码、中文描述、响应摘要）。

完整错误码及处理策略见 `references/api/errors.md`。

## 🎯 降级策略（长文档 Fallback）

**触发场景**：`yuque_get_doc` 读取超长文档（>1MB 或超时）时 MCP stdio 可能撑爆缓冲区。

**自动降级链路**：

```
yuque_get_doc ──(失败)──→ yuque_export_doc → 读本地文件 → 返回内容
```

执行方式：Agent 检测到 get_doc 失败 → 自动调用 `yuque_export_doc` + 本地 read 替代，不回退到直接 curl 语雀 API。

## 配置

```json
{
  "token": "语雀 API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "cookie": "可选，回收站/上传/mine 功能需要",
  "ctoken": "可选，从 Cookie 中提取",
  "kv": { "enabled": true },
  "rss": {
    "enabled": true,
    "namespaces": {
      "cnblogs": {
        "book_id": 0,
        "kv_slugs": [],
        "schedule_slugs": []
      }
    }
  },
  "crawler": {
    "enabled": true,
    "namespaces": {
      "my-source": {
        "book_id": 0,
        "kv_slugs": [],
        "schedule_slugs": []
      }
    }
  }
}
```