# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取知识库目录

```http
GET /api/v2/repos/{book_id}/toc
```

等价于 `GET /api/v2/repos/{group_login}/{book_slug}/toc`。

**用途**：获取知识库完整目录树（返回扁平数组，通过 uuid 父子关系导航重建树结构）。

**对应工具**：`yuque_get_toc`

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `book_id` | path | string | 知识库 ID 或 namespace（必填） |
| `raw` | 工具 | boolean | `false`（默认）按裁剪字段返回，`true` 返回上游全部字段 |

### 返回结构（上游 HTTP 响应）

```json
{
  "data": [
    {
      "uuid": "string",
      "type": "DOC",
      "title": "string",
      "url": "string",
      "slug": "string",
      "id": 0,
      "doc_id": 0,
      "level": 0,
      "depth": 0,
      "open_window": 0,
      "visible": 0,
      "prev_uuid": "string",
      "sibling_uuid": "string",
      "child_uuid": "string",
      "parent_uuid": "string"
    }
  ]
}
```

### 返回字段 (V2TocItem)

| 字段 | 类型 | 说明 |
|------|------|------|
| `uuid` | string | 节点唯一 ID |
| `type` | string | DOC=文档 / LINK=外链 / TITLE=分组标题 |
| `title` | string | 节点名称 |
| `url` | string | 节点 URL |
| `slug` | string | Deprecated，同 url |
| `id` | int | Deprecated，同 doc_id |
| `doc_id` | int | 文档 ID（type=DOC 时） |
| `level` | int | 节点层级（0 起） |
| `depth` | int | Deprecated，同 level |
| `open_window` | int | 0=当前页打开 / 1=新窗口打开 |
| `visible` | int | 0=不可见 / 1=可见 |
| `prev_uuid` | string | 同级前一个节点 uuid |
| `sibling_uuid` | string | 同级后一个节点 uuid |
| `child_uuid` | string | 子级第一个节点 uuid |
| `parent_uuid` | string | 父级节点 uuid，null 为根节点 |

### 默认返回（`raw=false`）

工具默认只保留 9 个字段：`title`、`uuid`、`type`、`doc_id`、`level`、`visible`、`url`、`child_uuid`、`parent_uuid`，字段顺序同上表；`slug` / `id` / `depth` / `open_window` / `prev_uuid` / `sibling_uuid` 默认**不返回**。

工具只取上游响应里的 `data` 数组，两种模式输出的都是**裸数组**（不带 `{"data": ...}` 包装，也没有 `meta`）：

```json
[
  {
    "title": "string",
    "uuid": "string",
    "type": "DOC",
    "doc_id": 0,
    "level": 0,
    "visible": 0,
    "url": "string",
    "child_uuid": "string",
    "parent_uuid": "string"
  }
]
```

需要其余上游字段时传 `raw=true`（仍是裸数组，但每个节点含全部字段）。

## 更新知识库目录

```http
PUT /api/v2/repos/{book_id}/toc
Content-Type: application/json

{"action":"appendNode","action_mode":"child","type":"DOC","doc_ids":[123]}
```

等价于 `PUT /api/v2/repos/{group_login}/{book_slug}/toc`。

**用途**：创建/移动/编辑/删除目录节点（一个接口覆盖四种操作）。

**对应工具**：`yuque_update_toc`

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `book_id` | path | string | 知识库 ID 或 namespace（必填） |
| `action` | body | string | appendNode=尾插 / prependNode=头插 / editNode=编辑 / removeNode=删除（必填） |
| `action_mode` | body | string | sibling=同级 / child=子级（必填） |
| `target_uuid` | body | string | 目标节点 UUID，不填默认根节点 |
| `node_uuid` | body | string | 操作节点 UUID（移动/编辑/删除时需要，但工具层不校验，缺失会透传给上游） |
| `type` | body | string | 节点类型：DOC/LINK/TITLE（创建时必填） |
| `doc_ids` | body | number[] | 文档 ID 数组，如 `[123,456]`（创建文档时必填）；工具层不做类型转换，传字符串会原样发给上游 |
| `title` | body | string | 节点名称（创建分组/外链时必填） |
| `url` | body | string | 节点 URL（创建外链时必填） |
| `open_window` | body | int | 0=当前页 / 1=新窗口（外链选填） |
| `visible` | body | int | 0=隐藏 / 1=可见（默认 1） |
| `confirm` | 工具 | string | `removeNode` 必填，且必须精确等于 `DELETE`；其他 action 不看此参数 |

