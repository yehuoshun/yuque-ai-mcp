# 索引构建

> 将语雀源库文档构建为单层索引（索引库），支持关键词搜索。
> 详见 SKILL.md 二、知识库问答系统 了解架构和数据模型。

基于 `yuque_index_create` MCP 工具的关键词索引构建流程。

## 触发词

```
「建索引」「重建索引」「更新索引」「索引构建」
「给XX知识库建索引」「索引这个库」
```

---

## 0. 前置检查（强制执行）

> ⚠️ 每次索引构建前，必须先调 `yuque_config_status` 检查配置状态。
> 配置不完整或索引库满了 → 停下来修复 → 再继续构建。

```
0. yuque_config_status → 检查配置状态
   ├─ route_book_sub（索引库）未配置？
   │   → 通知用户：「索引库没配，是否需要我创建？」
   │   → 用户确认 → yuque_create_repo → yuque_config_update
   ├─ 索引库容量 ≥ 90%（⚠️ 警告线）？
   │   → 记录警告，继续构建（≤ 97% 不阻塞）
   │   → 同时提示用户：「索引库快满了，是否提前新建？」
   ├─ 索引库容量 ≥ 97%（🛑 阻塞线）？
   │   → 必须新建索引库后才能继续
   │   → 通知用户 → 创建 → yuque_config_update
   └─ 全部 OK → 进入步骤 1
```

---

## 1. 索引构建主流程（v4 — 文档中心）

> 以文档为中心：每篇源文档只读一次 body，LLM 一次性输出它属于哪些关键词 + 权重。
> 聚合后再按关键词维度写入索引文档。避免逐关键词重复读文档。

> ⚠️ **默认后台运行**：索引构建涉及大量 LLM 调用和 API 请求，**默认通过子代理（sub-agent）在后台执行**。
>
> **原子写入**（2026-06-05 重构）：
> - 子代理负责**全程**：评分 → 聚合 → 写入索引库
> - 每篇关键词索引文档独立写入索引库，互不干扰
> - 即使子代理超时，已完成的索引文档均已落盘，可从断点续

