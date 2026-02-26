# OpenClaw 插件系统技术分析

## 概述

OpenClaw 采用基于注册式的插件架构，支持通道(Channel)、模型提供者(Provider)、记忆(Memory)、工具(Tool)、钩子(Hook)、服务(Service)等多种扩展类型。插件通过统一的发现-加载-注册流程接入系统，启用状态由多层配置规则决定。

核心代码位于 `src/plugins/` 目录，CLI 入口在 `src/cli/plugins-cli.ts`，配置类型定义在 `src/config/types.plugins.ts`。

---

## 1. 插件目录结构

每个插件位于 `extensions/<plugin-name>/` 下，典型结构如下：

```
extensions/<plugin-name>/
  package.json            # npm 包清单，包含 openclaw.extensions 入口声明
  openclaw.plugin.json    # 插件清单，声明 id、kind、configSchema 等
  index.ts                # 入口文件，导出插件定义对象
  src/                    # 具体实现
```

### package.json 关键字段

```json
{
  "name": "@openclaw/<plugin-name>",
  "version": "2026.2.23",
  "type": "module",
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

`openclaw.extensions` 数组声明插件入口文件路径，是发现阶段识别有效插件的关键字段。

### openclaw.plugin.json 清单

```json
{
  "id": "memory-core",
  "kind": "memory",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

| 字段           | 类型                                 | 说明                                                   |
| -------------- | ------------------------------------ | ------------------------------------------------------ |
| `id`           | `string`                             | **必须** 插件唯一标识                                  |
| `configSchema` | `object`                             | **必须** JSON Schema，校验插件配置                     |
| `kind`         | `PluginKind`                         | 可选，如 `"memory"` 表示记忆类插件（参与独占插槽竞争） |
| `channels`     | `string[]`                           | 可选，声明注册的通道 ID                                |
| `providers`    | `string[]`                           | 可选，声明注册的模型提供者 ID                          |
| `skills`       | `string[]`                           | 可选，声明技能入口                                     |
| `uiHints`      | `Record<string, PluginConfigUiHint>` | 可选，配置界面提示                                     |

清单解析逻辑见 `src/plugins/manifest.ts:44-99`。

---

## 2. 插件发现机制

> 源码: `src/plugins/discovery.ts`，核心函数 `discoverOpenClawPlugins()` (行 557-625)

### 发现来源与优先级

按以下顺序扫描，先发现的同 ID 插件优先（通过 `seen` Set 去重）：

| 优先级 | 来源 (origin) | 路径                                                              | 说明                   |
| ------ | ------------- | ----------------------------------------------------------------- | ---------------------- |
| 1      | `config`      | `plugins.load.paths` 配置项                                       | 用户手动指定的额外路径 |
| 2      | `workspace`   | `<workspaceDir>/.openclaw/extensions/`                            | 工作区级别扩展         |
| 3      | `global`      | `~/.openclaw/extensions/`                                         | 全局安装的扩展         |
| 4      | `bundled`     | 仓库 `extensions/` 目录或 `OPENCLAW_BUNDLED_PLUGINS_DIR` 环境变量 | 内置扩展               |

### 候选者类型 (PluginCandidate)

```typescript
// src/plugins/discovery.ts:16-27
type PluginCandidate = {
  idHint: string; // 推导出的插件 ID
  source: string; // 入口文件绝对路径
  rootDir: string; // 插件根目录
  origin: PluginOrigin; // "bundled" | "global" | "workspace" | "config"
  workspaceDir?: string;
  packageName?: string;
  packageVersion?: string;
  packageDescription?: string;
  packageDir?: string;
  packageManifest?: OpenClawPackageManifest;
};
```

### 入口解析

通过 `package.json` 的 `openclaw.extensions` 字段获取入口列表（`discovery.ts:239-245`）：

```typescript
function resolvePackageExtensions(manifest: PackageManifest): string[] {
  const raw = getPackageManifestMetadata(manifest)?.extensions;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}
```

支持的文件扩展名（`discovery.ts:14`）：

```typescript
const EXTENSION_EXTS = new Set([".ts", ".js", ".mts", ".cts", ".mjs", ".cjs"]);
```

### 安全校验

发现阶段执行安全检查（`discovery.ts:177-199`），`isUnsafePluginCandidate()` 检测：

- **路径逃逸** — 入口文件 realpath 超出插件根目录（防止符号链接攻击）
- **路径不可访问** — stat 失败
- **全局可写** — 文件模式含 `0o002`（非内置插件）
- **所有权可疑** — UID 与当前进程不匹配（非内置插件）

---

## 3. 插件加载流程

> 源码: `src/plugins/loader.ts`，核心函数 `loadOpenClawPlugins()` (行 359-700)

```
[配置归一化] → [缓存检查] → [创建注册中心] → [发现插件] → [Jiti初始化]
     → [遍历候选者] → [解析启用状态] → [加载模块] → [注册能力] → [返回注册中心]
```

### 详细步骤

**1) 配置归一化** (`loader.ts:365-377`)

