---
title: "RabbitMQ简介"
slug: klclwo5obo42avx2
created: 2026-06-20T05:42:07.000Z
updated: 2026-06-20T05:42:07.000Z
word_count: 176
---
#### <font style="color:rgb(51, 51, 51);">1 </font>**<font style="color:rgb(51, 51, 51);">RabbitMQ介绍</font>**
<font style="color:rgb(51, 51, 51);">	</font><font style="color:rgb(51, 51, 51);">RabbitMQ是由Erlang语言编写的基于AMQP的消息中间件。而消息中间件作为分布式系统重要组件之一，可以解决应用耦合，异步消息，流量削峰等问题。</font>

##### <font style="color:rgb(51, 51, 51);">1.1 </font>**<font style="color:rgb(51, 51, 51);">解决应用耦合</font>**
###### <font style="color:rgb(119, 119, 119);">1.1.1 </font>**<font style="color:rgb(119, 119, 119);">不使用MQ时</font>**
![](../images/1685340355340-b84bce03-db93-4ef5-a30d-0b1cbcce8531.png)

###### <font style="color:rgb(119, 119, 119);">1.1.2 </font>**<font style="color:rgb(119, 119, 119);">使用MQ解决耦合</font>**
![](../images/1685340359538-ed53da3b-69c2-4f97-8d13-9978b5457424.png)

#### <font style="color:rgb(51, 51, 51);">2 </font>**<font style="color:rgb(51, 51, 51);">RabbitMQ适用场景</font>**
<font style="color:rgb(51, 51, 51);">	</font><font style="color:rgb(51, 51, 51);">排队算法 : 使用消息队列特性</font>

<font style="color:rgb(51, 51, 51);">	</font><font style="color:rgb(51, 51, 51);">秒杀活动 : 使用消息队列特性</font>

<font style="color:rgb(51, 51, 51);">	</font><font style="color:rgb(51, 51, 51);">消息分发 : 使用消息异步特性</font>

<font style="color:rgb(51, 51, 51);">	</font><font style="color:rgb(51, 51, 51);">异步处理 : 使用消息异步特性</font>

<font style="color:rgb(51, 51, 51);">	</font><font style="color:rgb(51, 51, 51);">数据同步 : 使用消息异步特性</font>

<font style="color:rgb(51, 51, 51);">	</font><font style="color:rgb(51, 51, 51);">处理耗时任务 : 使用消息异步特性</font>

<font style="color:rgb(51, 51, 51);">	流量销峰</font>