### 工具层校验

- 必填只有 `book_id` / `action` / `action_mode`；`action_mode` 还必须是 `sibling` 或 `child`。
- `action` **不做枚举校验**：拼错会原样发给上游，由上游报错。
- `node_uuid` **工具层不校验**：移动/编辑/删除时缺失也不会被拦下，会原样透传给上游。
- `doc_ids` **不做类型转换**：必须是 number 数组；传 `"[123]"` 这类字符串会原样发给上游。
- `removeNode` 未传或传错 `confirm` 时直接返回错误，不会发出请求。
- 返回上游原样 JSON（不裁剪字段），与 `yuque_get_toc` 默认裁剪的行为不同。

### 创建场景参数对应

| 节点类型 | 必填字段 |
|---------|---------|
| DOC（文档） | `type":"DOC"`, `doc_ids` |
| TITLE（分组） | `type":"TITLE"`, `title` |
| LINK（外链） | `type":"LINK"`, `title`, `url` |

### 其他场景

| 操作 | 必填字段 |
|------|---------|
| 移动 | `action=appendNode/prependNode`, `target_uuid`, `node_uuid` |
| 编辑 | `action=editNode`, `node_uuid` |
| 删除（sibling） | `action=removeNode`, `action_mode=sibling`, `node_uuid` |
| 删除（含子节点） | `action=removeNode`, `action_mode=child`, `node_uuid` |

### 返回结构

返回上游原样 JSON（`{"data": [...]}`，不裁剪字段、也不受 `raw` 控制），节点字段同 V2TocItem。

## 批量更新知识库目录

```http
PUT /api/v2/repos/{book_id}/toc
```

同一个接口，由工具按 `ops` 顺序串行执行多条操作；Agent 出变更计划，工具原样执行，不做额外决策。

**对应工具**：`yuque_batch_update_toc`

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `book_id` | path | string | 知识库 ID 或 namespace（必填） |
| `ops` | body | array \| string | 操作列表（必填、不能为空）；数组或 JSON 编码字符串均可 |
| `confirm` | 工具 | string | 必填，必须精确等于 `RESTRUCTURE`，否则整批拒绝 |

⚠️ `confirm` 对**整批**生效：即使全是 `createTitle` 这类非删除操作，也要传 `RESTRUCTURE`。

### ops 支持的 action

| action | 必填字段 | 可选字段 | 行为 |
|--------|---------|---------|------|
| `createTitle` | `title` | `target_uuid`、`target_title`、`book_id` | 建分组；同父目录下同名 TITLE 自动复用（`detail` 区分「创建目录」/「复用已有目录」），传了父目录时还会兜底纠正挂错位置 |
| `appendNode` | `doc_ids` | `target_uuid`、`target_title`、`action_mode`、`book_id` | 挂文档；有目标目录时先挂根、再逐条「移除+追加」到目标，最后回读校验 |
| `prependDoc` | `doc_ids` + 目标 | `target_uuid`、`target_title`、`book_id` | 首插；必须给目标（不能首插到根目录），带回读校验 |
| `moveNode` | `node_uuid` | `doc_id`、`target_uuid`、`target_title`、`action_mode`、`book_id` | 移动节点（用 `appendNode` + `node_uuid` 直移，保留原 uuid，默认 `action_mode=child`）；节点不在 TOC 里时必须给 `doc_id`，工具会先挂根再移 |
| `removeNode` | `node_uuid` | `action_mode`、`book_id` | 删除；`action_mode` 默认 `sibling`（只删该节点），`child` 连子节点一起删 |

- `target_title` 按 TITLE 名称定位目标父节点，可配 `target_parent_uuid` 精确指向嵌套同名分组。
- ⚠️ `appendNode` / `prependDoc` 的 `doc_ids` 在 op 里是 **JSON 字符串**（如 `"[123,456]"`），不是数组；传数组会报 `doc_ids 格式无效`。这与 `yuque_update_toc` 的 `doc_ids: number[]` 不一致，注意区分。
- 单个 op 抛错只记入该条结果，后续 op 继续执行。