```typescript
const normalized = normalizePluginsConfig(cfg.plugins);
```

将原始配置转换为 `NormalizedPluginsConfig`，填充默认值。

**2) 缓存检查** (`loader.ts:370-377`)

支持 `cacheKey` 参数实现加载结果缓存，避免重复发现和加载。

**3) 创建注册中心** (`loader.ts:382-387`)

```typescript
const { registry, createApi } = createPluginRegistry({
  logger,
  runtime,
  coreGatewayHandlers,
});
```

**4) Jiti 加载器初始化** (`loader.ts:417-439`)

使用 [Jiti](https://github.com/unjs/jiti) 实现 TypeScript 模块的运行时加载：

```typescript
const getJiti = () => {
  if (jitiLoader) return jitiLoader;
  jitiLoader = createJiti(import.meta.url, {
    interopDefault: true,
    extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"],
    alias: {
      "openclaw/plugin-sdk": pluginSdkAlias,
      "openclaw/plugin-sdk/account-id": pluginSdkAccountIdAlias,
    },
  });
  return jitiLoader;
};
```

关键点：通过 `alias` 将 `openclaw/plugin-sdk` 映射到实际路径，使插件在开发和安装环境下均可正确引用 SDK。

**5) 遍历候选者加载** (`loader.ts:450-679`)

对每个候选者执行：

1. 调用 `resolveEffectiveEnableState()` 判断启用状态
2. 验证清单文件存在且有效
3. 安全路径校验
4. 通过 Jiti 加载模块: `mod = getJiti()(candidate.source)`
5. 解析导出: `resolvePluginModuleExport(mod)` 获取插件定义对象
6. 校验插件配置是否符合 `configSchema`
7. 调用 `register(api)` 完成能力注册

**6) 错误处理** (`loader.ts:178-201`)

加载失败不会中断整个流程，而是记录到 `PluginRecord.error` 和 `registry.diagnostics`：

```typescript
function recordPluginError(params) {
  params.record.status = "error";
  params.record.error = errorText;
  registry.plugins.push(params.record);
  registry.diagnostics.push({ level: "error", pluginId, message });
}
```

---

## 4. 启用状态解析

> 源码: `src/plugins/config-state.ts`

启用状态是插件系统最关键的控制点，采用多层级优先级判断。

### 归一化配置类型

```typescript
// config-state.ts:6-15
type NormalizedPluginsConfig = {
  enabled: boolean; // 全局开关
  allow: string[]; // 白名单
  deny: string[]; // 黑名单
  loadPaths: string[]; // 额外加载路径
  slots: { memory?: string | null }; // 独占插槽
  entries: Record<string, { enabled?: boolean; config?: unknown }>;
};
```

### resolveEnableState() 判断逻辑

> `config-state.ts:165-196`

按优先级从高到低：