```
[新建域] 1. yuque_create_repo → 创建索引库（命名: index-{domain}）
[新建域] 2. yuque_update_repo → 写入 description（source_books）
[复用]   跳过 1-2，直接用已有索引库的 book_id
         3. yuque_list_docs → 列出源库全部文档（标题 + slug + id）

[子代理 — 全程构建]

⚠️ **子代理任务必须携带 §2 的 Prompt 模板原文**。
spawn 时 task 描述中必须内嵌「逐文档评分 Prompt」和「单关键词写入 Prompt」完整内容，
否则子代理会用默认行为合并语义不同的概念（如 Vue2+Vue3→Vue），导致细粒度失效。

4. 逐文档评分（核心步骤，每文档只读一次 body）：
   a. yuque_get_doc 读文档 body
      ├─ body 可读（Markdown/代码）→ LLM 从正文提取关键词 + 权重 + 章节树
      ├─ body 为空/Lake 乱码/附件 → 降级：只用标题提取关键词，w=5
      └─ 代码文档 → LLM 从 import/注解/类名/方法签名提取，信息密度高
   b. LLM 输出：该文档属于哪些关键词，每个得分多少，章节树（可选）
      → 见 §2 的「逐文档评分 Prompt」
   c. 章节树（tree）：文档 > 5000 字时，LLM 顺带输出章节树
      → 格式：{sections: [{id, title, summary}]}
      → 详见 skills/insight/knowledge.md 四、树搜索

5. 聚合：所有文档的输出汇总
   → **细粒度策略**：仅合并大小写/空格变体（如 "SpringBoot"="Spring Boot"="springboot"），
     不合并语义不同的概念（如 "Vue2"≠"Vue3"≠"前端"，"JWT"≠"JavaWeb"≠"MyBatis"）
   → **同义词别名不合并**：CSharp 和 C井 各自独立建索引文档（标题不同），
     但它们的 entries 内容相同（指向同一批源文档）
   → 宁多勿少：每篇文档输出的每个关键词都独立保留，不作语义合并
   → 按关键词维度分发：每个关键词收集所有 {doc_id, weight, title, slug}

5.5 关键词质量过滤（LLM 判断）：
   ⚠️ 候选关键词必须逐词过审：有人会搜这个词吗？
   
   丢弃（不是检索入口）：
   - 栏目名：如"加餐系列""附录""番外""扩展阅读"
   - 编号：如"第3课""03""part2"
   - 元信息标签：如"已发布""草稿""精选""必读"
   
   保留（是检索入口）：
   - 知识点：如"数学基础""手势解锁""Canvas绘图"
   - 技术名：如"SpriteJS""WebGL""SVG"
   - 概念：如"前端趋势""函数式编程""性能优化"
   
   过滤后得到最终写入清单。

6. 逐关键词写入（子代理串行，并发=1，**原子操作**）：
   a. LLM 汇总该关键词下所有 entries → 生成搜索面 + 摘要
      → 见 §2 的「单关键词写入 Prompt」
   b. yuque_index_create(keyword, keywords[], summary, entries, index_book_id)

7. 更新索引库 description 的 last_built

8. 索引质量检查（强制，纯计算，不用 LLM）：
   → 详见 skills/insight/knowledge.md 三、索引质量
   a. 共现图构建：从所有索引文档 entries 提取关键词共现关系
   b. 孤立关键词检测：degree = 0 的关键词
   c. 文档覆盖盲区：source_books 中未被任何关键词索引覆盖的文档
   d. Louvain 社区检测（可选）
   e. 构建邻接表（keyword → [neighbors]），按 200KB 分片
   f. 写入 graph_book：再逐片写 graph0 ~ graphN-1（标题正则 graph\d+，listAllDocs 自动发现）（通过 yuque_create_doc）
   g. 输出质量报告

> 💡 索引文档独立写入索引库，无需路由同步。
```

---

## 2. Prompt 模板

### 2a. 逐文档评分 Prompt

