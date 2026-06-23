---
title: "第25篇 RabbitMQ在.net core中的应用"
slug: xhvrysg4o6xzl4vc
created: 2026-06-20T05:42:09.000Z
updated: 2026-06-20T05:42:09.000Z
word_count: 3352
---
第25篇 RabbitMQ在.net core中的应用 - 似梦亦非梦 - 博客园           

  

*    [![](../images/logo.svg)](https://www.cnblogs.com/ "开发者的网上家园") 
*   [会员](https://cnblogs.vip/)
*   [众包](https://www.cnblogs.com/cmt/p/18500368)
*   [新闻](https://news.cnblogs.com/)
*   [博问](https://q.cnblogs.com/)
*   [闪存](https://ing.cnblogs.com/)
*   [赞助商](https://www.cnblogs.com/cmt/p/18341478)
*   [Trae](https://trae.cnblogs.com/)
*   [Chat2DB](https://chat2db-ai.com/)

*    ![](../images/search.svg)
     ![](../images/enter.svg) 
    
    *   ![](../images/search.svg)
        
        所有博客
    *   ![](../images/search.svg)
        
        当前博客
    *   ![](../images/search.svg)
        
        我的博客
    
*    [![](../images/newpost.svg)](https://i.cnblogs.com/EditPosts.aspx?opt=1 "写随笔") [ ![](../images/myblog.svg)
     ](https://www.cnblogs.com/yehuoshun/ "我的博客") [ ![](../images/message.svg)
      ](https://msg.cnblogs.com/ "短消息") [![](../images/lite-mode-on.svg)](javascript:void(0) "简洁模式启用，您在访问他人博客时会使用简洁款皮肤展示") 
    
     [![](../images/default-avatar.png)](https://home.cnblogs.com/u/yehuoshun) 
    
    [我的博客](https://www.cnblogs.com/yehuoshun/) [我的园子](https://home.cnblogs.com/) [账号设置](https://account.cnblogs.com/settings/account) [会员中心](https://vip.cnblogs.com/my) [简洁模式 ...](javascript:void(0) "简洁模式会使用简洁款皮肤显示所有博客") [退出登录](javascript:void(0))
    
    [注册](https://account.cnblogs.com/signup) [登录](javascript:void(0);)

[![](../images/logo.gif)
](https://www.cnblogs.com/chenshibao/)

[chenshibao](https://www.cnblogs.com/chenshibao)
================================================

*   [博客园](https://www.cnblogs.com/)
*   [首页](https://www.cnblogs.com/chenshibao/)
*   [新随笔](https://i.cnblogs.com/EditPosts.aspx?opt=1)
*   [联系](https://msg.cnblogs.com/send/%E4%BC%BC%E6%A2%A6%E4%BA%A6%E9%9D%9E%E6%A2%A6)
*   [订阅](javascript:void(0))
*   [管理](https://i.cnblogs.com/)

随笔 - 205 文章 - 186 评论 - 27 阅读 - 71012

[第25篇 RabbitMQ在.net core中的应用](https://www.cnblogs.com/chenshibao/p/18429050 "发布于 2024-09-24 14:44")
===================================================================================================

RabbitMQ 是一个可靠且成熟的消息传递和流代理，它很容易部署在云环境、内部部署和本地机器上。它目前被全世界数百万人使用。
===============================================================

1.基本概念
------

生产者（Producer）

```null
生产者是一个发送消息的程序。发送消息的程序可以是任何语言编写的，只要它能够连接到RabbitMQ服务器，并且能够发送消息到RabbitMQ服务器。

```

消费者（Consumer）

```null
消费者是一个接收消息的程序。接收消息的程序可以是任何语言编写的，只要它能够连接到RabbitMQ服务器，并且能够从RabbitMQ服务器接收消息。

```

队列（Queue）

```null
队列是RabbitMQ的内部对象，用于存储消息。多个生产者可以向一个队列发送消息，多个消费者可以尝试从一个队列接收消息。队列支持多种消息分发策略。

```

交换机（Exchange）

```null
交换机是消息的分发中心。它接收来自生产者的消息，然后将这些消息分发给队列。交换机有多种类型，包括直连交换机、主题交换机、扇形交换机、头交换机。

```

绑定（Binding）

```null
绑定是交换机和队列之间的关联关系。绑定可以使用路由键进行绑定，也可以使用通配符进行绑定。

```

路由键（Routing Key）

```null
路由键是生产者发送消息时附带的一个属性。路由键的作用是决定消息被分发到哪个队列。

```

通配符（Wildcard）

```null
通配符是一种模式匹配的方式。RabbitMQ支持两种通配符：`*`和`#`。

```

绑定键（Binding Key）

```null
绑定键是交换机和队列之间的关联关系。绑定键可以使用路由键进行绑定，也可以使用通配符进行绑定。

```

持久化（Durable）

```null
持久化是指RabbitMQ服务器重启后，消息是否还存在。持久化可以应用到交换机、队列、绑定、消息等。

```

确认机制（Acknowledge）

```null
确认机制是指消费者接收到消息后，向RabbitMQ服务器发送一个确认消息。RabbitMQ服务器收到确认消息后，会删除这条消息。

自动确认
	消费者接收到消息后，RabbitMQ服务器会自动删除这条消息。

手动确认
	消费者接收到消息后，需要向RabbitMQ服务器发送一个确认消息。RabbitMQ服务器收到确认消息后，会删除这条消息。

```

拒绝机制（Reject）

```null
拒绝机制是指消费者接收到消息后，向RabbitMQ服务器发送一个拒绝消息。RabbitMQ服务器收到拒绝消息后，会将这条消息重新发送给其他消费者。

```

死信队列（Dead Letter Queue）

```null
死信队列是指消息被拒绝、过期或者达到最大重试次数后，会被发送到死信队列。

```

消息过期（Message TTL）

```null
消息过期是指消息在指定时间内没有被消费者消费，会被删除。

```

消息优先级（Message Priority）

```null
消息优先级是指消息在队列中的优先级。消息优先级高的消息会被优先消费。

```

消息分发

```null
消息分发是指消息在队列中的分发策略。消息分发策略包括轮询分发、公平分发、负载均衡分发。

```

2.环境搭建
------

Docker 安装 RabbitMQ

```null
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 --restart=always --hostname my-rabbit -e RABBITMQ_DEFAULT_USER=admin -e RABBITMQ_DEFAULT_PASS=admin -e TZ=Asia/Shanghai rabbitmq:management

```

*   \-d：后台运行
*   \--restart：重启策略
*   \--name：容器名称
*   \-p：端口映射
*   \--hostname：主机名
*   \-e：环境变量
    *   RABBITMQ\_DEFAULT\_USER：默认用户名
    *   RABBITMQ\_DEFAULT\_PASS：默认密码
*   TZ：时区
*   rabbitmq:management：镜像名称

Docker Compose 安装 RabbitMQ

```null
version: "3.1"
services:
rabbitmq:
    restart: always
    image: rabbitmq:management
    container_name: rabbitmq
    hostname: my-rabbit
    ports:
        - 5672:5672
        - 15672:15672 # RabbitMQ管理界面端口
    environment:
        TZ: Asia/Shanghai
            RABBITMQ_DEFAULT_USER: admin
            RABBITMQ_DEFAULT_PASS: admin

```

*   restart：重启策略
*   image：镜像名称
*   container\_name：容器名称
*   hostname：主机名
*   ports：端口映射
*   environment：环境变量
    *   TZ：时区
    *   RABBITMQ\_DEFAULT\_USER：默认用户名
    *   RABBITMQ\_DEFAULT\_PASS：默认密码
*   rabbitmq:management：镜像名称

3.使用
----

客户端SDK代码在GitHub：[https://github.com/Tangtang1997/IKunLibrary](https://github.com/Tangtang1997/IKunLibrary)

新建 TestRequest 类，实现 IRabbitMqRequest 接口，定义消息体

```null
public class TestRequest : IRabbitMqRequest
{
/// <summary>
/// 重试次数
/// </summary>
public int RetryCount { get; set; }

#region 自定义字段

/// <summary>
/// id
/// </summary>
public string Id { get; set; } = default!;

/// <summary>
/// 名称
/// </summary>
public string Name { get; set; } = default!;

/// <summary>
/// 年龄
/// </summary>
public int Age { get; set; }

#endregion
}

```

新建TestRequestHandler类，实现IRabbitMqRequestHandler接口，处理消息

```null
public class TestRequestHanlder : IRequestProcessorHandler<TestRequest>
{
private readonly ILogger<TestRequestHanlder> _logger;

public TestRequestHanlder(ILogger<TestRequestHanlder> logger)
{
    _logger = logger;
}

public Task StartAsync(CancellationToken cancellationToken)
{
    return Task.CompletedTask;
}

public Task StopAsync(int milliseconds, CancellationToken cancellationToken = default)
{
    return Task.CompletedTask;
}

public async Task HandleAsync(TestRequest request, CancellationToken cancellationToken = default)
{
    _logger.LogInformation($"开始处理消息: {request.Id}");

    //模拟处理消息耗时操作
    await Task.Delay(1000, cancellationToken);

    _logger.LogInformation($"消息处理完成: {request.Id}");
    }
}

```

使用 IHostedService 来托管服务

```null
public class SampleHostedService : IHostedService
{
private readonly IConsumerProcessorManager<TestRequest> _consumerProcessorManager;
private readonly IHostApplicationLifetime _applicationLifetime;
private readonly ILogger<SampleHostedService> _logger;

public SampleHostedService(
    IConsumerProcessorManager<TestRequest> consumerProcessorManager,
    IHostApplicationLifetime applicationLifetime,
    ILogger<SampleHostedService> logger)
{
    _consumerProcessorManager = consumerProcessorManager;
    _applicationLifetime = applicationLifetime;
    _logger = logger;
}

public async Task StartAsync(CancellationToken cancellationToken)
{
    _applicationLifetime.ApplicationStarted.Register(() =>
    {
        _logger.LogInformation("SampleHostedService is starting.");
        _consumerProcessorManager.StartAsync(cancellationToken);
    });

    _applicationLifetime.ApplicationStopping.Register(() =>
    {
        _logger.LogInformation("SampleHostedService is stopping.");
        _consumerProcessorManager.StopAsync(3000, cancellationToken);
    });

    await Task.CompletedTask;
}

public async Task StopAsync(CancellationToken cancellationToken)
{
    await Task.CompletedTask;
    }
}

```

注册并启用服务

```null
IHost host = Host.CreateDefaultBuilder(args)
    .ConfigureServices(services =>
{
    services.AddHostedService<SampleHostedService>();

    var configuration = services.BuildServiceProvider().GetRequiredService<IConfiguration>();

    var hostName = configuration["RabbitMq:Host"] ?? throw new Exception("HostName is not configured");
    var port = int.Parse(configuration["RabbitMq:Port"] ?? throw new Exception("Port is not configured"));
    var userName = configuration["RabbitMq:Username"] ?? throw new Exception("Username is not configured");
    var password = configuration["RabbitMq:Password"] ?? throw new Exception("Password is not configured");
    var queueName = configuration["RabbitMq:QueueName"] ?? throw new Exception("QueueName is not configured");

    services.AddRabbitMq<TestRequest, TestRequestHanlder>(options =>
    {
        options.UseSsl = false;
        options.HostName = hostName;
        options.Port = port;
        options.UserName = userName;
        options.Password = password;
        options.Durable = true;
        options.NetworkRecoveryInterval = 10000;
        options.ExchangeType = ExchangeType.Direct;
        options.QueueName = queueName;
        options.Exchange = $"{queueName}_SERVICE_EXCHANGE";
        options.RoutingKey = $"{queueName}_ROUTING_KEY";
        options.DeadLetterExchange = $"{queueName}_SERVICE_EXCHANGE_DEAD";
        options.DeadLetterQueueName = $"{queueName}_DEAD";
        options.DeadLetterRoutingKey = $"{queueName}_ROUTING_KEY";
    });
})
.Build();

await host.RunAsync();

```

4.参考资料
------

[https://www.cnblogs.com/Tangtang1997/p/18067763](https://www.cnblogs.com/Tangtang1997/p/18067763)

分类: [RabbitMQ](https://www.cnblogs.com/chenshibao/category/2420173.html)

标签: [RabbitMQ](https://www.cnblogs.com/chenshibao/tag/RabbitMQ/)

[好文要顶](javascript:void(0);) [关注我](javascript:void(0);) [收藏该文](javascript:void(0);) [微信分享](javascript:void(0);)

[![](../images/20240816232738.png)
](https://home.cnblogs.com/u/chenshibao/)

[似梦亦非梦](https://home.cnblogs.com/u/chenshibao/)  
[粉丝 - 22](https://home.cnblogs.com/u/chenshibao/followers/) [关注 - 52](https://home.cnblogs.com/u/chenshibao/followees/)  

[+加关注](javascript:void(0);)

0

0

[升级成为会员](https://cnblogs.vip/)

[«](https://www.cnblogs.com/chenshibao/p/18428415) 上一篇： [第24篇 局域网内数据之间传输的方式](https://www.cnblogs.com/chenshibao/p/18428415 "发布于 2024-09-24 10:15")  
[»](https://www.cnblogs.com/chenshibao/p/18430277) 下一篇： [第26篇 Vue项目如何运行起来](https://www.cnblogs.com/chenshibao/p/18430277 "发布于 2024-09-24 23:10")

posted @ 2024-09-24 14:44  [似梦亦非梦](https://www.cnblogs.com/chenshibao)  阅读(269)  评论(0)    [收藏](javascript:void(0))  [举报](javascript:void(0))

[刷新评论](javascript:void(0);)[刷新页面](#)[返回顶部](#top)

发表评论 [升级成为园子VIP会员](https://cnblogs.vip/)

编辑 预览

c6df3402-7d42-46d7-9688-08d9b4008d6c

 自动补全

 [不改了](javascript:void(0);) [退出](javascript:void(0);) [订阅评论](javascript:void(0); "订阅后有新评论时会邮件通知您") [我的博客](//www.cnblogs.com/yehuoshun/)

\[Ctrl+Enter快捷键提交\]

[【推荐】100%开源！大型工业跨平台软件C++源码提供，建模，组态！](http://www.uccpsoft.com/index.htm)  
[【推荐】AI 的力量，开发者的翅膀：欢迎使用 AI 原生开发工具 TRAE](https://www.cnblogs.com/cmt/p/19004092)  
[【推荐】2025 HarmonyOS 鸿蒙创新赛正式启动，百万大奖等你挑战](https://www.cnblogs.com/HarmonyOS5/p/18974773)  
[【推荐】轻量又高性能的 SSH 工具 IShell：AI 加持，快人一步](http://ishell.cc/)  

 [![](../images/35695-20250621065725472-980862142.webp)](https://www.cnblogs.com/cmt/p/18894723) 

**相关博文：**   

·  [使用RabbitMQ实现消息队列---C#为例](https://www.cnblogs.com/chenshibao/p/18823157 "使用RabbitMQ实现消息队列---C#为例")

·  [Linux服务器搭建RabbitMQ流程](https://www.cnblogs.com/chenshibao/p/18620957 "Linux服务器搭建RabbitMQ流程")

·  [.net core使用RabbitMQ](https://www.cnblogs.com/mq0036/p/18421206 ".net core使用RabbitMQ")

·  [.net core使用RabbitMQ](https://www.cnblogs.com/Tangtang1997/p/18067763 ".net core使用RabbitMQ")

·  [.Net Core中使用RabbitMQ](https://www.cnblogs.com/zhangjd/p/18179313 ".Net Core中使用RabbitMQ")

**阅读排行：**   
· [记一次酣畅淋漓的js逆向](https://www.cnblogs.com/qzero233/p/19020404)  
· [程序员究竟要不要写文章](https://www.cnblogs.com/xiaoxi666/p/19019449)  
· [一个被BCL遗忘的高性能集合：C# CircularBuffer<T>深度解析](https://www.cnblogs.com/sdcb/p/19019424/csharp-circular-buffer)  
· [Trae Plus 让没有编程基础的女朋友也用上了 AI Coding](https://www.cnblogs.com/caituotuo/p/19019858)  
· [Coze工作流实战：一键上传excel生成数据图表](https://www.cnblogs.com/lucky_hu/p/19018899)  

### 公告

昵称： [似梦亦非梦](https://home.cnblogs.com/u/chenshibao/)  
园龄： [4年8个月](https://home.cnblogs.com/u/chenshibao/ "入园时间：2020-11-12")  
粉丝： [22](https://home.cnblogs.com/u/chenshibao/followers/)  
关注： [52](https://home.cnblogs.com/u/chenshibao/followees/)

[+加关注](javascript:void(0))

| 
| [<](javascript:void(0);) | 2025年8月 | [\>](javascript:void(0);) | |
| 日 | 一 | 二 | 三 | 四 | 五 | 六 |
| 27 | 28 | 29 | 30 | 31 | 1 | 2 |
| [3](https://www.cnblogs.com/chenshibao/p/archive/2025/08/03) | 4 | 5 | 6 | 7 | 8 | 9 |
| 10 | 11 | 12 | 13 | 14 | 15 | 16 |
| 17 | 18 | 19 | 20 | 21 | 22 | 23 |
| 24 | 25 | 26 | 27 | 28 | 29 | 30 |
| 31 | 1 | 2 | 3 | 4 | 5 | 6 |

### 搜索

 

### 常用链接

*   [我的随笔](https://www.cnblogs.com/chenshibao/p/ "我的博客的随笔列表")
*   [我的评论](https://www.cnblogs.com/chenshibao/MyComments.html "我的发表过的评论列表")
*   [我的参与](https://www.cnblogs.com/chenshibao/OtherPosts.html "我评论过的随笔列表")
*   [最新评论](https://www.cnblogs.com/chenshibao/comments "我的博客的评论列表")
*   [我的标签](https://www.cnblogs.com/chenshibao/tag/ "我的博客的标签列表")

### [我的标签](https://www.cnblogs.com/chenshibao/tag/)

*   [算法题(24)](https://www.cnblogs.com/chenshibao/tag/%E7%AE%97%E6%B3%95%E9%A2%98/)
*   [redis(20)](https://www.cnblogs.com/chenshibao/tag/redis/)
*   [.net ccore(10)](https://www.cnblogs.com/chenshibao/tag/.net%20ccore/)
*   [芯片测试(9)](https://www.cnblogs.com/chenshibao/tag/%E8%8A%AF%E7%89%87%E6%B5%8B%E8%AF%95/)
*   [WPF(8)](https://www.cnblogs.com/chenshibao/tag/WPF/)
*   [多线程(8)](https://www.cnblogs.com/chenshibao/tag/%E5%A4%9A%E7%BA%BF%E7%A8%8B/)
*   [linux(7)](https://www.cnblogs.com/chenshibao/tag/linux/)
*   [Docker(6)](https://www.cnblogs.com/chenshibao/tag/Docker/)
*   [开发工具(6)](https://www.cnblogs.com/chenshibao/tag/%E5%BC%80%E5%8F%91%E5%B7%A5%E5%85%B7/)
*   [RabbitMQ(5)](https://www.cnblogs.com/chenshibao/tag/RabbitMQ/)
*   [更多](https://www.cnblogs.com/chenshibao/tag/)

### 合集

*   [算法题(25)](https://www.cnblogs.com/chenshibao/collections/23795)
*   [Asp.NetCore面试题(21)](https://www.cnblogs.com/chenshibao/collections/23823)
*   [MySql知识点(70)](https://www.cnblogs.com/chenshibao/collections/23828)
*   [Redis高频知识点(50)](https://www.cnblogs.com/chenshibao/collections/23840)
*   [SqlServer知识点(11)](https://www.cnblogs.com/chenshibao/collections/23847)
*   [MongoDB知识点(29)](https://www.cnblogs.com/chenshibao/collections/23848)
*   [企业面试合集(6)](https://www.cnblogs.com/chenshibao/collections/24144)
*   [DDD集合(4)](https://www.cnblogs.com/chenshibao/collections/24186)
*   [多线程(6)](https://www.cnblogs.com/chenshibao/collections/24266)
*   [微服务(4)](https://www.cnblogs.com/chenshibao/collections/24275)
*   [WPF合集(8)](https://www.cnblogs.com/chenshibao/collections/24357)
*   [上位机合集(1)](https://www.cnblogs.com/chenshibao/collections/25792)

### [随笔分类](https://www.cnblogs.com/chenshibao/post-categories)

*   [.netcore(7)](https://www.cnblogs.com/chenshibao/category/2434832.html)
*   [abp(1)](https://www.cnblogs.com/chenshibao/category/2434741.html)
*   [AOP(2)](https://www.cnblogs.com/chenshibao/category/2434860.html)
*   [asp.netcore(2)](https://www.cnblogs.com/chenshibao/category/2416542.html)
*   [Avalonia(1)](https://www.cnblogs.com/chenshibao/category/2428383.html)
*   [Cookie(1)](https://www.cnblogs.com/chenshibao/category/2432946.html)
*   [DDD(5)](https://www.cnblogs.com/chenshibao/category/2435452.html)
*   [DeepSeek(3)](https://www.cnblogs.com/chenshibao/category/2453807.html)
*   [DI(1)](https://www.cnblogs.com/chenshibao/category/2434856.html)
*   [docker(5)](https://www.cnblogs.com/chenshibao/category/2428051.html)
*   [EventBus(1)](https://www.cnblogs.com/chenshibao/category/2455924.html)
*   [git管理(4)](https://www.cnblogs.com/chenshibao/category/2417025.html)
*   [gRPC(3)](https://www.cnblogs.com/chenshibao/category/2420440.html)
*   [IdentityServer(1)](https://www.cnblogs.com/chenshibao/category/2435044.html)
*   [IIS(1)](https://www.cnblogs.com/chenshibao/category/2418363.html)
*   [IOC容器(1)](https://www.cnblogs.com/chenshibao/category/2430015.html)
*   [JVM(1)](https://www.cnblogs.com/chenshibao/category/2427277.html)
*   [jwt(2)](https://www.cnblogs.com/chenshibao/category/2434851.html)
*   [Kubernetes(1)](https://www.cnblogs.com/chenshibao/category/2434777.html)
*   [Linux(3)](https://www.cnblogs.com/chenshibao/category/2426938.html)
*   [MongoDB(1)](https://www.cnblogs.com/chenshibao/category/2434769.html)
*   [MySql(1)](https://www.cnblogs.com/chenshibao/category/2434763.html)
*   [net基础框架(1)](https://www.cnblogs.com/chenshibao/category/2455712.html)
*   [nginx(2)](https://www.cnblogs.com/chenshibao/category/2418366.html)
*   [nuget管理(1)](https://www.cnblogs.com/chenshibao/category/2417297.html)
*   [RabbitMQ(5)](https://www.cnblogs.com/chenshibao/category/2420173.html)
*   [redis(19)](https://www.cnblogs.com/chenshibao/category/2420608.html)
*   [SignalR(1)](https://www.cnblogs.com/chenshibao/category/2454503.html)
*   [SqlServer(2)](https://www.cnblogs.com/chenshibao/category/2423455.html)
*   [TCP(1)](https://www.cnblogs.com/chenshibao/category/2453061.html)
*   [vue(3)](https://www.cnblogs.com/chenshibao/category/2418048.html)
*   [WebService(1)](https://www.cnblogs.com/chenshibao/category/2445744.html)
*   [Window IIS服务(1)](https://www.cnblogs.com/chenshibao/category/2453258.html)
*   [WPF(8)](https://www.cnblogs.com/chenshibao/category/2462423.html)
*   [创业之路(2)](https://www.cnblogs.com/chenshibao/category/2469158.html)
*   [多线程(7)](https://www.cnblogs.com/chenshibao/category/2438671.html)
*   [泛型(2)](https://www.cnblogs.com/chenshibao/category/2438683.html)
*   [缓存(2)](https://www.cnblogs.com/chenshibao/category/2456280.html)
*   [开发工具介绍(20)](https://www.cnblogs.com/chenshibao/category/2416913.html)
*   [幂等性(1)](https://www.cnblogs.com/chenshibao/category/2433193.html)
*   [面试题(7)](https://www.cnblogs.com/chenshibao/category/2438070.html)
*   [内网穿透(1)](https://www.cnblogs.com/chenshibao/category/2423939.html)
*   [上位机(1)](https://www.cnblogs.com/chenshibao/category/2445963.html)
*   [数据结构(2)](https://www.cnblogs.com/chenshibao/category/2435891.html)
*   [数据通信(1)](https://www.cnblogs.com/chenshibao/category/2422789.html)
*   [数据同步(3)](https://www.cnblogs.com/chenshibao/category/2423718.html)
*   [算法题(25)](https://www.cnblogs.com/chenshibao/category/2435991.html)
*   [索引(1)](https://www.cnblogs.com/chenshibao/category/2438684.html)
*   [特性(1)](https://www.cnblogs.com/chenshibao/category/2425989.html)
*   [网络(2)](https://www.cnblogs.com/chenshibao/category/2426653.html)
*   [网络通信(1)](https://www.cnblogs.com/chenshibao/category/2435569.html)
*   [微服务(5)](https://www.cnblogs.com/chenshibao/category/2438682.html)
*   [委托(1)](https://www.cnblogs.com/chenshibao/category/2422601.html)
*   [线程锁(2)](https://www.cnblogs.com/chenshibao/category/2419691.html)
*   [芯片测试(7)](https://www.cnblogs.com/chenshibao/category/2461938.html)
*   [验证集合(1)](https://www.cnblogs.com/chenshibao/category/2445844.html)
*   [更多](javascript:void(0))

### 随笔档案

*   [2025年8月(1)](https://www.cnblogs.com/chenshibao/p/archive/2025/08)
*   [2025年7月(10)](https://www.cnblogs.com/chenshibao/p/archive/2025/07)
*   [2025年6月(18)](https://www.cnblogs.com/chenshibao/p/archive/2025/06)
*   [2025年5月(3)](https://www.cnblogs.com/chenshibao/p/archive/2025/05)
*   [2025年4月(12)](https://www.cnblogs.com/chenshibao/p/archive/2025/04)
*   [2025年3月(4)](https://www.cnblogs.com/chenshibao/p/archive/2025/03)
*   [2025年2月(8)](https://www.cnblogs.com/chenshibao/p/archive/2025/02)
*   [2025年1月(7)](https://www.cnblogs.com/chenshibao/p/archive/2025/01)
*   [2024年12月(87)](https://www.cnblogs.com/chenshibao/p/archive/2024/12)
*   [2024年11月(9)](https://www.cnblogs.com/chenshibao/p/archive/2024/11)
*   [2024年10月(16)](https://www.cnblogs.com/chenshibao/p/archive/2024/10)
*   [2024年9月(17)](https://www.cnblogs.com/chenshibao/p/archive/2024/09)
*   [2024年8月(13)](https://www.cnblogs.com/chenshibao/p/archive/2024/08)

### [文章分类](https://www.cnblogs.com/chenshibao/article-categories)

*   [.net 面试题基础篇2024(1)](https://www.cnblogs.com/chenshibao/category/2436068.html)
*   [Asp.NetCore面试题2024(21)](https://www.cnblogs.com/chenshibao/category/2436086.html)
*   [MongoDB面试题2024(30)](https://www.cnblogs.com/chenshibao/category/2436218.html)
*   [MySql面试题2024(71)](https://www.cnblogs.com/chenshibao/category/2436094.html)
*   [Redis高频面试题2024(50)](https://www.cnblogs.com/chenshibao/category/2436174.html)
*   [SqlServer面试题2024(12)](https://www.cnblogs.com/chenshibao/category/2436213.html)
*   [多线程(1)](https://www.cnblogs.com/chenshibao/category/2435992.html)

### [阅读排行榜](https://www.cnblogs.com/chenshibao/most-viewed)

*   [1\. 第20篇 window系统安装Redis流程(4560)](https://www.cnblogs.com/chenshibao/p/18405528)
*   [2\. 第77篇 Redis中的Sentinel（哨兵模式）详解(3506)](https://www.cnblogs.com/chenshibao/p/18592878)
*   [3\. Linux服务器上部署Redis流程(2877)](https://www.cnblogs.com/chenshibao/p/18618158)
*   [4\. 第10篇 nginx部署出现 Welcome to nginx! If you see this page 该如何解决(2554)](https://www.cnblogs.com/chenshibao/p/18383572)
*   [5\. 第60篇 abp框架介绍(2372)](https://www.cnblogs.com/chenshibao/p/18587949)

### [评论排行榜](https://www.cnblogs.com/chenshibao/most-commented)

*   [1\. 程序员最终还是走上了创业的道路(8)](https://www.cnblogs.com/chenshibao/p/18996757)
*   [2\. WPF开发中实现DataGrid中的数据分页显示，自定义分页样式（与上一篇不同的分页）(4)](https://www.cnblogs.com/chenshibao/p/18994852)
*   [3\. 第43篇 Linux上使用docker部署.net8项目详细教程(4)](https://www.cnblogs.com/chenshibao/p/18501537)
*   [4\. SignalR实时通信，多客户端与服务端交互(2)](https://www.cnblogs.com/chenshibao/p/18830358)
*   [5\. 第41篇 领域驱动设计详谈(2)](https://www.cnblogs.com/chenshibao/p/18470268)

### [推荐排行榜](https://www.cnblogs.com/chenshibao/most-liked)

*   [1\. 程序员最终还是走上了创业的道路(6)](https://www.cnblogs.com/chenshibao/p/18996757)
*   [2\. WPF开发中自定义DataGrid样式(3)](https://www.cnblogs.com/chenshibao/p/18980713)
*   [3\. C#编程中并行与并发的简单理解(3)](https://www.cnblogs.com/chenshibao/p/18865227)
*   [4\. 简单梳理一下常见的系统(2)](https://www.cnblogs.com/chenshibao/p/18929471)
*   [5\. .net core 中的MemoryCache的详细使用(2)](https://www.cnblogs.com/chenshibao/p/18854479)

### [最新评论](https://www.cnblogs.com/chenshibao/comments)

*   [1\. Re:WPF开发中实现DataGrid中的数据分页显示，自定义分页样式（与上一篇不同的分页）](https://www.cnblogs.com/chenshibao/p/18994852)
*   @超级小屁屁 @疯狂的懒羊羊 为啥体验不好，是性能不如Web吗 啊？是什么让你产生这错觉？ 是web性能不好，数据量大的时候一般采取分页。不过现在嘛，技术、硬件都提高了，基本也没有这个问题。 WPF性...
*   \--疯狂的懒羊羊
*   [2\. Re:WPF开发中实现DataGrid中的数据分页显示，自定义分页样式（与上一篇不同的分页）](https://www.cnblogs.com/chenshibao/p/18994852)
*   @疯狂的懒羊羊 为啥体验不好，是性能不如Web吗...
*   \--超级小屁屁
*   [3\. Re:企业面试题-聚水潭](https://www.cnblogs.com/chenshibao/p/18651295)
*   去聚水潭面试了吗，什么部门
    
*   \--zhujinhu
*   [4\. Re:程序员最终还是走上了创业的道路](https://www.cnblogs.com/chenshibao/p/18996757)
*   @lindexi 好的，flighting...
*   \--似梦亦非梦
*   [5\. Re:WPF开发中实现DataGrid中的数据分页显示，自定义分页样式（与上一篇不同的分页）](https://www.cnblogs.com/chenshibao/p/18994852)
*   @疯狂的懒羊羊 感谢推荐，本样例也是有滚动条，桌面端也是个应用，也是得数据分页，至于筛选排序等，可以在列增加过滤选项，按状态，日期...
*   \--似梦亦非梦

[博客园](https://www.cnblogs.com/)  ©  2004-2025  
[![](../images/ghs.png)
浙公网安备 33010602011771号](http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=33010602011771) [浙ICP备2021040463号-3](https://beian.miit.gov.cn) 

点击右上角即可分享

![](../images/35695-20230906145857937-1471873834.gif)