```
1. plugins.enabled === false        → 禁用（全局关闭）
2. plugins.deny 包含该 ID          → 禁用（黑名单命中）
3. plugins.allow 非空且不含该 ID   → 禁用（不在白名单中）
4. plugins.slots.memory === id     → 启用（插槽选中）
5. plugins.entries[id].enabled      → 按显式配置
6. origin === "bundled" 且在默认集  → 启用
7. origin === "bundled" 且不在默认集 → 禁用
8. 非内置插件                       → 默认启用
```

### 默认启用的内置插件

```typescript
// config-state.ts:17-21
const BUNDLED_ENABLED_BY_DEFAULT = new Set(["device-pair", "phone-control", "talk-voice"]);
```

除上述三个外，其余内置插件默认禁用，需要通过配置或自动启用机制激活。

### resolveEffectiveEnableState() — 带自动启用

> `config-state.ts:217-232`

在 `resolveEnableState()` 基础上叠加自动启用逻辑：当内置通道插件被 `resolveEnableState()` 判定为 `"bundled (disabled by default)"` 时，检查对应通道是否已在配置中配置（如存在 Telegram token），如果是则自动启用。

```typescript
function resolveEffectiveEnableState(params) {
  const base = resolveEnableState(params.id, params.origin, params.config);
  if (
    !base.enabled &&
    base.reason === "bundled (disabled by default)" &&
    isBundledChannelEnabledByChannelConfig(params.rootConfig, params.id)
  ) {
    return { enabled: true };
  }
  return base;
}
```

### 独占插槽机制

> `src/plugins/slots.ts:37-108`

`kind: "memory"` 类插件参与独占插槽竞争，同一时刻只有一个记忆插件可以激活。

```typescript
// slots.ts:12-18
const SLOT_BY_KIND = { memory: "memory" };
const DEFAULT_SLOT_BY_KEY = { memory: "memory-core" };
```

插槽选择逻辑 (`config-state.ts:234-262`)：

```
1. kind !== "memory"          → 不参与插槽，正常启用
2. slot === null ("none")     → 禁用所有记忆插件
3. slot === id                → 选中，启用
4. slot === 其他 id           → 未选中，禁用
5. 无显式 slot 配置            → 第一个发现的记忆插件获胜
```

切换记忆插件时，`applyExclusiveSlotSelection()` 会自动禁用同类其他插件。

---

## 5. 配置持久化

插件状态持久化在 OpenClaw 主配置文件中（`~/.openclaw/config.json5` 或 `~/.config/openclaw/config.json5`）：

```json5
{
  plugins: {
    enabled: true, // 全局开关
    allow: ["telegram", "discord"], // 白名单
    deny: ["unsafe-plugin"], // 黑名单
    load: {
      paths: ["~/my-plugins/custom.ts"], // 额外加载路径
    },
    slots: {
      memory: "memory-core", // 独占插槽选择
    },
    entries: {
      // 每个插件的独立配置
      telegram: { enabled: true },
      discord: { enabled: false },
      "my-plugin": {
        enabled: true,
        config: { apiKey: "..." },
      },
    },
    installs: {
      // 安装记录
      "my-plugin": {
        source: "npm",
        spec: "@my-org/my-plugin",
        installPath: "~/.openclaw/extensions/my-plugin",
        version: "1.0.0",
        installedAt: "2024-01-01T00:00:00Z",
      },
    },
  },
}
```

### 配置类型定义

> `src/config/types.plugins.ts:1-31`

```typescript
type PluginsConfig = {
  enabled?: boolean;
  allow?: string[];
  deny?: string[];
  load?: { paths?: string[] };
  slots?: { memory?: string };
  entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
  installs?: Record<string, PluginInstallRecord>;
};
```

---

## 6. 自动启用机制

> 源码: `src/config/plugin-auto-enable.ts`

### 通道自动启用

当用户配置了通道相关的 token 或连接信息时，对应的通道插件会被自动启用。

`applyPluginAutoEnable()` 函数 (行 450-506) 流程：