```
你是一个文档分类器。阅读以下文档，判断它的核心内容属于哪些技术关键词，每个关键词的拟合度 1-10 分。

⚠️ 语雀搜索 API 只匹配字母数字中文，不匹配符号和表情。
关键词用纯字母/数字/中文，如 SpringBoot/JVM/多数据源。

## 评分标准
- 核心主题：本文档就是讲这个的 → 8-10 分
- 大段涉及：文档有大量相关内容（≥30% 篇幅）→ 5-7 分
- 一笔带过：只有一两句提到 → 不输出
- 完全不相关 → 不输出

## 关键词数量
一篇文档通常归属 1-5 个关键词。不要强行凑——只输出真正相关的。
⚠️ **细粒度原则**：不同版本（Vue2≠Vue3）、不同工具（JWT≠Shiro）、不同技术方向（前端≠Vue）
应各自独立输出。宁可多输出关键词，不要合并语义不同的概念。

## 同义词/别名（核心要求）

⚠️ 语雀搜索对符号匹配极差，必须将每个含符号/多叫法的概念，
转写为所有可能的搜索友好形式，每个变体独立输出一个 keyword。

**原则：穷举所有可能的搜索入口。** 用户可能用任何叫法搜，
你不知道他会打中文还是英文、缩写还是全称、符号还是文字。
宁可多建 10 个索引文档，不能漏掉 1 个搜索入口。

### 缩写 ↔ 全称
- JS → JavaScript, ECMAScript, ES6
- TS → TypeScript
- K8s → Kubernetes, K8S
- DB → 数据库, Database
- API → 应用程序接口
- SDK → 软件开发工具包
- IDE → 集成开发环境
- CLI → 命令行, 命令行工具
- GUI → 图形界面, 图形用户界面
- ORM → 对象关系映射
- JWT → JSON Web Token
- CSRF → 跨站请求伪造
- XSS → 跨站脚本攻击
- SQL → 结构化查询语言
- NoSQL → 非关系型数据库
- OSS → 对象存储
- CDN → 内容分发网络
- DNS → 域名解析, 域名系统
- HTTP → 超文本传输协议
- HTTPS → HTTP安全
- SSL → TLS, 安全套接层
- TCP → 传输控制协议
- UDP → 用户数据报协议
- REST → RESTful, RESTfulAPI
- GraphQL → GQL
- JSON → JS对象表示法
- XML → 可扩展标记语言
- YAML → YML
- HTML → 超文本标记语言
- CSS → 层叠样式表, 样式表
- DOM → 文档对象模型
- BOM → 浏览器对象模型
- SPA → 单页应用, 单页面应用
- SSR → 服务端渲染, 服务器端渲染
- CSR → 客户端渲染
- SEO → 搜索引擎优化
- CI → 持续集成, CD, 持续部署, CICD, DevOps
- MVC → 模型视图控制器
- MVVM → 模型视图视图模型
- MVP → 模型视图表示器
- IOC → 控制反转, 依赖注入, DI
- AOP → 面向切面编程
- OOP → 面向对象, 面向对象编程
- FP → 函数式编程, 函数式
- FRP → 函数响应式编程
- JVM → Java虚拟机
- JDK → Java开发工具包
- JRE → Java运行环境
- GC → 垃圾回收, 垃圾收集, 内存回收
- CPU → 中央处理器, 处理器
- GPU → 图形处理器, 显卡
- RAM → 内存, 随机存取存储器
- ROM → 只读存储器
- HDD → 机械硬盘, 硬盘
- SSD → 固态硬盘
- OS → 操作系统, 系统
- VM → 虚拟机
- VPS → 云服务器, 虚拟专用服务器

### 符号 → 文字
- = → 等于, 等于号, 赋值
- == → 等于, 双等于, 相等比较
- === → 全等, 严格等于
- != → 不等于
- !== → 不全等
- >= → 大于等于
- <= → 小于等于
- => → 箭头函数, Lambda, 箭头
- -> → 箭头, 指针, 成员访问
- :: → 双冒号, 作用域, 静态方法
- && → 逻辑与, AND, 短路与
- || → 逻辑或, OR, 短路或
- ! → 非, NOT, 取反
- ~ → 按位取反, 波浪号
- ^ → 异或, XOR, 按位异或
- % → 取模, 取余, 模运算
- * → 乘号, 指针, 解引用, 通配符, 星号
- & → 引用, 取地址, 按位与, AND
- | → 管道, 按位或, OR
- @ → 注解, 装饰器, 修饰符
- # → 井号, 锚点, 预处理
- $ → 变量, 美元符, jQuery
- <> → 泛型, 尖括号, 模板
- [] → 数组, 中括号, 索引器, 下标
- {} → 花括号, 对象, 代码块, 作用域
- () → 括号, 函数调用, 参数列表
- ? → 可选, 条件, 三元, 可空
- . → 点, 成员访问, 方法调用
- ; → 分号, 语句结束
- , → 逗号, 分隔符
- : → 冒号, 键值对
- ' → 单引号, 字符串
- " → 双引号, 字符串
- / → 斜杠, 除号, 路径, 正则
- \ → 反斜杠, 转义, 路径

### 中英文互译
- 算法 → Algorithm, 数据结构, DataStructure
- 设计模式 → DesignPattern, 设计模式
- 微服务 → MicroService, 微服务架构
- 分布式 → Distributed, 分布式系统
- 高并发 → HighConcurrency, 并发编程
- 高可用 → HighAvailability, HA
- 负载均衡 → LoadBalance, LoadBalancing
- 缓存 → Cache, 缓存策略, 缓存穿透
- 消息队列 → MessageQueue, MQ, 消息中间件
- 容器 → Container, Docker
- 虚拟化 → Virtualization, 虚拟化技术
- 网关 → Gateway, API网关
- 熔断 → CircuitBreaker, 断路器
- 限流 → RateLimit, 流量控制
- 降级 → Degradation, 服务降级
- 事务 → Transaction, 事务管理
- 锁 → Lock, 分布式锁, 并发控制
- 线程 → Thread, 多线程, 线程池
- 进程 → Process, 多进程
- 协程 → Coroutine, 异步
- 遍历 → Traversal, 迭代, Iteration
- 递归 → Recursion, 递归调用
- 回溯 → Backtracking, 回溯算法
- 贪心 → Greedy, 贪心算法
- 动态规划 → DP, DynamicProgramming
- 排序 → Sort, 排序算法
- 搜索 → Search, 查找, 检索
- 索引 → Index, 索引优化
- 分库分表 → Sharding, 分片, 数据分片
- 读写分离 → ReadWriteSplitting, 主从复制
- 主从 → MasterSlave, 主备
- 哨兵 → Sentinel, 哨兵模式
- 集群 → Cluster, 集群部署
- 分布式ID → Snowflake, 雪花算法, UUID
- 认证 → Authentication, Auth, 鉴权
- 授权 → Authorization, 权限控制, RBAC
- 加密 → Encryption, 加解密, 密码学
- 签名 → Signature, 数字签名
- 序列化 → Serialization, 反序列化, Deserialization
- 反射 → Reflection, 反射机制
- 代理 → Proxy, 动态代理, 反向代理
- 注解 → Annotation, 注解处理器
- 泛型 → Generics, 类型参数
- 回调 → Callback, 回调函数
- 闭包 → Closure, 闭包函数
- 柯里化 → Currying, 函数柯里化
- 节流 → Throttle, 防抖, Debounce
- 深拷贝 → DeepClone, 深克隆, 浅拷贝, ShallowCopy

### 技术名去符号
- C# → CSharp, C井, CSharp语言
- C++ → CPlusPlus, cpp, CPP, Cpp
- .NET → dotNET, dotnet, NetFramework, NetCore, ASPNET
- F# → FSharp
- Objective-C → ObjC, OC, ObjectiveC
- Node.js → NodeJS, Node, Nodejs
- Vue.js → VueJS, Vue, Vue3, Vue2
- React.js → ReactJS, React
- Angular.js → AngularJS, Angular
- Express.js → ExpressJS, Express
- Next.js → NextJS, Next
- Nuxt.js → NuxtJS, Nuxt
- jQuery → jquery, JQ
- Spring Boot → SpringBoot, Spring
- Spring Cloud → SpringCloud, 微服务框架
- MyBatis → Mybatis, iBatis
- Hibernate → 持久化框架
- PostgreSQL → Postgres, PG, PGSQL
- MySQL → mysql, MariaDB
- MongoDB → mongo, Mongo
- Redis → redis
- Elasticsearch → ES, ElasticSearch, 搜索引擎
- Logstash → 日志收集
- Kibana → 可视化
- RabbitMQ → Rabbit, 消息队列
- Kafka → 消息队列, 流处理
- Nginx → nginx, 反向代理, Web服务器
- Apache → httpd, Web服务器
- Tomcat → tomcat, Servlet容器
- Jetty → Servlet容器
- Docker → docker, 容器化
- Kubernetes → K8s, K8S, k8s, 容器编排
- Jenkins → 持续集成, 自动化构建
- GitLab → gitlab, CI, 代码托管
- GitHub → github, 代码托管
- VS Code → VSCode, VisualStudioCode, 编辑器
- Webpack → webpack, 打包工具, 构建工具
- Vite → vite, 构建工具
- Babel → babel, 转译器
- ESLint → eslint, 代码检查
- Prettier → prettier, 代码格式化
- TypeScript → TS, TypeScript, 类型系统
- WebAssembly → WASM, wasm, WebAssembly
- GraphQL → GQL, GraphQL
- gRPC → grpc, RPC, 远程调用
- Protobuf → ProtocolBuffers, 序列化
- NumPy → numpy, 科学计算
- Pandas → pandas, 数据分析
- TensorFlow → TF, tensorflow, 深度学习
- PyTorch → pytorch, 深度学习
- Scikitlearn → sklearn, 机器学习
- OpenCV → opencv, 计算机视觉
- Linux → linux, Unix, 操作系统
- Unix → UNIX, Linux, 操作系统
- Windows → windows, Win, 操作系统
- macOS → MacOS, mac, Apple
- Android → android, 安卓
- iOS → ios, iPhone, Apple
- Git → git, 版本控制, 版本管理
- SVN → svn, 版本控制
- Maven → maven, 构建工具, 依赖管理
- Gradle → gradle, 构建工具
- npm → NPM, 包管理, Node包管理
- yarn → Yarn, 包管理
- pnpm → PNPM, 包管理
- pip → pip, Python包管理
- WebSocket → WS, WebSocket, 长连接
- SSE → ServerSentEvents, 服务端推送
- HTTP2 → HTTP2, HTTP3
- OAuth2 → OAuth, OAuth2.0, 第三方登录
- JWT → JsonWebToken, Token, 令牌
- WebRTC → 实时通信, 音视频
- Sass → SCSS, CSS预处理器
- Less → LESS, CSS预处理器
- Tailwind → TailwindCSS, CSS框架
- Bootstrap → 前端框架, CSS框架
- jQuery → JQ, DOM操作
- Three.js → ThreeJS, 3D, WebGL
- ECharts → echarts, 图表, 可视化
- D3.js → D3, 数据可视化
- Lodash → lodash, 工具库, 函数式
- Moment.js → Moment, 日期处理
- Day.js → Dayjs, 日期处理
- Axios → axios, HTTP客户端, 请求库
- Fetch → fetch, 请求API
- Redux → redux, 状态管理
- MobX → mobx, 状态管理
- Vuex → vuex, 状态管理
- Pinia → pinia, 状态管理
- Zustand → zustand, 状态管理
- React Router → 路由, 前端路由
- Vue Router → 路由, 前端路由
- Storybook → 组件文档, UI开发
- Cypress → 端到端测试, E2E
- Playwright → 端到端测试, E2E
- Jest → jest, 单元测试, 测试框架
- Mocha → mocha, 测试框架
- Vitest → vitest, 单元测试
- Puppeteer → 爬虫, 浏览器自动化
- Selenium → 自动化测试, WebDriver
- JMeter → 压力测试, 性能测试
- Prometheus → 监控, 指标采集
- Grafana → 可视化, 监控面板
- ELK → 日志, 日志分析
- Zabbix → 监控, 告警
- Ansible → 自动化运维, 配置管理
- Terraform → 基础设施即代码, IaC
- KVM → 虚拟化, 内核虚拟机
- OpenStack → 私有云, 云计算
- Hadoop → 大数据, HDFS
- Spark → 大数据, 流计算
- Flink → 流计算, 实时计算
- Hive → 数据仓库, SQL
- HBase → 列式存储, NoSQL
- Zookeeper → 分布式协调, 注册中心
- Nacos → 注册中心, 配置中心
- Eureka → 注册中心, 服务发现
- Consul → 注册中心, 服务发现
- Apollo → 配置中心
- Sentinel → 流量控制, 熔断降级
- Dubbo → RPC, 服务框架
- Spring Cloud Alibaba → 微服务, 服务治理
- gRPC → 远程调用
- Thrift → RPC, 跨语言调用
- ZeroMQ → 消息队列
- ActiveMQ → 消息队列
- RocketMQ → 消息队列, 阿里
- Pulsar → 消息队列, 流存储
- Etcd → 分布式KV, 配置存储
- TiDB → 分布式数据库, NewSQL
- OceanBase → 分布式数据库, 阿里
- GaussDB → 分布式数据库, 华为
- ClickHouse → 列式数据库, OLAP, 分析
- InfluxDB → 时序数据库, 监控
- Prometheus → 时序数据库, 监控
- Neo4j → 图数据库, 知识图谱
- SQLite → 嵌入式数据库, 轻量数据库
- MinIO → 对象存储, S3兼容
- Ceph → 分布式存储
- FastDFS → 分布式文件系统
- git → 版本控制
- vim → VI, 编辑器, 文本编辑器
- Emacs → 编辑器, 文本编辑器
- Shell → Bash, Zsh, 命令行, 脚本
- PowerShell → 命令行, 脚本, Windows
- Regex → 正则表达式, 正则, RegExp, 模式匹配
- Markdown → MD, 标记语言, 文档
- LaTeX → 排版, 论文, 数学公式
- UML → 统一建模语言, 类图, 时序图
- SVG → 矢量图, 可缩放矢量图形
- Canvas → 画布, 绘图, Canvas2D
- WebGL → 3D渲染, 浏览器3D
- WebRTC → 实时通信, 音视频通话
- PWA → 渐进式Web应用, 离线应用
- ServiceWorker → 离线缓存, 后台同步
- IndexedDB → 浏览器数据库, 本地存储
- LocalStorage → 本地存储, 浏览器存储
- Cookie → 浏览器存储, 会话
- Session → 会话, 会话管理
- JWT → Token, 无状态认证
- CORS → 跨域, 跨域请求
- CSP → 内容安全策略, 安全
- HSTS → HTTPS强制, 安全
- XSS → 跨站脚本, 安全
- CSRF → 跨站请求伪造, 安全
- SQL注入 → SQLInjection, 注入攻击
- DDOS → 拒绝服务攻击, 安全
- MITM → 中间人攻击, 安全
- OWASP → Web安全, 安全标准
- RBAC → 基于角色的访问控制, 权限
- ABAC → 基于属性的访问控制, 权限
- ACL → 访问控制列表, 权限
- OAuth → 第三方登录, 授权
- OpenID → 单点登录, SSO, 身份认证
- SAML → 单点登录, 身份认证
- LDAP → 目录服务, 身份认证
- Kerberos → 身份认证, 安全
- HTTPS → TLS, SSL, 加密传输
- AES → 对称加密, 加密算法
- RSA → 非对称加密, 加密算法
- SHA → 哈希, 散列, 摘要
- MD5 → 哈希, 散列, 摘要
- Base64 → 编码, 解码
- URL编码 → encodeURI, 百分号编码
- JWT → 令牌, 无状态, 认证

⚠️ 以上是参考示例，不是穷举。实际使用时结合文档内容自行判断有哪些同义词。
⚠️ 核心原则：**用户可能用任何叫法搜索，你要覆盖所有合理的搜索入口。**
⚠️ 每个别名都是独立 keyword，不是 keywords 数组里的子项。weight 相同。

## 输出格式
输出：[{keyword, weight}, ...]，每个 keyword 对应一篇源文档。
含同义词时，每个变体独立输出，weight 相同。如果文档字数 > 5000，额外输出 tree：

[
  {"keyword": "CSharp", "weight": 10},
  {"keyword": "C井", "weight": 10},
  {"keyword": "dotNET", "weight": 9},
  {"keyword": "CLR", "weight": 8}
]

如果文档 > 5000 字，若文档 > 5000 字，在输出中追加 tree 字段：
,"tree": {
  "sections": [
    {"id": "s1", "title": "SpringBoot 自动配置原理", "summary": "@EnableAutoConfiguration 工作机制"},
    {"id": "s2", "title": "自定义 Starter", "summary": "手写一个 Spring Boot Starter"},
    {"id": "s3", "title": "配置加载优先级", "summary": "application.yml 与 bootstrap.yml 加载顺序"}
  ]
}

⚠️ weight 为 1-10 整数，必填。每篇文档至少输出 1 个关键词。
⚠️ tree 只在文档 > 5000 字时输出，sections 数量 ≤ 8，每个 summary ≤ 50 字。
```

