# OpenClaw 通道插件模板

此目录包含为 OpenClaw 创建新通道插件的模板。

## 快速开始

### 1. 复制模板

```bash
# 将模板复制到新的通道目录
cp -r extensions/template extensions/<your-channel-id>

# 重命名文件并更新导入
cd extensions/<your-channel-id>
```

### 2. 更新标识符

在整个代码库中替换所有占位符:

| 占位符           | 描述                          | 示例      |
| ---------------- | ----------------------------- | --------- |
| `<channel-id>`   | 唯一通道标识符(小写,带连字符) | `my-chat` |
| `<Channel Name>` | 人类可读的名称                | `MyChat`  |
| `<channel>`      | 代码使用的小写名称            | `mychat`  |
| `<Channel>`      | 代码使用的大写名称            | `MyChat`  |
| `<channelId>`    | CamelCase 标识符              | `myChat`  |

### 3. 更新文件

#### `package.json`

```json
{
  "name": "@openclaw/<channel-id>",
  "version": "2026.2.24",
  "description": "OpenClaw <Channel Name> channel plugin",
  "dependencies": {
    // 添加通道 SDK 依赖
  },
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "<channel-id>",
      "label": "<Channel Name>"
      // ... 其他元数据
    }
  }
}
```

#### `index.ts`

- 更新 `id`、`name`、`description`
- 导入您的通道插件

#### `src/runtime.ts`

- 重命名函数: `setMyChannelRuntime` → `set<Channel>Runtime`
- 更新错误消息

#### `src/channel.ts`

这是主要的实现文件。需要实现的关键区域:

1. **类型定义**
   - `ResolvedMyChannelAccount` - 账户配置类型
   - `MyChannelProbe` - 连接探测结果类型

2. **配置 Schema**
   - 使用通道特定字段更新 `MyChannelConfigSchema`

3. **辅助函数**(标记为 `TODO`)
   - `sendMyChannelMessage()` - 发送文本消息
   - `sendMyChannelMedia()` - 发送媒体消息
   - `probeMyChannelConnection()` - 测试连接
   - `monitorMyChannelProvider()` - 监听传入消息

## 实现指南

### 必需组件

| 组件           | 方法             | 描述             |
| -------------- | ---------------- | ---------------- |
| `id`           | -                | 唯一通道标识符   |
| `meta`         | -                | 通道元数据       |
| `capabilities` | -                | 支持的功能       |
| `config`       | `listAccountIds` | 列出已配置的账户 |
| `config`       | `resolveAccount` | 解析账户配置     |

### 推荐组件

| 组件       | 方法           | 描述           |
| ---------- | -------------- | -------------- |
| `outbound` | `sendText`     | 发送文本消息   |
| `outbound` | `sendMedia`    | 发送媒体消息   |
| `gateway`  | `startAccount` | 启动消息监听器 |
| `gateway`  | `stopAccount`  | 停止消息监听器 |
| `status`   | `probeAccount` | 测试连接       |

### 消息发送流程

```
用户消息 → OpenClaw 核心 → outbound.sendText() → 通道 API
```

1. OpenClaw 调用 `outbound.sendText()` 并传入消息参数
2. 您的实现调用通道的 API
3. 返回 `{ channel: "<channel-id>", messageId: "..." }`

### 消息接收流程

```
通道 API → gateway.startAccount() → runtime.handleInboundMessage() → OpenClaw 核心
```

1. OpenClaw 在启动期间调用 `gateway.startAccount()`
2. 您的实现连接到通道(WebSocket、webhook、轮询)
3. 收到消息时,调用 `runtime.handleInboundMessage(message)`
4. 当 `abortSignal` 被触发时返回

### 连接选项

#### WebSocket

```typescript
async function monitorMyChannelProvider(params) {
  const ws = new WebSocket("wss://api.channel.com/ws");

  ws.on("message", (data) => {
    const message = parseMessage(data);
    params.runtime.handleInboundMessage(message);
  });

  params.abortSignal.addEventListener("abort", () => {
    ws.close();
  });

  await new Promise((resolve) => ws.on("close", resolve));
}
```

#### Webhook

```typescript
async function monitorMyChannelProvider(params) {
  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      const body = await readBody(req);
      const message = parseWebhook(body);
      params.runtime.handleInboundMessage(message);
      res.writeHead(200);
      res.end("OK");
    }
  });

  server.listen(8080);

  params.abortSignal.addEventListener("abort", () => {
    server.close();
  });

  await new Promise((resolve) => server.on("close", resolve));
}
```

#### 轮询

```typescript
async function monitorMyChannelProvider(params) {
  let lastId = null;

  while (!params.abortSignal.aborted) {
    const messages = await fetchNewMessages(params.token, lastId);

    for (const message of messages) {
      params.runtime.handleInboundMessage(message);
      lastId = message.id;
    }

    await sleep(1000); // 轮询间隔
  }
}
```

## 测试

```bash
# 构建插件
cd extensions/<channel-id>
pnpm build

# 使用 OpenClaw 测试
cd ../..
pnpm install
pnpm build
pnpm openclaw gateway run
```

## 检查清单

提交插件之前:

- [ ] 所有占位符已替换为实际值
- [ ] `package.json` 配置正确
- [ ] `index.ts` 注册了通道
- [ ] `src/runtime.ts` 提供运行时访问
- [ ] `src/channel.ts` 实现了必需的接口
- [ ] `config.listAccountIds` 返回账户列表
- [ ] `config.resolveAccount` 解析配置
- [ ] `outbound.sendText` 发送消息(如果支持)
- [ ] `gateway.startAccount` 启动监听器(如果支持)
- [ ] `status.probeAccount` 探测连接(如果支持)
- [ ] 插件无错误构建
- [ ] 插件在 OpenClaw 中加载

## 参考实现

- **Telegram**: `extensions/telegram/` - 整洁、文档齐全的实现
- **Feishu**: `extensions/feishu/` - 具有许多功能的复杂实现
- **Plugin SDK**: `src/plugin-sdk/index.ts` - 可用的工具和类型

## 获取帮助

- OpenClaw 文档: https://docs.openclaw.ai/
- Plugin SDK 类型: `src/channels/plugins/types.adapters.ts`
- GitHub Issues: https://github.com/openclaw/openclaw/issues
