---
title: "安装RabbitMQ"
slug: ezguk3iupht0fa8q
created: 2026-06-20T05:42:05.000Z
updated: 2026-06-20T05:42:05.000Z
word_count: 211
---
#### 1 **上传并解压**
	上传rabbitmq-server-generic-unix-3.7.18.tar.xz到/usr/loca/tmp中

```plain
# cd /usr/local/tmp
# tar xf rabbitmq-server-generic-unix-3.7.18.tar.xz
```

#### 2 **复制到local下**
	复制解压文件到/usr/local下，命名为rabbitmq

```plain
# cp -r rabbitmq_server-3.7.18 /usr/local/rabbitmq
```

#### 3 **配置环境变量**
```plain
# vim /etc/profile
```

	在文件中添加

```plain
export PATH=$PATH:/usr/local/rabbitmq/sbin
```

	解析文件

```plain
# source /etc/profile
```

#### 4 **开启web管理插件**
	进入rabbitmq/sbin目录

```plain
# cd /usr/local/rabbitmq/sbin
```

```plain
查看插件列表
```

```plain
# ./rabbitmq-plugins list
```

```plain
生效管理插件
```

```plain
# ./rabbitmq-plugins enable rabbitmq_management
```

#### 5 **后台运行**
	启动rabbitmq。

```plain
# ./rabbitmq-server -detached
```

	停止命令，如果无法停止，使用kill -9 进程号进行关闭

```plain
# ./rabbitmqctl stop_app
```

#### 6 **查看web管理界面**
	默认可以在安装rabbitmq的电脑上通过用户名：guest密码guest进行访问web管理界面

	端口号：15672（放行端口，或关闭防火墙）

	在虚拟机浏览器中输入：

	[http://localhost:15672](http://localhost:15672)