### 2b. 单关键词写入 Prompt

```
你是一个搜索索引构建器。当前关键词是「{keyword}」，以下文档都属于该关键词：

{entries_summary}

⚠️ 语雀搜索 API 只匹配字母数字中文，空格拆分 token 做 AND 匹配，不匹配符号和表情。

## 输出格式
输出格式：[{title, keywords, search_surface, summary, doc_id, ...}]

[
  {
    "title": "02丨如何用Canvas绘制层次关系图？",
    "keywords": ["Canvas", "指令式绘图", "Canvas2D"],
    "search_surface": "Canvas怎么绘图\nCanvas指令式绘图教程\n用Canvas画层次关系图",
    "summary": "本文介绍Canvas指令式绘图基础，通过绘制层次关系图实战演示Canvas核心API。",
    "doc_id": 584,
    "namespace": "yehuoshun/dil9w3",
    "doc_title": "02丨如何用Canvas绘制层次关系图？.html",
    "slug": "kf8s0xue0pfzvl09",
    "url": "https://www.yuque.com/yehuoshun/dil9w3/kf8s0xue0pfzvl09",
    "weight": 9
  }
]

字段说明：
- title：entry 文档标题
- keywords：该文档的技术术语 keywords 数组。⚠️ 必须包含该关键词的所有常见别名（如 CSharp 文档的 keywords 应含 C#、C井；JavaScript 的应含 JS），这样不同叫法搜到同一篇索引文档时都能命中
- search_surface：自然语言问句/口语/场景描述，一行一个，换行分隔。⚠️ 搜索面中也要用不同叫法写出问句（如 "C#怎么学"、"CSharp入门"、"C井语言教程"），覆盖不同用户的搜索习惯
```