1. 调用 `resolveConfiguredPlugins()` 扫描配置和环境变量
2. 对每个检测到的插件：
   - 跳过被黑名单阻止的
   - 跳过被显式禁用的
   - 添加到 `plugins.entries` 并设为启用
   - 确保在白名单中

检测方式示例（行 74-220）：

- Telegram: 检查 `TELEGRAM_BOT_TOKEN` 环境变量或 `channels.telegram.token` 配置
- Discord: 检查 `DISCORD_BOT_TOKEN` 或 `channels.discord.token`
- 其他通道类似

### 模型提供者自动启用

```typescript
// plugin-auto-enable.ts:33-38
const PROVIDER_PLUGIN_IDS = [
  { pluginId: "google-gemini-cli-auth", providerId: "google-gemini-cli" },
  { pluginId: "qwen-portal-auth", providerId: "qwen-portal" },
  { pluginId: "copilot-proxy", providerId: "copilot-proxy" },
  { pluginId: "minimax-portal-auth", providerId: "minimax-portal" },
];
```

---

## 7. 插件生命周期操作

### 安装 (Install)

> 源码: `src/plugins/install.ts`

支持三种安装来源：

| 来源     | 函数                         | 说明                        |
| -------- | ---------------------------- | --------------------------- |
| 本地路径 | `installPluginFromPath()`    | 可复制或链接（`--link`）    |
| npm 包   | `installPluginFromNpmSpec()` | 从 npm registry 下载并安装  |
| 归档文件 | `installPluginFromArchive()` | `.tgz` / `.tar.gz` / `.zip` |

安装流程：

1. 解析来源，下载/复制到临时目录
2. 验证 `package.json` 含 `openclaw.extensions` 字段
3. **安全扫描** — 检测危险代码模式（`install.ts:199-221`），发现 critical 级别时发出警告
4. 执行 `npm install --omit=dev` 安装运行时依赖
5. 移动到 `~/.openclaw/extensions/<plugin-id>/`
6. 记录安装信息到 `plugins.installs`

### 启用 (Enable)

> 源码: `src/plugins/enable.ts:12-24`

```typescript
function enablePluginInConfig(cfg, pluginId) {
  // 检查全局开关
  if (cfg.plugins?.enabled === false) return { enabled: false, reason: "plugins disabled" };
  // 检查黑名单
  if (cfg.plugins?.deny?.includes(pluginId))
    return { enabled: false, reason: "blocked by denylist" };
  // 设置 entries[id].enabled = true 并加入白名单
  let next = setPluginEnabledInConfig(cfg, resolvedId, true);
  next = ensurePluginAllowlisted(next, resolvedId);
  return { config: next, enabled: true };
}
```

### 禁用 (Disable)

> 源码: `src/plugins/toggle-config.ts:4-47`

```typescript
function setPluginEnabledInConfig(config, pluginId, enabled) {
  // 更新 plugins.entries[id].enabled
  // 如果是内置通道插件，同步更新 channels[id].enabled
}
```

对于通道类插件，禁用时同步设置 `channels[id].enabled = false`，保持两处配置一致。

### 卸载 (Uninstall)

> 源码: `src/plugins/uninstall.ts`

`uninstallPlugin()` 函数 (行 177-237) 执行以下清理：

| 操作                                   | 说明                                  |
| -------------------------------------- | ------------------------------------- |
| 移除 `plugins.entries[id]`             | 删除插件配置条目                      |
| 移除 `plugins.installs[id]`            | 删除安装记录                          |
| 移除 `plugins.allow` 中的 ID           | 清理白名单                            |
| 移除 `plugins.load.paths` 中的链接路径 | 清理额外路径（仅链接安装）            |
| 重置 `plugins.slots.memory`            | 如果该插件被选为记忆插槽              |
| 删除磁盘文件                           | 除非是链接安装（`source === "path"`） |

---

## 8. 插件注册中心与 API

### PluginRegistry

> 源码: `src/plugins/registry.ts:124-138`