### 返回结构

```json
{
  "book_id": "string",
  "total": 3,
  "success": 2,
  "failed": 1,
  "results": [
    { "index": 0, "action": "createTitle", "success": true, "detail": "创建目录: 归档", "new_node_uuid": "string" },
    { "index": 1, "action": "moveNode", "success": false, "error": "移动未生效（回读 TOC 校验失败）: ...", "observed_parent_uuid": "string|null" }
  ]
}
```

`index` 对应 `ops` 下标；`detail` / `error` / `new_node_uuid` / `observed_parent_uuid` 都是可选字段。

⚠️ 只要 `ops` 合法且 `confirm` 正确，工具**不会**因为某个 op 失败而整体返回 `isError`——必须逐条检查 `results[].success`，不能只看调用是否报错。

### 回读校验覆盖范围

| action | 是否回读校验 |
|--------|------------|
| `appendNode`（指定目标目录） | ✅ 按 `doc_id` 校验 `parent_uuid` |
| `prependDoc` | ✅ 按 `doc_id` 校验 `parent_uuid` |
| `moveNode` | ✅ 按 `node_uuid` 校验 `parent_uuid` |
| `appendNode`（挂根目录） | ❌ 只判 HTTP 错误 |
| `createTitle` | ⚠️ 传了父目录时兜底校验并纠正位置 |
| `removeNode` | ❌ 不校验 |

校验做法：写后失效缓存，回读 TOC 轮询 3 次（间隔 400ms、800ms），按 `parent_uuid` 判断是否真的落位；未落位返回 `success:false`，读不到 TOC 则提示结果无法确认。

## 文档创建与首插

**`yuque_create_doc` 会自动把新文档挂进 TOC**：`yuque_import_url` / `yuque_import_file` / `yuque_copy_doc` / `yuque_copy_repo` 同样自动挂载。内部统一走 `appendNode` + `action_mode=child`——传 `parent_uuid` 就挂到该节点下，不传则挂到根目录**末尾**。挂载失败不会回滚已创建的文档，只在返回内容里追加一条 warning，需要人工在网页端调整。

所以「新文档不在目录里」已不是常态；要做**首插**（插到目标目录最前面）才需要额外一步。

### 方式一：`yuque_batch_update_toc` 的 `prependDoc`（推荐）

一条 op 完成「挂根 → 摘出 → 首插」，且带内建回读校验：

```bash
mcporter call "yuque-mcp.yuque_batch_update_toc" \
  --args '{"book_id":"ns/ns","confirm":"RESTRUCTURE","ops":[{"action":"prependDoc","doc_ids":"[123]","target_uuid":"目标目录uuid"}]}'
```

`prependDoc` 必须给 `target_uuid` 或 `target_title`，**不支持首插到根目录**。

### 方式二：两次 `yuque_update_toc`

1. **appendNode** 把文档加入 TOC（不指定 `target_uuid` 默认根目录）——若文档已由 `yuque_create_doc` 自动挂载，这步可跳过，但要从返回或 `yuque_get_toc` 里先拿到它的 uuid
2. **prependNode** + `target_uuid` 提到首位（上游不支持 `prependNode` 带 `doc_ids` 创建，必须先有节点 uuid）

```bash
# 1. 加入 TOC（返回完整目录，从末尾找新文档的 uuid）
mcporter call "yuque-mcp.yuque_update_toc" \
  --args '{"book_id":"ns/ns","action":"appendNode","action_mode":"sibling","type":"DOC","doc_ids":[123]}'

# 2. 首插到第一个节点前面
mcporter call "yuque-mcp.yuque_update_toc" \
  --args '{"book_id":"ns/ns","action":"prependNode","action_mode":"sibling","node_uuid":"新uuid","target_uuid":"第一个节点的uuid"}'
```

### 注意事项

- ✅ `removeNode` 的 `action_mode` **原样透传**（2026-10-16 实测证实）：
  - `sibling` = 只删当前节点（子节点存活，`parent_uuid` 变为空、提升到根）
  - `child` = 连子节点一起删（HTTP 200）
  - ⚠️ 2026-10-10 曾据错误实测结论强制覆盖为 `sibling`，v2.15.5 已回退