---

## 3. 增量更新

> 使用 `yuque_index_update_entries` 工具完成读-改-写的原子操作。
> 工具内部自动完成：读现有索引文档 → 合并 entries → 200KB 检查 → PUT 写回。
> entries 清空时自动删除索引文档。

### 完整流程

```
1. 读索引库 description → 拿 source_books + last_built
2. 对每个 source_book：yuque_list_docs → 筛 updated_at > last_built
3. 对每个变更文档：

   [新增]
     LLM 读正文 → 判断属于哪些已有关键词
     → yuque_index_update_entries(add=[{doc_id, ...}]) 追加到已有索引文档
     → 无匹配关键词 → yuque_index_create 创建新关键词索引文档

   [更新]
     yuque_index_update_entries(update=[{doc_id, weight, summary, ...}])
     → 工具自动按 doc_id 匹配，只更新提供的字段
     → LLM 重评后关键词变了 → 新增关键词用 add，移除用 remove

   [删除]
     yuque_index_update_entries(remove=[doc_id])
     → entries 清空后自动删除索引文档

4. 更新 description 的 last_built
```

### 工具参数

| 参数 | 说明 |
|------|------|
| `keyword` | 关键词（索引文档标题） |
| `index_book_id` | 索引库 book_id |
| `add` | 新增 entries 数组（按 doc_id 去重，已存在则跳过） |
| `remove` | 移除的 doc_id 数组 |
| `update` | 更新的 entries 数组（按 doc_id 匹配，只更新提供的字段） |