注册中心汇集所有已加载插件注册的能力：

```typescript
type PluginRegistry = {
  plugins: PluginRecord[]; // 所有插件记录
  tools: PluginToolRegistration[]; // 工具注册
  hooks: PluginHookRegistration[]; // 钩子注册
  typedHooks: TypedPluginHookRegistration[]; // 类型化钩子
  channels: PluginChannelRegistration[]; // 通道注册
  providers: PluginProviderRegistration[]; // 模型提供者
  gatewayHandlers: GatewayRequestHandlers; // 网关处理器
  httpHandlers: PluginHttpRegistration[]; // HTTP 处理器
  httpRoutes: PluginHttpRouteRegistration[]; // HTTP 路由
  cliRegistrars: PluginCliRegistration[]; // CLI 命令
  services: PluginServiceRegistration[]; // 后台服务
  commands: PluginCommandRegistration[]; // 斜杠命令
  diagnostics: PluginDiagnostic[]; // 诊断信息
};
```

### PluginRecord 状态

```typescript
// registry.ts:97-122
type PluginRecord = {
  id: string;
  status: "loaded" | "disabled" | "error";
  enabled: boolean;
  toolNames: string[];
  hookNames: string[];
  channelIds: string[];
  providerIds: string[];
  gatewayMethods: string[];
  cliCommands: string[];
  services: string[];
  commands: string[];
  // ...
};
```

### OpenClawPluginApi

> 源码: `src/plugins/types.ts:245-284`，创建逻辑在 `registry.ts:472-503`

插件通过 `register(api)` 回调接收 API 对象，可用方法：

| 方法                                         | 说明              |
| -------------------------------------------- | ----------------- |
| `api.registerTool(factory, opts)`            | 注册 Agent 工具   |
| `api.registerHook(events, handler, opts)`    | 注册生命周期钩子  |
| `api.registerChannel(registration)`          | 注册通信通道      |
| `api.registerProvider(provider)`             | 注册模型提供者    |
| `api.registerGatewayMethod(method, handler)` | 注册网关 RPC 方法 |
| `api.registerCli(registrar, opts)`           | 注册 CLI 子命令   |
| `api.registerService(service)`               | 注册后台服务      |
| `api.registerCommand(command)`               | 注册斜杠命令      |
| `api.registerHttpHandler(handler)`           | 注册 HTTP 处理器  |
| `api.registerHttpRoute(params)`              | 注册 HTTP 路由    |
| `api.on(hookName, handler, opts)`            | 注册类型化钩子    |
| `api.resolvePath(input)`                     | 解析用户路径      |

API 对象还暴露以下上下文：

| 属性               | 说明               |
| ------------------ | ------------------ |
| `api.id`           | 插件 ID            |
| `api.config`       | 完整 OpenClaw 配置 |
| `api.pluginConfig` | 该插件的独立配置   |
| `api.runtime`      | 运行时工具集       |
| `api.logger`       | 日志器             |

### 可用钩子事件

```typescript
// src/plugins/types.ts:299-323
type PluginHookName =
  | "before_model_resolve" // 模型解析前
  | "before_prompt_build" // Prompt 构建前
  | "before_agent_start" // Agent 启动前
  | "llm_input" // LLM 输入
  | "llm_output" // LLM 输出
  | "agent_end" // Agent 结束
  | "before_compaction" // 上下文压缩前
  | "after_compaction" // 上下文压缩后
  | "before_reset" // 会话重置前
  | "message_received" // 收到消息
  | "message_sending" // 发送消息中
  | "message_sent" // 消息已发送
  | "before_tool_call" // 工具调用前
  | "after_tool_call" // 工具调用后
  | "tool_result_persist" // 工具结果持久化
  | "before_message_write" // 消息写入前
  | "session_start" // 会话开始
  | "session_end" // 会话结束
  | "subagent_spawning" // 子 Agent 生成中
  | "subagent_delivery_target" // 子 Agent 投递目标
  | "subagent_spawned" // 子 Agent 已生成
  | "subagent_ended" // 子 Agent 已结束
  | "gateway_start" // 网关启动
  | "gateway_stop"; // 网关停止
```