- ⚠️ 每次 `removeNode` + `appendNode` 会生成**新的 node_uuid**，不能复用旧的 uuid
- ⚠️ `prependNode` 必须传 `target_uuid`（要插到哪个节点前面），否则上游报 `missing target_uuid`（工具层不拦）
- ⚠️ `editNode` 的 `prev_uuid`/`sibling_uuid` 修改不生效，排序只能用 `prependNode`
- ⚠️ `prependNode` 在创建时（传 `doc_ids`）不支持，必须先 `appendNode` 再 `prependNode`
- ⚠️ `yuque_update_toc` 的**所有 action 都不回读校验**（拿到 HTTP 200 就返回），要确认是否真的生效请用 `yuque_get_toc` 复核；需要内建校验就用 `yuque_batch_update_toc`

## ⚠️ 高频连续创建 → TOC 写路径静默积压（2026-10-07 实验证实）

> 来源：yuque-import-skill 全量导入实战（几百节点级导入踩出）。

**现象**：几百个节点不间断高频创建后，新建空 TITLE 目录下 appendNode 子节点**静默失败**——响应里 `parent_uuid` 正确（乐观回显），实际 GET 节点在根目录；或响应里根本找不到该节点。老目录（已有子）挂载始终正常。

**复现**：高频创建 50 节点后探针即失败；`GET /toc` 与 Web 端目录 API（`/api/catalog_nodes`）两套读出一致的「挂根/不存在」；Web 单节点/批量 move 也假成功（返回 success 实际不动）。

**已内建回读校验（不再依赖调用方手工纪律）**：`yuque_batch_update_toc` 的 `appendNode`（指定目标）/ `prependDoc` / `moveNode`，以及 Web 端的 `yuque_web_move_catalog_node` / `yuque_web_batch_move_catalog_nodes`，写完后都会失效缓存并回读 TOC 轮询 3 次（间隔 400ms、800ms），按 `parent_uuid` 确认节点真的落到目标下；未落位就返回 `success:false` 并附 `observed_parent_uuid`，**HTTP 200 不再等于成功**。

仍只判 HTTP 状态、不回读的写路径：`yuque_update_toc` 的全部 action、批量里的 `removeNode` 与挂根目录的 `appendNode`、`yuque_create_doc` 的自动挂载（失败只附 warning）。这些场景请自行用 `yuque_get_toc` 复核。

**工具不做写节流**：TOC 写路径没有任何 sleep，唯一的延时就是上面回读轮询的 400ms/800ms。大批量导入仍建议分批（每批几十节点），每批后检查 `results[].success`，不要指望工具层限速。

**已触发则静置 ~10 分钟自愈，再清理残留同名节点后重试**（实测恢复路径，未变）。

**区别**：这是静默级异常（HTTP 200 但实际挂根/没动），与显式限流（429/5xx）不是同一类问题；重试策略也不同：429 对所有方法都会重试（指数退避 1s → 2s → 4s，最多 3 次），而 5xx 和网络异常**只对 GET/HEAD/OPTIONS 重试**——`PUT`/`POST`/`DELETE` 遇到 5xx 不重试、遇到网络异常直接返回 `NETWORK_ERROR`（避免重放写请求）。所以「假成功」不能靠重试兜底，只能靠回读。

## TOC 缓存（工具内部）

目录类操作（建目录、按名称找目录、路径解析、回读校验）共享一份进程内 TOC 缓存，减少重复 GET：

- **默认 TTL 60 分钟**；在 `config/config.json` 里用 `toc_cache_ttl_minutes` 覆盖，**最小 1 分钟**（小于 1 按 1 算）。配置只在进程启动时读取，改完要重启。
- 过期项由每小时一次的定时清理回收。
- 每次写操作后都会显式失效对应知识库的缓存，所以写后回读拿到的是新数据，不会命中旧缓存。
- **`yuque_get_toc` 不走缓存**：每次都直接请求上游，始终是实时结果；缓存只服务于工具内部逻辑（批量 op、自动挂载、同名目录防重）。
- 缓存是进程内的 Map，重启即清空；多进程/多实例之间不共享。