---

## 4. 构建后验证（强制）

> ⚠️ **语雀搜索索引延迟**：新建/更新文档后，语雀内部搜索索引需要约 10 分钟才能生效。
> 索引构建完成后等待 10 分钟再验证搜索，或直接降级用 `yuque_search` 全库搜索验证。

```
对每个新关键词索引，用 2-3 个预期查询搜索验证可搜索性：
1. 一个含空格术语查询（如 "Spring Boot"）→ 验证 keywords 覆盖
2. 一个同义/俗称查询（如 "k8s"）→ 验证 keywords 覆盖
3. 一个口语模糊查询（如 "咋配多数据源"）→ 验证问法覆盖

0 命中的 → 不通过 → 立即修复 keywords。
```

---

## 5. 容量检查

> 语雀知识库文档上限约 5000 篇，远大于索引构建规模。
>
> **分层容量策略**：
> | 占比 | 级别 | 行为 |
> |------|------|------|
> | < 90% | ✅ ok | 正常写入 |
> | 90% ~ 97% | ⚠️ warn | 继续写入 + 返回 `capacity_warning` |
> | ≥ 97% | 🛑 block | 拒绝写入 + 返回 actionable hint |
>
> **block 时的 Agent 自救流程**：
> 1. 看到 `error: "capacity_blocked"` → 从返回拿 `current_book` 信息
> 2. 通知用户：「索引库已满，帮你建个新的？」
> 3. 用户确认 → `yuque_create_repo("index-{domain}-2")`
> 4. `yuque_config_update(route_book_sub_add=[{book_id, namespace}])`
> 5. 用新 `index_book_id` 重试
>
> `yuque_config_status` 工具可直接查看所有索引库的容量使用率，构建前必调。

