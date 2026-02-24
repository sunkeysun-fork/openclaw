# OpenClaw 项目架构文档

> 基于 OpenClaw 源码深度分析
>
> 分析日期: 2026-02-24
>
> 项目仓库: https://github.com/openclaw/openclaw

---

## 目录

- [一、项目整体架构](#一项目整体架构)
- [二、插件扩展机制](#二插件扩展机制)
- [三、安全控制机制](#三安全控制机制)
- [四、渠道插件运作原理](#四渠道插件运作原理)
  - [4.1 入站请求处理](#41-入站请求处理)
  - [4.2 出站消息处理](#42-出站消息处理)
  - [4.3 Telegram 渠道实现](#43-telegram-渠道实现)
  - [4.4 飞书渠道插件](#44-飞书渠道插件)
  - [4.5 Webhook/WebSocket 通信处理](#45-webhookwebsocket-通信处理)
- [五、Agent 安全执行控制](#五-agent-安全执行控制)
- [六、开发指南](#六开发指南)

---

## 一、项目整体架构

### 1.1 目录结构

```
openclaw/
├── src/                          # 核心源代码
│   ├── cli/                     # CLI 命令行接口
│   │   ├── build-program.ts     # 程序构建入口
│   │   ├── command-registry.ts  # 命令注册中心
│   │   └── progress.ts          # CLI 进度显示
│   ├── agents/                  # Agent 系统
│   │   ├── embedded/            # 嵌入式 Pi Agent
│   │   ├── run/                 # Agent 运行时
│   │   └── tool-policy/         # 工具策略
│   ├── channels/                # 消息通道管理
│   │   ├── registry.ts          # 通道注册表
│   │   ├── routing/             # 路由解析
│   │   ├── telegram/            # Telegram 通道
│   │   ├── discord/             # Discord 通道
│   │   ├── slack/               # Slack 通道
│   │   ├── signal/              # Signal 通道
│   │   ├── imessage/            # iMessage 通道
│   │   └── web/                 # WhatsApp Web
│   ├── routing/                 # 路由管理
│   │   ├── resolve-route.ts     # Agent 路由解析
│   │   └── session-key.ts       # 会话键生成
│   ├── config/                  # 配置管理
│   │   ├── load.ts              # 配置加载
│   │   └── schema.ts            # 配置 Schema
│   ├── sessions/                 # 会话管理
│   │   ├── transcript.ts        # 会话记录
│   │   └── context.ts           # 会话上下文
│   ├── gateway/                 # 网关服务
│   │   ├── server-http.ts       # HTTP 服务器
│   │   ├── server-ws.ts         # WebSocket 服务器
│   │   └── server/plugins-http.ts # 插件 HTTP 处理
│   ├── plugins/                 # 插件系统
│   │   ├── load.ts              # 插件加载
│   │   ├── registry.ts          # 插件注册表
│   │   └── runtime.ts           # 插件运行时
│   └── infra/                   # 基础设施
│       ├── outbound/            # 出站消息
│       │   ├── message.ts       # 消息发送
│       │   └── deliver.ts       # 消息分发
│       ├── net/                 # 网络工具
│       ├── path-guards/         # 路径守卫
│       └── exec-safe-bin/       # 安全执行
├── extensions/                   # 扩展插件目录
│   ├── feishu/                  # 飞书插件
│   ├── msteams/                 # Microsoft Teams
│   └── matrix/                  # Matrix
├── docs/                         # 文档
│   ├── channels/                # 通道文档
│   └── reference/               # 参考文档
└── openclaw.mjs                 # CLI 入口
```

### 1.2 核心模块说明

| 模块     | 功能                | 关键文件                   |
| -------- | ------------------- | -------------------------- |
| CLI      | 命令行接口          | `src/cli/build-program.ts` |
| Agent    | AI Agent 执行引擎   | `src/agents/embedded/`     |
| Channels | 消息通道适配器      | `src/channels/`            |
| Routing  | 消息到 Agent 的路由 | `src/routing/`             |
| Gateway  | HTTP/WebSocket 网关 | `src/gateway/`             |
| Plugins  | 插件加载和注册      | `src/plugins/`             |
| Outbound | 统一出站消息处理    | `src/infra/outbound/`      |

### 1.3 启动流程

```typescript
// openclaw.mjs (入口)
buildProgram()
  → cli/command-registry.ts (命令注册)
    → cli/build-program.ts (构建命令树)
      → 各命令处理器
        → src/commands/{command}.ts
```

### 1.4 数据模型

```typescript
// 配置结构
type ClawdbotConfig = {
  version: string;
  agents: Record<string, AgentConfig>; // Agent 定义
  bindings: RoutingBinding[]; // 路由绑定
  channels?: ChannelConfigs; // 通道配置
  tools?: ToolsPolicy; // 工具策略
  gateway?: GatewayConfig; // 网关配置
};

// Agent 配置
type AgentConfig = {
  model: string;
  provider: string;
  instructions?: string;
  tools?: ToolsPolicy;
  fs?: FsPolicy;
};

// 路由绑定
type RoutingBinding = {
  channel?: string; // 通道 ID
  accountId?: string; // 账户 ID
  peer?: PeerBinding; // 对等体绑定
  guild?: GuildBinding; // 群组绑定
  agent: string; // 目标 Agent ID
};
```

---

## 二、插件扩展机制

### 2.1 插件发现机制

OpenClaw 支持四种插件来源：

| 来源      | 路径                      | 说明                   |
| --------- | ------------------------- | ---------------------- |
| Bundled   | 内置                      | `src/plugins/bundled/` |
| Global    | `~/.openclaw/extensions/` | 用户级插件             |
| Workspace | `.openclaw/extensions/`   | 项目级插件             |
| Config    | 自定义路径                | 配置文件指定           |

### 2.2 插件 API 接口

```typescript
// src/plugins/types.ts
type OpenClawPluginApi = {
  // 注册工具
  registerTool: (tool: ToolDefinition, opts?: { name?: string }) => void;

  // 注册钩子
  registerHook: (events: string[], handler: HookHandler, opts?: { priority?: number }) => void;

  // 注册通道
  registerChannel: (registration: { plugin: ChannelPlugin }) => void;

  // 注册命令
  registerCommand: (command: CommandDefinition) => void;

  // 运行时环境
  runtime: PluginRuntime;

  // 配置
  config: ClawdbotConfig;

  // 日志
  logger: Logger;
};

// 插件运行时
type PluginRuntime = {
  config: ClawdbotConfig;
  system: SystemInfo;
  media: MediaPipeline;
  tts: TTSPipeline;
  tools: ToolRegistry;
  channel: ChannelRuntime;
};
```

### 2.3 插件注册表

```typescript
// src/plugins/registry.ts
type PluginRegistry = {
  plugins: PluginRecord[]; // 已加载插件
  tools: PluginToolRegistration[]; // 工具注册
  hooks: PluginHookRegistration[]; // 钩子注册
  channels: PluginChannelRegistration[]; // 通道注册
  providers: PluginProviderRegistration[]; // Provider 注册
  commands: PluginCommandRegistration[]; // 命令注册
  httpRoutes: HttpRouteRegistration[]; // HTTP 路由
  httpHandlers: HttpHandlerRegistration[]; // HTTP 处理器
  gatewayHandlers: GatewayRequestHandlers; // 网关处理器
};

// 通道插件注册
type PluginChannelRegistration = {
  pluginId: string;
  plugin: ChannelPlugin;
};
```

### 2.4 通道插件接口

```typescript
// src/channels/plugins/types.plugin.ts
type ChannelPlugin = {
  // 通道标识
  id: ChannelId;

  // 元数据
  meta: ChannelMeta;

  // 能力声明
  capabilities: ChannelCapabilities;

  // 配置适配器
  config: ChannelConfigAdapter;

  // 状态适配器（监听/探测）
  status?: ChannelStatusAdapter;

  // 出站适配器（发送消息）
  outbound?: ChannelOutboundAdapter;
};
```

---

## 三、安全控制机制

### 3.1 权限分层模型

```
┌─────────────────────────────────────────────────────────────┐
│                     权限控制层级                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Owner 权限层 (最高)                                       │
│     ├── 仅所有者可执行: whatsapp_login, cron, gateway       │
│     └── 标记: ownerOnly: true                               │
│                                                              │
│  2. 工具级别层                                               │
│     ├── 工具白名单: DEFAULT_TOOL_ALLOW                        │
│     ├── 工具黑名单: DEFAULT_TOOL_DENY                         │
│     └── 自定义 allow/deny 策略                              │
│                                                              │
│  3. Provider 层级                                            │
│     ├── 按提供商过滤工具                                      │
│     └── 限制特定功能的可用性                                  │
│                                                              │
│  4. Agent 层级                                                │
│     ├── Agent 特定的工具策略                                  │
│     ├── 文件系统限制                                         │
│     └── 子代理控制                                            │
│                                                              │
│  5. 群组/会话层级                                             │
│     ├── 细粒度的会话级控制                                    │
│     └── 上下文相关的限制                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 工具白/黑名单

```typescript
// 默认允许的工具
const DEFAULT_TOOL_ALLOW = [
  "read",
  "write",
  "edit",
  "apply_patch",
  "exec",
  "process",
  "web_search",
  "session_transcript",
  "memory",
];

// 默认禁止的工具
const DEFAULT_TOOL_DENY = [
  "browser",
  "canvas",
  "nodes",
  "cron",
  "gateway",
  ...CHANNEL_IDS, // 所有通道 ID
  ...PROVIDER_IDS, // 所有 Provider ID
];
```

### 3.3 沙箱路径隔离

```typescript
// 受阻的路径（禁止访问）
const BLOCKED_HOST_PATHS = [
  "/etc",
  "/proc",
  "/sys",
  "/dev",
  "/root",
  "/var/run/docker.sock",
  "/home/.ssh",
  "/root/.ssh",
];

// 路径验证函数
function isPathInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  const relative = path.relative(resolvedRoot, resolvedTarget);

  // 检查路径是否在根目录内
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

// 工作空间限制
function assertWorkspacePath({ filePath, cwd, root }): void {
  // 1. 检查 cwd 是否在 workspace 内
  if (!isPathInside(root, cwd)) {
    throw new Error("Working directory outside workspace");
  }

  // 2. 检查文件路径是否在 workspace 内
  const absolutePath = path.resolve(cwd, filePath);
  if (!isPathInside(root, absolutePath)) {
    throw new Error("File path outside workspace");
  }
}
```

### 3.4 日志脱敏机制

```typescript
// 默认脱敏模式
const DEFAULT_REDACT_PATTERNS = [
  // 环境变量风格
  /\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1/,

  // JSON 风格
  /"(?:apiKey|token|secret|password)"\s*:\s*"([^"]+)"/,

  // API Keys
  /\b(sk-[A-Za-z0-9_-]{8,})\b/,

  // Telegram Bot Tokens
  /\bbot(\d{6,}:[A-Za-z0-9_-]{20,})\b/,

  // OpenAI API Keys
  /\b(sk-ant-[A-Za-z0-9_-]{40,})\b/,

  // Phone numbers
  /\b(\+\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,})\b/,
];

// 脱敏函数
function redactSensitiveData(log: string): string {
  let result = log;

  for (const pattern of DEFAULT_REDACT_PATTERNS) {
    result = result.replace(pattern, (match, ...groups) => {
      const sensitive = groups[groups.length - 1];
      if (!sensitive) return match;

      const redacted = "***";
      if (sensitive.length > 0) {
        // 保留首尾字符用于调试
        const head = sensitive.slice(0, 2);
        const tail = sensitive.slice(-2);
        return `${head}${redacted}${tail}`;
      }
      return redacted;
    });
  }

  return result;
}
```

### 3.5 SSRF 防护

```typescript
// SSRF 防护配置
const SSRF_GUARD = {
  // 允许的主机名白名单
  allowedHostnames: new Set([
    "api.openai.com",
    "api.anthropic.com",
    "cdn.jsdelivr.net",
    "raw.githubusercontent.com",
  ]),

  // 阻止的私有 IP 范围
  blockedIpRanges: [
    { start: "127.0.0.0", end: "127.255.255.255" }, // Loopback
    { start: "10.0.0.0", end: "10.255.255.255" }, // Private Class A
    { start: "172.16.0.0", end: "172.31.255.255" }, // Private Class B
    { start: "192.168.0.0", end: "192.168.255.255" }, // Private Class C
    { start: "169.254.0.0", end: "169.254.255.255" }, // Link-local
  ],

  // DNS 固定（防止 DNS 欺骗）
  dnsPinning: true,

  // 重定向限制
  maxRedirects: 3,
};

// SSRF 检查函数
function checkSsrfUrl(url: string): void {
  const parsed = new URL(url);

  // 检查主机名
  if (!SSRF_GUARD.allowedHostnames.has(parsed.hostname)) {
    throw new Error(`Hostname not allowed: ${parsed.hostname}`);
  }

  // DNS 解析并检查 IP
  const ip = dns.lookupSync(parsed.hostname);
  if (isPrivateIp(ip, SSRF_GUARD.blockedIpRanges)) {
    throw new Error(`Private IP not allowed: ${ip}`);
  }
}
```

### 3.6 工具策略管道

```typescript
// src/agents/tool-policy-pipeline.ts
function isToolAllowedByPolicies(
  name: string,
  policies: ToolsPolicy[],
  context: ToolPolicyContext,
): boolean {
  // 按优先级依次检查每个策略
  for (const policy of policies) {
    if (!isToolAllowedByPolicyName(name, policy, context)) {
      return false;
    }
  }
  return true;
}

// 单个策略检查
function isToolAllowedByPolicyName(
  name: string,
  policy: ToolsPolicy,
  context: ToolPolicyContext,
): boolean {
  // 1. 检查黑名单
  if (policy.deny?.includes(name)) {
    return false;
  }

  // 2. 检查白名单
  if (policy.allow && !policy.allow.includes(name)) {
    return false;
  }

  // 3. 检查 Profile
  if (policy.profile) {
    const profileTools = getProfileTools(policy.profile);
    if (!profileTools.includes(name)) {
      return false;
    }
  }

  // 4. 检查 Owner 专用工具
  if (isOwnerOnlyTool(name) && !context.senderIsOwner) {
    return false;
  }

  return true;
}
```

---

## 四、渠道插件运作原理

### 4.1 入站请求处理

#### 4.1.1 整体流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           入站请求处理链路                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  外部平台                    Gateway                      插件系统           │
│  ┌─────────┐              ┌───────────┐               ┌──────────────┐     │
│  │Telegram │──Webhook────▶│ HTTP      │──路由匹配────▶│ telegram     │     │
│  │飞书     │              │ Server    │               │ 插件处理器   │     │
│  │WhatsApp │──WebSocket──▶│           │               │ feishu       │     │
│  │Slack    │──Webhook────▶│ :18789    │               │ slack        │     │
│  └─────────┘              └───────────┘               └──────────────┘     │
│                                 │                     │                     │
│                                 ▼                     ▼                     │
│                           ┌───────────┐         ┌──────────────┐           │
│                           │ 路由解析   │────────▶│ Agent 执行   │           │
│                           │ 会话键生成 │         │ 生成回复     │           │
│                           └───────────┘         └──────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.1.2 Gateway HTTP 路由

```typescript
// src/gateway/server-http.ts
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // 1. 设置安全头
  setDefaultSecurityHeaders(res);

  // 2. 跳过 WebSocket 升级
  if (req.headers.upgrade?.toLowerCase() === "websocket") {
    return;
  }

  // 3. 按优先级分发
  if (await handleHooksRequest(req, res)) return; // /hooks/*
  if (await handleSlackHttpRequest(req, res)) return; // Slack 专用
  if (await handlePluginRequest(req, res)) return; // 插件路由 ← 关键
  if (await handleOpenAiHttpRequest(req, res)) return; // OpenAI 兼容

  // 4. 返回 404
  res.statusCode = 404;
  res.end("Not Found");
}
```

#### 4.1.3 插件路由匹配

```typescript
// src/gateway/server/plugins-http.ts
export function createGatewayPluginRequestHandler(
  registry: PluginRegistry,
): PluginHttpRequestHandler {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    // 1. 检查注册的 HTTP 路由
    const routes = registry.httpRoutes ?? [];
    const route = routes.find((entry) => entry.path === url.pathname);

    if (route) {
      await route.handler(req, res);
      return true;
    }

    // 2. 遍历插件通用处理器
    for (const entry of registry.httpHandlers ?? []) {
      const handled = await entry.handler(req, res);
      if (handled) return true;
    }

    return false;
  };
}
```

#### 4.1.4 通道注册

```typescript
// src/channels/registry.ts
export const CHAT_CHANNEL_ORDER = [
  "telegram",
  "whatsapp",
  "discord",
  "irc",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;

// 通道元数据
const CHAT_CHANNEL_META: Record<ChatChannelId, ChannelMeta> = {
  telegram: {
    id: "telegram",
    label: "Telegram",
    docsPath: "/channels/telegram",
    systemImage: "paperplane",
  },
  feishu: {
    id: "feishu",
    label: "Feishu",
    docsPath: "/channels/feishu",
    systemImage: "paperplane",
  },
  // ...
};
```

#### 4.1.5 完整入站处理流程

```
步骤 1: HTTP 请求到达 Gateway
─────────────────────────────
POST /feishu/events HTTP/1.1
Host: gateway.example.com:18789
Content-Type: application/json

{
  "schema": "2.0",
  "header": { "event_id": "xxx", "event_type": "im.message.receive_v1" },
  "event": { "message": { "content": "...", "chat_id": "xxx" } }
}

步骤 2: Gateway 路由匹配
───────────────────────
handlePluginRequest()
  → registry.httpRoutes.find("/feishu/events")
  → 找到飞书插件处理器

步骤 3: 飞书插件处理
───────────────────
extensions/feishu/src/monitor.ts
  → eventDispatcher.register("im.message.receive_v1")
  → handleFeishuMessage()

步骤 4: 消息解析和验证
─────────────────────
extensions/feishu/src/bot.ts
  - 解析消息类型 (text/post/image/file/...)
  - 提取文本内容/媒体
  - 检查 @mentions
  - 验证发送者权限

步骤 5: 路由解析 - 决定由哪个 Agent 处理
─────────────────────────────────────
src/routing/resolve-route.ts

resolveAgentRoute({
  cfg: config,
  channel: "feishu",
  accountId: "default",
  peer: { kind: "direct", id: "ou_xxx" },  // 发送者 ID
  guildId: "oc_xxx",                        // 群组 ID（如果是群聊）
})

路由优先级:
  1. binding.peer      → 精确匹配特定用户
  2. binding.guild     → 匹配群组配置
  3. binding.account   → 匹配账户配置
  4. binding.channel   → 通道默认 Agent
  5. default           → 全局默认 Agent

返回: { agentId: "my-agent", matchedBy: "binding.channel" }

步骤 6: 会话键生成
─────────────────
src/routing/session-key.ts

buildAgentSessionKey({
  agentId: "my-agent",
  channel: "feishu",
  accountId: "default",
  peer: { kind: "direct", id: "ou_xxx" },
  dmScope: "per-peer",  // 配置决定会话隔离级别
})

返回: "agent:my-agent:feishu:default:direct:ou_xxx"

步骤 7: Agent 执行
─────────────────
src/agents/run → 调用 AI 模型 → 生成回复
```

#### 4.1.6 通道标识符传递链

```
外部请求 → HTTP路径 → 通道ID → 插件 → Agent
   │          │         │        │       │
   │          ▼         ▼        ▼       ▼
   │    /feishu/events  feishu  feishu  my-agent
   │    /telegram/webhook telegram telegram default
   │    /slack/events    slack   slack  support-bot
```

### 4.2 出站消息处理

#### 4.2.1 整体流程

```
Agent 回复
    │
    ▼
src/infra/outbound/outbound-send-service.ts
executeSendAction({ channel: "feishu", to: "ou_xxx", content: "你好" })
    │
    ▼
src/infra/outbound/message.ts
sendMessage({ channel, to, content })
    │
    ├── 解析通道配置
    │   const channel = await resolveRequiredChannel({ cfg, channel: "feishu" });
    │
    ├── 加载插件适配器
    │   const plugin = resolveRequiredPlugin(channel);
    │   // plugin.outbound = feishuOutbound
    │
    └── 调用适配器发送
        if (deliveryMode === "direct") {
          await deliverOutboundPayloads({ outbound: plugin.outbound, ... });
        } else {
          await callMessageGateway({ method: "send", ... });
        }
    │
    ▼
src/infra/outbound/deliver.ts
deliverOutboundPayloadsCore({ handler, payloads })
    │
    ├── 运行 message_sending 钩子
    │
    └── 调用插件发送方法
        await handler.sendText({ cfg, to, text });
```

#### 4.2.2 出站适配器接口

```typescript
// src/channels/plugins/types.plugin.ts
type ChannelOutboundAdapter = {
  // 发送模式
  deliveryMode: "direct" | "gateway";

  // 文本分块配置
  chunker?: (text: string, limit: number) => string[];
  chunkerMode?: "plain" | "markdown";
  textChunkLimit?: number;

  // 必须实现的发送方法
  sendText: (params: SendTextParams) => Promise<SendResult>;

  // 可选的发送方法
  sendMedia?: (params: SendMediaParams) => Promise<SendResult>;
  sendPayload?: (params: SendPayloadParams) => Promise<SendResult>;
};

// 发送参数
type SendTextParams = {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  accountId?: string;
  replyToMessageId?: string;
  mentions?: MentionTarget[];
};

// 发送结果
type SendResult = {
  channel: ChannelId;
  messageId: string;
  success: boolean;
  error?: string;
};
```

#### 4.2.3 飞书插件出站实现

```typescript
// extensions/feishu/src/outbound.ts
export const feishuOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",

  // 分块配置
  chunker: (text, limit) => {
    return getFeishuRuntime().channel.text.chunkMarkdownText(text, limit);
  },
  chunkerMode: "markdown",
  textChunkLimit: 4000, // 飞书消息长度限制

  // 发送文本
  sendText: async ({ cfg, to, text, accountId }) => {
    const result = await sendMessageFeishu({
      cfg,
      to,
      text,
      accountId: accountId ?? undefined,
    });
    return {
      channel: "feishu",
      messageId: result.messageId,
      success: true,
    };
  },

  // 发送媒体
  sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
    // 1. 先发送文本（如果有）
    if (text?.trim()) {
      await sendMessageFeishu({ cfg, to, text, accountId });
    }

    // 2. 上传并发送媒体
    if (mediaUrl) {
      try {
        const result = await sendMediaFeishu({ cfg, to, mediaUrl, accountId });
        return { channel: "feishu", messageId: result.messageId };
      } catch (err) {
        // 回退：发送链接
        const fallbackText = `📎 ${mediaUrl}`;
        await sendMessageFeishu({ cfg, to, text: fallbackText, accountId });
      }
    }
  },
};
```

#### 4.2.4 消息格式转换

```
Agent 输出
    │
    │  "**重要通知**\n\n请查看 [文档](https://example.com)"
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│                    格式转换层                                  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Telegram:                                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ <b>重要通知</b>                                          │ │
│  │                                                          │ │
│  │ 请查看 <a href="...">文档</a>                            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  飞书:                                                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ { "zh_cn": { "content": [[                               │ │
│  │   [{ "tag": "text", "text": "重要通知", "style": [] }],  │ │
│  │   [{ "tag": "a", "text": "文档", "href": "..." }]        │ │
│  │ ]]}}                                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Signal:                                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ *重要通知*                                                │ │
│  │                                                          │ │
│  │ 请查看 文档 (https://example.com)                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 4.3 Telegram 通道实现

#### 4.3.1 目录结构

```
src/telegram/
├── bot.ts                    # Bot 创建、消息路由、去重
├── bot-message.ts            # 消息上下文构建
├── bot-message-dispatch.ts   # 消息分发、流式响应
├── send.ts                   # 出站消息发送
├── webhook.ts                # Webhook 服务器
├── format.ts                 # Markdown → HTML 转换
├── config.ts                 # 配置解析
└── client.ts                 # Botgramy 客户端
```

#### 4.3.2 入站流程

```typescript
// src/telegram/bot.ts
async function createTelegramBot(account: TelegramAccount): Promise<grammy.Bot> {
  const bot = new grammy.Bot(account.token);

  // 配置限流器
  bot.api.config.use(throttleer());

  // 配置自动重试
  bot.api.config.use(autoRetry());

  // 配置消息处理器
  bot.on("message", async (ctx) => {
    // 1. 去重检查
    const key = `${ctx.message.chat.id}:${ctx.message.message_id}`;
    if (isDuplicateUpdate(key)) {
      return;
    }

    // 2. 构建消息上下文
    const messageContext = await buildMessageContext(ctx);

    // 3. 分发消息
    await dispatchMessage(messageContext);
  });

  return bot;
}
```

#### 4.3.3 去重机制

```typescript
// 使用内存 + 磁盘双重检查
const UPDATE_DUPES = new LRUCache<string, number>({ max: 2000 });
const UPDATE_DUPE_TTL = 5 * 60 * 1000; // 5分钟

function isDuplicateUpdate(key: string): boolean {
  // 1. 内存检查
  const lastSeen = UPDATE_DUPES.get(key);
  if (lastSeen && Date.now() - lastSeen < UPDATE_DUPE_TTL) {
    return true;
  }

  // 2. 磁盘检查
  const dupePath = path.join(getDupesPath(), `${key}.json`);
  if (fs.existsSync(dupePath)) {
    const data = JSON.parse(fs.readFileSync(dupePath, "utf8"));
    if (Date.now() - data.timestamp < UPDATE_DUPE_TTL) {
      return true;
    }
  }

  // 3. 记录
  UPDATE_DUPES.set(key, Date.now());
  fs.writeFileSync(dupePath, JSON.stringify({ timestamp: Date.now() }));

  return false;
}
```

#### 4.3.4 媒体组处理

```typescript
// 500ms 收集窗口，用于批量处理媒体组
const MEDIA_GROUP_COLLECTORS = new Map<string, MediaGroupCollector>();

async function handleMediaGroup(message: grammy.Message): Promise<void> {
  const groupId = message.media_group_id;
  const chatId = message.chat.id;

  // 获取或创建收集器
  let collector = MEDIA_GROUP_COLLECTORS.get(groupId);
  if (!collector) {
    collector = {
      messages: [],
      timer: setTimeout(() => {
        // 超时后处理收集的消息
        processCollectedMediaGroup(collector!);
        MEDIA_GROUP_COLLECTORS.delete(groupId);
      }, 500),
    };
    MEDIA_GROUP_COLLECTORS.set(groupId, collector);
  }

  // 添加消息
  collector.messages.push(message);
}
```

### 4.4 飞书通道插件

#### 4.4.1 目录结构

```
extensions/feishu/
├── index.ts                  # 插件注册
├── openclaw.plugin.json      # 插件配置
├── package.json
└── src/
    ├── channel.ts            # 通道定义
    ├── monitor.ts            # WebSocket/Webhook 监听
    ├── bot.ts                # 消息解析
    ├── send.ts               # 出站消息
    ├── client.ts             # Lark SDK 封装
    ├── outbound.ts           # 出站适配器
    ├── mention.ts            # @提及处理
    └── skills/               # 飞书工具
        ├── wiki.ts           # 知识库
        ├── docx.ts           # 文档
        ├── drive.ts          # 云盘
        └── bitable.ts        # 多维表格
```

#### 4.4.2 插件注册

```typescript
// extensions/feishu/index.ts
const plugin = {
  id: "feishu",
  name: "Feishu",
  description: "Feishu/Lark channel plugin",

  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    setFeishuRuntime(api.runtime);

    // 注册通道
    api.registerChannel({ plugin: feishuPlugin });

    // 注册工具
    registerFeishuWikiTools(api);
    registerFeishuDocTools(api);
    registerFeishuDriveTools(api);
    registerFeishuBitableTools(api);
    registerFeishuPermTools(api);
  },
};

export default plugin;
```

#### 4.4.3 连接模式

飞书支持两种连接模式：

| 模式      | 说明            | 配置                          |
| --------- | --------------- | ----------------------------- |
| WebSocket | 实时消息推送    | `connectionMode: "websocket"` |
| Webhook   | HTTP 服务器接收 | `connectionMode: "webhook"`   |

```typescript
// extensions/feishu/src/monitor.ts
async function monitor(params: MonitorParams): Promise<void> {
  const mode = account.config.connectionMode ?? "websocket";

  if (mode === "webhook") {
    await monitorWebhook({ params, accountId, eventDispatcher });
  } else {
    await monitorWebSocket({ params, accountId, eventDispatcher });
  }
}
```

#### 4.4.4 WebSocket 监听

```typescript
async function monitorWebSocket({ params, accountId, eventDispatcher }: ConnectionParams) {
  const { account, runtime, abortSignal } = params;
  const log = runtime?.log ?? console.log;

  log(`feishu[${accountId}]: starting WebSocket connection...`);

  // 创建 WebSocket 客户端
  const wsClient = createFeishuWSClient(account);
  wsClients.set(accountId, wsClient);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      wsClients.delete(accountId);
      botOpenIds.delete(accountId);
    };

    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    try {
      wsClient.start({ eventDispatcher });
      log(`feishu[${accountId}]: WebSocket client started`);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
```

#### 4.4.5 Webhook 监听

```typescript
async function monitorWebhook({ params, accountId, eventDispatcher }: ConnectionParams) {
  const { account, runtime, abortSignal } = params;
  const log = runtime?.log ?? console.log;

  const port = account.config.webhookPort ?? 3000;
  const path = account.config.webhookPath ?? "/feishu/events";
  const host = account.config.webhookHost ?? "127.0.0.1";

  log(`feishu[${accountId}]: starting Webhook server on ${host}:${port}, path ${path}...`);

  // 创建 HTTP 服务器
  const server = http.createServer();

  // 注册事件处理器
  registerEventHandlers(eventDispatcher, { cfg, accountId, runtime });

  // 使用 Lark SDK 的适配器
  const webhookHandler = Lark.adaptDefault(path, eventDispatcher, {
    autoChallenge: true, // 自动处理验证挑战
  });

  server.on("request", (req, res) => {
    // 请求体限制和内容验证
    const guard = installRequestBodyLimitGuard(req, res, {
      maxBytes: FEISHU_WEBHOOK_MAX_BODY_BYTES,
      timeoutMs: FEISHU_WEBHOOK_BODY_TIMEOUT_MS,
      responseFormat: "text",
    });

    void Promise.resolve(webhookHandler(req, res))
      .catch((err) => {
        error(`feishu[${accountId}]: webhook handler error: ${String(err)}`);
      })
      .finally(() => {
        guard.dispose();
      });
  });

  // 启动服务器
  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  httpServers.set(accountId, server);
}
```

#### 4.4.6 消息解析

```typescript
// extensions/feishu/src/bot.ts
function parseMessageContent(content: string, messageType: string): string {
  try {
    const parsed = JSON.parse(content);

    if (messageType === "text") {
      return parsed.text || "";
    }

    if (messageType === "post") {
      // 解析富文本内容
      const { textContent } = parsePostContent(content);
      return textContent;
    }

    return content;
  } catch {
    return content;
  }
}

// 富文本解析
function parsePostContent(content: string): {
  textContent: string;
  imageKeys: string[];
  mentionedOpenIds: string[];
} {
  try {
    const parsed = JSON.parse(content);
    const title = parsed.title || "";
    const contentBlocks = parsed.content || [];

    let textContent = title ? `${title}\n\n` : "";
    const imageKeys: string[] = [];
    const mentionedOpenIds: string[] = [];

    for (const paragraph of contentBlocks) {
      if (Array.isArray(paragraph)) {
        for (const element of paragraph) {
          if (element.tag === "text") {
            textContent += element.text || "";
          } else if (element.tag === "a") {
            // 链接
            textContent += element.text || element.href || "";
          } else if (element.tag === "at") {
            // @提及
            textContent += `@${element.user_name || element.user_id || ""}`;
            if (element.user_id) {
              mentionedOpenIds.push(element.user_id);
            }
          } else if (element.tag === "img" && element.image_key) {
            // 嵌入图片
            const imageKey = normalizeFeishuExternalKey(element.image_key);
            if (imageKey) {
              imageKeys.push(imageKey);
            }
          }
        }
        textContent += "\n";
      }
    }

    return {
      textContent: textContent.trim() || "[Rich text message]",
      imageKeys,
      mentionedOpenIds,
    };
  } catch {
    return {
      textContent: "[Rich text message]",
      imageKeys: [],
      mentionedOpenIds: [],
    };
  }
}
```

#### 4.4.7 支持的消息类型

| 类型      | 说明       | 处理方式                                |
| --------- | ---------- | --------------------------------------- |
| `text`    | 纯文本消息 | 直接提取 text                           |
| `post`    | 富文本消息 | 解析 content 结构，提取文本、图片、链接 |
| `image`   | 图片消息   | 提取 image_key                          |
| `file`    | 文件消息   | 提取 file_key                           |
| `audio`   | 音频消息   | 提取 file_key                           |
| `video`   | 视频消息   | 提取 file_key                           |
| `sticker` | 贴纸消息   | 提取 sticker_id                         |

### 4.5 Webhook/WebSocket 通信处理

#### 4.5.1 Webhook 处理流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Webhook 处理流程                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  外部平台          Gateway          插件系统              Agent              │
│  ┌──────┐       ┌─────────┐      ┌─────────────┐      ┌─────────┐          │
│  │      │  POST │ HTTP    │      │ Event      │      │ AI      │          │
│  │ 飞书 │──────▶│ Server  │─────▶│ Dispatcher │─────▶│ 处理    │          │
│  │      │       │ :18789  │      │             │      │         │          │
│  └──────┘       └─────────┘      └─────────────┘      └─────────┘          │
│     │                │                  │                  │                │
│     │                │                  │                  │                │
│     ▼                ▼                  ▼                  ▼                │
│  立即返回 200    签名验证          消息解析          生成回复            │
│  OK               事件类型识别      路由匹配            发送回复           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.5.2 WebSocket 处理流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WebSocket 处理流程                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  外部平台          WebSocket Client          插件系统              Agent     │
│  ┌──────┐       ┌─────────────┐          ┌─────────────┐      ┌─────────┐  │
│  │      │       │ Lark SDK    │          │ Event       │      │ AI      │  │
│  │ 飞书 │◀──────│ WebSocket   │──────────▶│ Dispatcher │─────▶│ 处理    │  │
│  │      │       │ Client      │          │             │      │         │  │
│  └──────┘       └─────────────┘          └─────────────┘      └─────────┘  │
│     │                  │                     │                  │            │
│     │                  │                     │                  │            │
│     ▼                  ▼                     ▼                  ▼            │
│  消息推送         连接保持            消息解析           生成回复            │
│  事件订阅         心跳检测            路由匹配            发送回复           │
│                  断线重连                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.5.3 路由优先级

```typescript
// src/routing/resolve-route.ts

// 路由优先级 (从高到低)
const ROUTE_PRIORITY = [
  "binding.peer", // 1. Peer 级别绑定 (最精确)
  "binding.guild", // 2. Guild + Roles 绑定 (Discord 特有)
  "binding.guild", // 3. Guild 绑定
  "binding.account", // 4. Account 绑定
  "binding.channel", // 5. Channel 绑定
  "default", // 6. 默认绑定
];

// 路由匹配函数
function resolveAgentRoute(params: ResolveRouteParams): AgentRoute {
  const { cfg, channel, accountId, peer, guildId } = params;

  // 1. 检查 Peer 级别绑定
  if (peer) {
    const peerBinding = cfg.bindings.find(
      (b) => b.channel === channel && b.accountId === accountId && b.peer?.id === peer.id,
    );
    if (peerBinding) {
      return { agentId: peerBinding.agent, matchedBy: "binding.peer" };
    }
  }

  // 2. 检查 Guild 级别绑定
  if (guildId) {
    const guildBinding = cfg.bindings.find(
      (b) => b.channel === channel && b.accountId === accountId && b.guild?.id === guildId,
    );
    if (guildBinding) {
      return { agentId: guildBinding.agent, matchedBy: "binding.guild" };
    }
  }

  // 3. 检查 Account 级别绑定
  const accountBinding = cfg.bindings.find(
    (b) => b.channel === channel && b.accountId === accountId && !b.peer && !b.guild,
  );
  if (accountBinding) {
    return { agentId: accountBinding.agent, matchedBy: "binding.account" };
  }

  // 4. 检查 Channel 级别绑定
  const channelBinding = cfg.bindings.find(
    (b) => b.channel === channel && !b.accountId && !b.peer && !b.guild,
  );
  if (channelBinding) {
    return { agentId: channelBinding.agent, matchedBy: "binding.channel" };
  }

  // 5. 返回默认 Agent
  return { agentId: "default", matchedBy: "default" };
}
```

---

## 五、Agent 安全执行控制

### 5.1 安全控制层级

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Agent 安全控制层级                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 1. 工具级别控制                                                         │  │
│  │    ├── 白名单: 只允许指定的工具                                        │  │
│  │    ├── 黑名单: 禁止指定的工具                                          │  │
│  │    ├── Owner 专用: 仅所有者可执行                                      │  │
│  │    └── Profile 预设: 使用预设的工具集                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                │                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 2. 文件系统控制                                                         │  │
│  │    ├── 工作空间限制: 只能在指定目录内操作                              │  │
│  │    ├── 路径验证: 防止路径逃逸攻击                                      │  │
│  │    ├── 受阻路径: 禁止访问敏感目录                                      │  │
│  │    └── 符号链接检查: 防止绕过限制                                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                │                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 3. 命令执行控制                                                         │  │
│  │    ├── 安全二进制列表: 只允许执行白名单命令                           │  │
│  │    ├── 参数过滤: 限制命令参数                                          │  │
│  │    ├── Shell 转义: 防止命令注入                                        │  │
│  │    └── 超时控制: 限制执行时间                                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                │                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 4. 网络访问控制                                                         │  │
│  │    ├── SSRF 防护: 防止服务器端请求伪造                                  │  │
│  │    ├── 主机名白名单: 只允许访问指定域名                                │  │
│  │    ├── 私有 IP 过滤: 阻止访问内网地址                                  │  │
│  │    ├── DNS 固定: 防止 DNS 欺骗                                         │  │
│  │    └── 重定向限制: 限制重定向次数                                       │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                │                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 5. 子代理控制                                                           │  │
│  │    ├── 工具继承: 子代理的工具是父代理的子集                            │  │
│  │    ├── 禁止的工具: 子代理永远无法执行某些操作                          │  │
│  │    ├── 深度限制: 限制子代理嵌套深度                                     │  │
│  │    └── 审计日志: 记录所有子代理调用                                    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 实现细粒度权限控制

#### 5.2.1 多层策略管道

```typescript
// src/agents/tool-policy-pipeline.ts
function isToolAllowedByPolicies(
  name: string,
  policies: ToolsPolicy[],
  context: ToolPolicyContext,
): boolean {
  // 按优先级依次检查每个策略
  for (const policy of policies) {
    if (!isToolAllowedByPolicyName(name, policy, context)) {
      return false;
    }
  }
  return true;
}
```

#### 5.2.2 工具白名单 + 黑名单

```typescript
const policy = {
  allow: ["read", "write", "exec", "web_search"],
  deny: ["gateway", "cron", "browser"],
};

function isToolAllowedByPolicyName(
  name: string,
  policy: ToolsPolicy,
  context: ToolPolicyContext,
): boolean {
  // 1. 检查黑名单
  if (policy.deny?.includes(name)) {
    return false;
  }

  // 2. 检查白名单
  if (policy.allow && !policy.allow.includes(name)) {
    return false;
  }

  return true;
}
```

#### 5.2.3 工作空间限制

```typescript
const fsPolicy = createToolFsPolicy({ workspaceOnly: true });
const wrapped = wrapToolWorkspaceRootGuard(tool, workspaceRoot);

function wrapToolWorkspaceRootGuard<T extends ToolDefinition>(tool: T, workspaceRoot: string): T {
  const originalExecute = tool.execute;

  return {
    ...tool,
    async execute(...args: Parameters<T["execute"]>) {
      // 执行前检查路径
      const filePath = extractFilePathFromArgs(args);
      if (filePath) {
        await assertSandboxPath({
          filePath,
          cwd: process.cwd(),
          root: workspaceRoot,
        });
      }

      return originalExecute(...args);
    },
  };
}
```

#### 5.2.4 沙箱路径验证

```typescript
async function assertSandboxPath({ filePath, cwd, root }: SandboxPathCheckParams): Promise<void> {
  // 1. 检查 cwd 是否在 workspace 内
  const cwdAbsolute = path.resolve(cwd);
  const rootAbsolute = path.resolve(root);
  const cwdRelative = path.relative(rootAbsolute, cwdAbsolute);

  if (cwdRelative.startsWith("..") || path.isAbsolute(cwdRelative)) {
    throw new Error("Working directory outside workspace");
  }

  // 2. 检查文件路径是否在 workspace 内
  const fileAbsolute = path.resolve(cwd, filePath);
  const fileRelative = path.relative(rootAbsolute, fileAbsolute);

  if (fileRelative.startsWith("..") || path.isAbsolute(fileRelative)) {
    throw new Error("File path outside workspace");
  }

  // 3. 检查符号链接
  const realPath = await fs.realpath(fileAbsolute);
  const realRelative = path.relative(rootAbsolute, realPath);

  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error("Symbolic link outside workspace");
  }

  // 4. 检查受阻路径
  for (const blocked of BLOCKED_HOST_PATHS) {
    if (realPath.startsWith(blocked)) {
      throw new Error(`Access to blocked path: ${blocked}`);
    }
  }
}
```

#### 5.2.5 安全命令执行

```typescript
// src/infra/exec-safe-bin-runtime-policy.ts
const SAFE_BINS = {
  git: {
    allowArgs: ["status", "log", "diff", "show", "branch"],
    blockArgs: ["rm", "clean", "reset", "push", "pull"],
  },
  npm: {
    allowArgs: ["install", "run", "list", "info"],
    blockArgs: ["uninstall", "publish"],
  },
};

function checkSafeBinCommand(command: string, args: string[]): void {
  // 1. 检查命令是否在白名单中
  const safeBin = SAFE_BINS[command];
  if (!safeBin) {
    throw new Error(`Command not allowed: ${command}`);
  }

  // 2. 检查参数
  const mainArg = args[0];
  if (safeBin.blockArgs?.includes(mainArg)) {
    throw new Error(`Argument not allowed: ${command} ${mainArg}`);
  }

  if (safeBin.allowArgs && !safeBin.allowArgs.includes(mainArg)) {
    throw new Error(`Argument not allowed: ${command} ${mainArg}`);
  }
}
```

#### 5.2.6 Owner 专用工具过滤

```typescript
function applyOwnerOnlyToolPolicy(
  tools: ToolDefinition[],
  senderIsOwner: boolean,
): ToolDefinition[] {
  if (senderIsOwner) {
    return tools;
  }

  return tools.filter((t) => !isOwnerOnlyTool(t));
}

function isOwnerOnlyTool(tool: ToolDefinition): boolean {
  const ownerOnlyTools = [
    "gateway",
    "whatsapp_login",
    "cron",
    "agents_list",
    "agents_create",
    "agents_delete",
  ];

  return ownerOnlyTools.includes(tool.name);
}
```

#### 5.2.7 子代理工具限制

```typescript
const SUBAGENT_TOOL_DENY_ALWAYS = [
  "gateway",
  "agents_list",
  "whatsapp_login",
  "cron",
  "memory_search",
];

function prepareSubagentTools(
  parentTools: ToolDefinition[],
  agentConfig: AgentConfig,
): ToolDefinition[] {
  // 1. 父代理工具作为基础
  let tools = parentTools;

  // 2. 应用 Agent 级别的工具策略
  if (agentConfig.tools) {
    tools = applyToolPolicy(tools, agentConfig.tools);
  }

  // 3. 过滤子代理永远禁止的工具
  tools = tools.filter((t) => !SUBAGENT_TOOL_DENY_ALWAYS.includes(t.name));

  // 4. 应用安全工具集合
  if (agentConfig.profile) {
    const profileTools = getProfileTools(agentConfig.profile);
    tools = tools.filter((t) => profileTools.includes(t.name));
  }

  return tools;
}
```

### 5.3 配置示例

```yaml
# openclaw.config.yaml
version: "2"

agents:
  my-agent:
    model: claude-sonnet-4.5
    provider: anthropic
    instructions: "你是一个代码助手"
    tools:
      profile: coding # minimal | coding | messaging | full
      allow:
        - read
        - write
        - exec
        - web_search
      deny:
        - browser
        - canvas
    fs:
      workspaceOnly: true
      allowedPaths:
        - /workspace
        - /workspace/src

tools:
  profile: coding
  allow:
    - read
    - write
    - exec
    - web_search
    - session_transcript
  deny:
    - gateway
    - cron
    - browser
  byProvider:
    anthropic:
      profile: full

sandbox:
  enabled: true
  root: /workspace
  network:
    allowPrivateNetwork: false
    allowedHostnames:
      - api.github.com
      - npmjs.org
      - registry.npmjs.org
    blockedIpRanges:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"

exec:
  safeBins:
    git:
      allowArgs:
        - status
        - log
        - diff
      blockArgs:
        - clean
        - reset
    npm:
      allowArgs:
        - install
        - run
        - list
```

---

## 六、开发指南

### 6.1 插件开发清单

开发一个新的渠道插件，需要实现：

```typescript
// 1. 插件入口
export default {
  id: "my-channel",
  name: "My Channel",

  register(api: OpenClawPluginApi) {
    // 2. 注册通道
    api.registerChannel({ plugin: myChannelPlugin });

    // 3. 注册 HTTP 路由（如果需要 Webhook）
    api.registerHttpRoute({
      path: "/my-channel/webhook",
      handler: handleWebhook,
    });

    // 4. 注册专用工具（可选）
    api.registerTool(
      {
        name: "my_channel_action",
        description: "Perform action on My Channel",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string" },
          },
        },
        async execute(_toolCallId, params) {
          // 实现
        },
      },
      { name: "my_channel" },
    );
  },
};

// 5. 通道插件定义
const myChannelPlugin: ChannelPlugin = {
  id: "my-channel",
  meta: {
    id: "my-channel",
    label: "My Channel",
    docsPath: "/channels/my-channel",
    systemImage: "paperplane",
  },
  capabilities: {
    text: true,
    media: true,
    mentions: true,
    threads: false,
  },

  // 6. 配置适配器
  config: {
    resolveAccount: (params) => {
      const accountId = normalizeAccountId(params.accountId);
      const channelCfg = params.cfg.channels?.my_channel;

      return {
        accountId,
        enabled: channelCfg?.enabled !== false,
        configured: Boolean(channelCfg?.token),
        // ... 其他配置
      };
    },
    resolveAllowFrom: (account) => account.config.allowFrom,
  },

  // 7. 状态/监听适配器
  status: {
    monitor: async (params) => {
      // 启动 WebSocket/Webhook 监听
      const mode = account.config.connectionMode ?? "webhook";

      if (mode === "webhook") {
        await startWebhookServer({ params });
      } else {
        await startWebSocketClient({ params });
      }
    },
    probe: async (params) => {
      // 检查连接状态
      const client = createMyChannelClient(account);
      await client.checkStatus();
      return { status: "connected" };
    },
  },

  // 8. 出站适配器（必须实现）
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4096,
    chunker: (text, limit) => {
      // 实现分块逻辑
      return splitTextIntoChunks(text, limit);
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      // 发送文本消息
      const account = resolveMyChannelAccount({ cfg, accountId });
      const client = createMyChannelClient(account);

      const result = await client.sendMessage({
        to,
        text: convertMarkdownToMyChannelFormat(text),
      });

      return {
        channel: "my-channel",
        messageId: result.id,
        success: true,
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
      // 发送媒体消息
      const account = resolveMyChannelAccount({ cfg, accountId });
      const client = createMyChannelClient(account);

      // 上传媒体
      const media = await client.uploadMedia({ url: mediaUrl });

      // 发送消息
      const result = await client.sendMediaMessage({
        to,
        mediaId: media.id,
        caption: text ?? "",
      });

      return {
        channel: "my-channel",
        messageId: result.id,
        success: true,
      };
    },
  },
};

// 8. 入站消息处理
async function handleInboundMessage(event: MyChannelEvent) {
  // a. 解析消息
  const message = parseMessage(event);

  // b. 路由解析
  const route = resolveAgentRoute({
    cfg: config,
    channel: "my-channel",
    accountId: "default",
    peer: { kind: "direct", id: message.senderId },
  });

  // c. 构建 Agent 输入
  const agentInput = {
    agentId: route.agentId,
    sessionId: buildAgentSessionKey({
      agentId: route.agentId,
      channel: "my-channel",
      accountId: "default",
      peer: { kind: "direct", id: message.senderId },
    }),
    content: message.text,
    mediaUrls: message.mediaUrls,
    senderId: message.senderId,
  };

  // d. 调用 Agent 执行
  const response = await runEmbeddedPiAgent(agentInput);

  // e. 发送回复
  await sendMessageMyChannel({
    to: message.senderId,
    text: response.content,
    mediaUrls: response.mediaUrls,
  });
}

// 9. Webhook 处理器（如果使用 Webhook）
async function handleWebhook(req: IncomingMessage, res: ServerResponse) {
  // 验证签名
  const signature = req.headers["x-my-channel-signature"];
  if (!verifySignature(signature, req)) {
    res.statusCode = 401;
    res.end("Invalid signature");
    return;
  }

  // 立即返回 200
  res.statusCode = 200;
  res.end("OK");

  // 异步处理事件
  const body = await readRequestBody(req);
  const event = JSON.parse(body) as MyChannelEvent;

  await handleInboundMessage(event);
}

// 10. 格式转换函数
function convertMarkdownToMyChannelFormat(markdown: string): string {
  // 实现平台特定的 Markdown 转换
  // 例如：**bold** → <b>bold</b> 或其他格式
  return markdown
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
```

### 6.2 关键文件位置

| 功能          | 文件路径                                    |
| ------------- | ------------------------------------------- |
| 通道注册表    | `src/channels/registry.ts`                  |
| 路由解析      | `src/routing/resolve-route.ts`              |
| 会话键生成    | `src/routing/session-key.ts`                |
| 插件加载      | `src/plugins/load.ts`                       |
| 出站消息      | `src/infra/outbound/message.ts`             |
| 消息分发      | `src/infra/outbound/deliver.ts`             |
| 工具策略      | `src/agents/tool-policy-pipeline.ts`        |
| 路径守卫      | `src/infra/path-guards/`                    |
| 安全执行      | `src/infra/exec-safe-bin-runtime-policy.ts` |
| Telegram 实现 | `src/telegram/`                             |
| 飞书插件      | `extensions/feishu/`                        |

### 6.3 调试技巧

#### 6.3.1 查看路由匹配

```bash
# 查看路由解析结果
openclaw routing resolve \
  --channel telegram \
  --accountId default \
  --peer "123456789"
```

#### 6.3.2 测试消息发送

```bash
# 发送测试消息
openclaw message send \
  --channel telegram \
  --to "123456789" \
  "Hello, world!"
```

#### 6.3.3 查看 Gateway 日志

```bash
# 查看 Gateway 日志
tail -f /tmp/openclaw-gateway.log

# 使用 macOS 统一日志
./scripts/clawlog.sh tail --category openclaw
```

---

## 附录

### A. 术语表

| 术语             | 说明                                 |
| ---------------- | ------------------------------------ |
| Agent            | AI 智能体，负责处理消息并生成回复    |
| Channel          | 消息通道，如 Telegram、飞书等        |
| Plugin           | 插件，扩展 OpenClaw 功能的模块       |
| Binding          | 路由绑定，将消息路由到特定 Agent     |
| Session Key      | 会话键，标识唯一的会话               |
| Outbound Adapter | 出站适配器，处理消息发送             |
| Workspace        | 工作空间，Agent 的文件操作范围       |
| Profile          | 配置预设，如 coding、messaging、full |

### B. 参考资料

- [OpenClaw 文档](https://docs.openclaw.ai)
- [插件开发指南](https://docs.openclaw.ai/reference/plugins)
- [通道配置](https://docs.openclaw.ai/configuration/channels)
- [安全指南](https://docs.openclaw.ai/security)

---

_文档版本: 1.0_
_最后更新: 2026-02-24_