---

## 9. Plugin SDK

> 源码: `src/plugin-sdk/index.ts`（约 544 行）

Plugin SDK 是插件的主要依赖入口，通过 Jiti alias `"openclaw/plugin-sdk"` 解析。导出内容包括：

- **类型**: `OpenClawPluginApi`, `ChannelPlugin`, `PluginRuntime` 等
- **工具函数**: `emptyPluginConfigSchema()`, `normalizeWebhookPath()`, `resolveWebhookPath()`
- **通道适配器**: 50+ 个通道相关类型和辅助函数
- **文件锁**: `acquireFileLock()`, `withFileLock()`
- **媒体处理**: 各种媒体相关的工具函数

### Plugin Runtime

> 源码: `src/plugins/runtime/index.ts:239-251`

通过 `api.runtime` 暴露给插件：

```typescript
PluginRuntime = {
  version: string;
  config: { loadConfig, writeConfigFile };     // 配置读写
  system: { enqueueSystemEvent, runCommand };  // 系统事件与命令
  media: { loadWebMedia, detectMime };         // 媒体处理
  tts: { textToSpeechTelephony };              // 文字转语音
  tools: { createMemoryGetTool, ... };         // 内置工具工厂
  channel: { ... };                            // 通道工具集
  logging: { shouldLogVerbose, getChildLogger }; // 日志
  state: { resolveStateDir };                  // 状态目录
};
```

---

## 10. CLI 命令

> 源码: `src/cli/plugins-cli.ts`，`registerPluginsCli()` (行 150-742)

| 命令                                    | 说明                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| `openclaw plugins list`                 | 列出所有发现的插件及其状态                           |
| `openclaw plugins info <id>`            | 显示指定插件的详细信息                               |
| `openclaw plugins enable <id>`          | 启用插件                                             |
| `openclaw plugins disable <id>`         | 禁用插件                                             |
| `openclaw plugins install <path\|spec>` | 安装插件（支持 `--link` 链接模式、`--pin` 锁定版本） |
| `openclaw plugins uninstall <id>`       | 卸载插件                                             |
| `openclaw plugins update [id] --all`    | 更新 npm 安装的插件                                  |
| `openclaw plugins doctor`               | 诊断插件加载问题                                     |

---

## 11. 现有扩展一览

### 通道插件 (Channel)

| 插件 ID          | 说明                      |
| ---------------- | ------------------------- |
| `bluebubbles`    | BlueBubbles iMessage 桥接 |
| `discord`        | Discord                   |
| `feishu`         | 飞书/Lark                 |
| `googlechat`     | Google Chat               |
| `imessage`       | iMessage                  |
| `irc`            | IRC                       |
| `line`           | LINE                      |
| `matrix`         | Matrix                    |
| `mattermost`     | Mattermost                |
| `msteams`        | Microsoft Teams           |
| `nextcloud-talk` | Nextcloud Talk            |
| `nostr`          | Nostr (NIP-04 加密 DM)    |
| `signal`         | Signal                    |
| `slack`          | Slack                     |
| `synology-chat`  | Synology Chat             |
| `telegram`       | Telegram                  |
| `tlon`           | Tlon/Urbit                |
| `twitch`         | Twitch                    |
| `whatsapp`       | WhatsApp Web              |
| `zalo`           | Zalo                      |
| `zalouser`       | Zalo 个人账号             |

### 模型提供者插件 (Provider)

| 插件 ID                  | 对应提供者              |
| ------------------------ | ----------------------- |
| `copilot-proxy`          | GitHub Copilot API      |
| `google-gemini-cli-auth` | Google Gemini CLI OAuth |
| `minimax-portal-auth`    | MiniMax Portal OAuth    |
| `qwen-portal-auth`       | Qwen Portal OAuth       |