---

## 6. 索引文档格式

标题：`{关键词}`（如 `SpringBoot`）——直接用关键词作标题，不加前缀

> ⚠️ 语雀搜索对符号匹配极差，标题不用 `[]` 等符号包裹。

正文（Markdown 块格式，代码层将 entries 转换为 Markdown 写入）：

```markdown
# SpringBoot自动配置原理

## 关键词
SpringBoot
自动配置
AutoConfiguration

## 搜索面
SpringBoot自动配置怎么工作的
@EnableAutoConfiguration注解原理
spring.factories文件配置

## 摘要
源码级分析@EnableAutoConfiguration和spring.factories机制

## doc_id
232072822
## 链接
https://www.yuque.com/yehuoshun/huwsx0/kf8s0xue
## 权重
9
```

代码层逻辑：
1. LLM 通过 tool 传入 `entries: DocEntry[]`（keywords 数组）
2. `createIndexDoc` 将 entries 序列化为上方 Markdown 格式
3. `parseIndexDoc` 按 `\n(?=# )` 切分各块，解析回 structured entries
4. 搜索时分块自然语言参与语雀全文索引
3. 口语问法："xxx怎么用""xxx是什么""xxx不生效"等自然问句
4. 区分易混淆术语：如 Autowired 和 AutoConfiguration 是不同的概念
5. 搜索视角自检：用户不知道有这个文档，会用什么词搜？
6. 输出为 keywords 字符串数组，代码层 `cleanToken` 每元素去空格去符号

---

## 7. 参数说明

### yuque_index_create

| 参数 | 必填 | 说明 |
|------|------|------|
| `keyword` | ✅ | 索引关键词（直接用作文档标题，不含前缀符号） |
| `entries` | ✅ | 源文档指针数组 `[{doc_id, namespace, doc_title, slug, url, weight, title?, keywords?, search_surface?, summary?, tree?}]` |
| `index_book_id` | ✅ | 索引库 book_id |

### entries 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `doc_id` | ✅ | 源文档 ID |
| `namespace` | ✅ | 源知识库 namespace |
| `doc_title` | ✅ | 源文档标题 |
| `slug` | ✅ | 源文档 slug |
| `url` | ✅ | 源文档完整链接（写入时自动从 namespace+slug 拼接兜底） |
| `weight` | ✅ | 权重 1-10，LLM 判断该文档与关键词的拟合度 |
| `title` | ❌ | entry 文档标题 |
| `keywords` | ❌ | entry 关键词数组 |
| `search_surface` | ❌ | entry 搜索面（一行一个问法，换行分隔） |
| `summary` | ❌ | entry 摘要 |
| `tree` | ❌ | 章节树 `{sections: [{id, title, summary}]}` |

> ⚠️ **代码层清洗**：`createIndexDoc` 写入前 `cleanToken` 清洗 keywords 每元素 → `序列化` 存入。LLM 输出 `keywords: string[]`，代码层兜底。