### 记忆插件 (Memory) — 独占插槽

| 插件 ID          | 说明                           |
| ---------------- | ------------------------------ |
| `memory-core`    | 基于文件的记忆搜索（默认选中） |
| `memory-lancedb` | 基于 LanceDB 的向量记忆        |

### 功能/服务插件

| 插件 ID            | 说明                   |
| ------------------ | ---------------------- |
| `device-pair`      | 设备配对（默认启用）   |
| `phone-control`    | 手机控制（默认启用）   |
| `talk-voice`       | 语音功能（默认启用）   |
| `voice-call`       | 语音通话               |
| `diagnostics-otel` | OpenTelemetry 诊断     |
| `llm-task`         | JSON-only LLM 任务工具 |
| `lobster`          | 可恢复审批工作流       |
| `open-prose`       | OpenProse VM 技能包    |
| `thread-ownership` | Slack 线程所有权控制   |

---

## 12. 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      配置层 (Config)                         │
│  ~/.openclaw/config.json5                                   │
│  plugins.enabled / allow / deny / entries / slots / installs│
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     发现层 (Discovery)                       │
│  src/plugins/discovery.ts                                   │
│                                                             │
│  config paths → workspace → global → bundled                │
│       │             │          │         │                   │
│       ▼             ▼          ▼         ▼                   │
│            PluginCandidate[] (去重 + 安全校验)               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    状态解析 (Enable State)                    │
│  src/plugins/config-state.ts                                │
│                                                             │
│  全局开关 → 黑名单 → 白名单 → 插槽 → 显式配置 → 默认规则    │
│                    ↕                                        │
│  src/config/plugin-auto-enable.ts (通道/提供者自动启用)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      加载层 (Loader)                         │
│  src/plugins/loader.ts                                      │
│                                                             │
│  Jiti 加载 TS/JS → resolvePluginModuleExport()              │
│       → 配置 Schema 校验 → register(api) 调用               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    注册中心 (Registry)                        │
│  src/plugins/registry.ts                                    │
│                                                             │
│  ┌─────────┬──────────┬──────────┬───────────┬───────────┐  │
│  │  Tools  │  Hooks   │ Channels │ Providers │ Services  │  │
│  │         │          │          │           │           │  │
│  │  CLI    │  HTTP    │ Commands │ Gateway   │ Diagnostics│ │
│  └─────────┴──────────┴──────────┴───────────┴───────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. 关键源文件索引

| 文件                               | 作用                               |
| ---------------------------------- | ---------------------------------- |
| `src/plugins/discovery.ts`         | 插件发现，多来源扫描               |
| `src/plugins/loader.ts`            | 插件加载主流程，Jiti 集成          |
| `src/plugins/config-state.ts`      | 启用状态解析（优先级链）           |
| `src/plugins/registry.ts`          | 注册中心，API 工厂                 |
| `src/plugins/types.ts`             | 核心类型定义（PluginApi、Hook 等） |
| `src/plugins/manifest.ts`          | 清单文件解析与校验                 |
| `src/plugins/enable.ts`            | 启用操作                           |
| `src/plugins/toggle-config.ts`     | 启用/禁用配置切换                  |
| `src/plugins/install.ts`           | 安装（npm/路径/归档）              |
| `src/plugins/uninstall.ts`         | 卸载与配置清理                     |
| `src/plugins/slots.ts`             | 独占插槽管理                       |
| `src/plugins/bundled-dir.ts`       | 内置插件目录解析                   |
| `src/plugins/runtime/index.ts`     | 运行时能力集                       |
| `src/plugin-sdk/index.ts`          | SDK 导出入口                       |
| `src/config/types.plugins.ts`      | 配置类型定义                       |
| `src/config/plugin-auto-enable.ts` | 自动启用逻辑                       |
| `src/config/plugins-allowlist.ts`  | 白名单管理                         |
| `src/cli/plugins-cli.ts`           | CLI 命令实现                       |
