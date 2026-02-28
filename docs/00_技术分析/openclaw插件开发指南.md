# OpenClaw 插件开发指南

## 概述

OpenClaw 采用注册式插件架构，支持以下扩展类型：

| 类型         | 说明                             | 注册方法                                                |
| ------------ | -------------------------------- | ------------------------------------------------------- |
| **Channel**  | 通信通道（Telegram、Discord 等） | `api.registerChannel()`                                 |
| **Provider** | 模型提供者                       | `api.registerProvider()`                                |
| **Tool**     | Agent 工具                       | `api.registerTool()`                                    |
| **Hook**     | 生命周期钩子                     | `api.registerHook()` / `api.on()`                       |
| **Service**  | 后台服务                         | `api.registerService()`                                 |
| **Command**  | 斜杠命令                         | `api.registerCommand()`                                 |
| **CLI**      | CLI 子命令                       | `api.registerCli()`                                     |
| **HTTP**     | HTTP 路由/处理器                 | `api.registerHttpRoute()` / `api.registerHttpHandler()` |
| **Gateway**  | 网关 RPC 方法                    | `api.registerGatewayMethod()`                           |
| **Memory**   | 记忆存储（独占插槽）             | 设置 `kind: "memory"`                                   |

---

## 1. 插件项目结构

```
my-plugin/
  package.json             # npm 包清单，包含 openclaw.extensions 入口声明
  openclaw.plugin.json     # 插件清单，声明 id、configSchema 等元数据
  index.ts                 # 入口文件，导出插件定义对象
  src/                     # 实现代码
    channel.ts             # 通道实现（通道插件）
    runtime.ts             # 运行时访问封装
```

---

## 2. 关键文件详解

### 2.1 package.json

```json
{
  "name": "@openclaw/my-plugin",
  "version": "2026.2.24",
  "private": true,
  "description": "My OpenClaw plugin",
  "type": "module",
  "dependencies": {
    "some-third-party-lib": "^1.0.0"
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

**关键字段说明：**

| 字段                       | 必须 | 说明                                           |
| -------------------------- | ---- | ---------------------------------------------- |
| `type: "module"`           | 是   | 必须使用 ESM                                   |
| `openclaw.extensions`      | 是   | 插件入口文件数组，发现阶段的识别标志           |
| `devDependencies.openclaw` | 推荐 | 仅用于开发时类型检查，运行时由 Jiti alias 解析 |
| `dependencies`             | 按需 | 插件自身的运行时依赖                           |

**通道插件的额外字段：**

```json
{
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "my-channel",
      "label": "My Channel",
      "docsPath": "/channels/my-channel",
      "aliases": ["mc"],
      "order": 50
    },
    "install": {
      "npmSpec": "@openclaw/my-channel",
      "localPath": "extensions/my-channel",
      "defaultChoice": "npm"
    }
  }
}
```

### 2.2 openclaw.plugin.json

```json
{
  "id": "my-plugin",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

| 字段           | 必须 | 类型                                 | 说明                                 |
| -------------- | ---- | ------------------------------------ | ------------------------------------ |
| `id`           | 是   | `string`                             | 插件唯一标识                         |
| `configSchema` | 是   | JSON Schema                          | 插件配置校验 schema                  |
| `kind`         | 否   | `"memory"`                           | 声明为记忆类插件（参与独占插槽竞争） |
| `channels`     | 否   | `string[]`                           | 注册的通道 ID                        |
| `providers`    | 否   | `string[]`                           | 注册的提供者 ID                      |
| `skills`       | 否   | `string[]`                           | 技能入口                             |
| `name`         | 否   | `string`                             | 显示名称                             |
| `description`  | 否   | `string`                             | 描述                                 |
| `version`      | 否   | `string`                             | 版本号                               |
| `uiHints`      | 否   | `Record<string, PluginConfigUiHint>` | 配置界面提示                         |

### 2.3 index.ts（入口文件）

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const plugin = {
  id: "my-plugin",
  name: "My Plugin",
  description: "A custom OpenClaw plugin",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    // 在这里注册插件能力
    api.registerTool(
      (ctx) => {
        return [
          {
            name: "my_tool",
            description: "Does something useful",
            parameters: { type: "object", properties: {} },
            execute: async (params) => {
              return { result: "done" };
            },
          },
        ];
      },
      { names: ["my_tool"] },
    );
  },
};

export default plugin;
```

**插件定义类型：**

```typescript
type OpenClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  kind?: "memory";
  configSchema?: OpenClawPluginConfigSchema;
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
  activate?: (api: OpenClawPluginApi) => void | Promise<void>; // register 的别名
};
```

---

## 3. SDK 引用机制

### 为什么不需要安装 openclaw

插件的 `package.json` 中 `openclaw` 放在 `devDependencies`：

```json
"devDependencies": {
  "openclaw": "workspace:*"
}
```

安装插件时执行 `npm install --omit=dev`，会跳过 devDependencies。运行时通过 Jiti 的 alias 机制将 `openclaw/plugin-sdk` 重定向到宿主 openclaw 安装目录中的 SDK 文件。

```
import { ... } from "openclaw/plugin-sdk"
  │
  ▼ Jiti alias 拦截
  │
  ├─ 开发环境 → <openclaw-root>/src/plugin-sdk/index.ts
  └─ 生产环境 → <openclaw-root>/dist/plugin-sdk/index.js
```

这意味着：

- 插件 `node_modules` 中不含 openclaw，体积更小
- SDK 版本始终与宿主 openclaw 一致，不存在版本冲突
- 宿主升级后插件自动获得新 SDK 能力

> 详细的解析机制参见 [插件 SDK 依赖解析机制](./openclaw插件SDK依赖解析机制.md)。

---

## 4. 插件 API 参考

`register(api)` 回调接收的 `api` 对象提供以下能力：

### 4.1 上下文属性

| 属性               | 类型                       | 说明               |
| ------------------ | -------------------------- | ------------------ |
| `api.id`           | `string`                   | 插件 ID            |
| `api.name`         | `string`                   | 插件名称           |
| `api.version`      | `string?`                  | 插件版本           |
| `api.source`       | `string`                   | 入口文件路径       |
| `api.config`       | `OpenClawConfig`           | 完整 OpenClaw 配置 |
| `api.pluginConfig` | `Record<string, unknown>?` | 该插件的独立配置   |
| `api.runtime`      | `PluginRuntime`            | 运行时工具集       |
| `api.logger`       | `PluginLogger`             | 日志器             |

### 4.2 注册方法

| 方法                                         | 说明                   |
| -------------------------------------------- | ---------------------- |
| `api.registerTool(factory, opts)`            | 注册 Agent 工具        |
| `api.registerHook(events, handler, opts)`    | 注册生命周期钩子       |
| `api.on(hookName, handler, opts)`            | 注册类型化钩子（推荐） |
| `api.registerChannel(registration)`          | 注册通信通道           |
| `api.registerProvider(provider)`             | 注册模型提供者         |
| `api.registerGatewayMethod(method, handler)` | 注册网关 RPC 方法      |
| `api.registerCli(registrar, opts)`           | 注册 CLI 子命令        |
| `api.registerService(service)`               | 注册后台服务           |
| `api.registerCommand(command)`               | 注册斜杠命令           |
| `api.registerHttpHandler(handler)`           | 注册 HTTP 处理器       |
| `api.registerHttpRoute(params)`              | 注册 HTTP 路由         |
| `api.resolvePath(input)`                     | 解析用户路径           |

### 4.3 可用钩子事件

```typescript
type PluginHookName =
  // Agent 生命周期
  | "before_model_resolve" // 模型解析前
  | "before_prompt_build" // Prompt 构建前
  | "before_agent_start" // Agent 启动前
  | "llm_input" // LLM 输入
  | "llm_output" // LLM 输出
  | "agent_end" // Agent 结束
  // 上下文管理
  | "before_compaction" // 上下文压缩前
  | "after_compaction" // 上下文压缩后
  | "before_reset" // 会话重置前
  // 消息流
  | "message_received" // 收到消息
  | "message_sending" // 发送消息中
  | "message_sent" // 消息已发送
  | "before_message_write" // 消息写入前
  // 工具调用
  | "before_tool_call" // 工具调用前
  | "after_tool_call" // 工具调用后
  | "tool_result_persist" // 工具结果持久化
  // 会话
  | "session_start" // 会话开始
  | "session_end" // 会话结束
  // 子 Agent
  | "subagent_spawning" // 子 Agent 生成中
  | "subagent_delivery_target" // 子 Agent 投递目标
  | "subagent_spawned" // 子 Agent 已生成
  | "subagent_ended" // 子 Agent 已结束
  // 网关
  | "gateway_start" // 网关启动
  | "gateway_stop"; // 网关停止
```

### 4.4 Plugin Runtime

通过 `api.runtime` 访问宿主提供的运行时能力：

```typescript
api.runtime.version; // openclaw 版本
api.runtime.config.loadConfig(); // 加载配置
api.runtime.config.writeConfigFile(updates); // 写入配置
api.runtime.system.enqueueSystemEvent(event); // 入队系统事件
api.runtime.system.runCommandWithTimeout(cmd, opts); // 执行命令
api.runtime.media.loadWebMedia(url); // 加载网络媒体
api.runtime.media.detectMime(buffer); // 检测 MIME 类型
api.runtime.tts.textToSpeechTelephony(text, opts); // 文字转语音
api.runtime.tools.createMemorySearchTool(opts); // 创建记忆搜索工具
api.runtime.channel.text.chunkMarkdownText(text); // Markdown 文本分块
api.runtime.channel.routing.resolveAgentRoute(p); // 解析 Agent 路由
api.runtime.logging.getChildLogger(name); // 获取子日志器
api.runtime.state.resolveStateDir(pluginId); // 解析状态目录
```

---

## 5. 插件开发示例

### 5.1 工具插件

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const plugin = {
  id: "weather",
  name: "Weather Tool",
  description: "Provides weather information",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    api.registerTool(
      (ctx) => [
        {
          name: "get_weather",
          description: "Get current weather for a location",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" },
            },
            required: ["city"],
          },
          execute: async ({ city }) => {
            const data = await fetchWeather(city);
            return { temperature: data.temp, condition: data.condition };
          },
        },
      ],
      { names: ["get_weather"] },
    );
  },
};

export default plugin;
```

### 5.2 钩子插件

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const plugin = {
  id: "message-logger",
  name: "Message Logger",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    // 使用类型化钩子（推荐）
    api.on("message_received", async (event) => {
      api.logger.info(`Received message: ${event.text?.slice(0, 50)}`);
    });

    api.on("message_sent", async (event) => {
      api.logger.info(`Sent message to ${event.channelId}`);
    });
  },
};

export default plugin;
```

### 5.3 通道插件

通道插件是最复杂的插件类型，需要实现消息收发。完整模板见 `docs/00_技术分析/extension-template/`。

```typescript
// index.ts
import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { myChannelPlugin } from "./src/channel.js";
import { setMyChannelRuntime } from "./src/runtime.js";

const plugin = {
  id: "my-channel",
  name: "My Channel",
  description: "My Channel plugin",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    setMyChannelRuntime(api.runtime);
    api.registerChannel({ plugin: myChannelPlugin as ChannelPlugin });
  },
};

export default plugin;
```

通道插件需要实现的核心接口：

| 组件       | 方法             | 必须 | 说明             |
| ---------- | ---------------- | ---- | ---------------- |
| `config`   | `listAccountIds` | 是   | 列出已配置的账户 |
| `config`   | `resolveAccount` | 是   | 解析账户配置     |
| `outbound` | `sendText`       | 推荐 | 发送文本消息     |
| `outbound` | `sendMedia`      | 推荐 | 发送媒体消息     |
| `gateway`  | `startAccount`   | 推荐 | 启动消息监听     |
| `gateway`  | `stopAccount`    | 推荐 | 停止消息监听     |
| `status`   | `probeAccount`   | 推荐 | 探测连接状态     |

### 5.4 记忆插件

记忆插件使用独占插槽，同一时刻只有一个记忆插件可以激活：

```typescript
const plugin = {
  id: "memory-custom",
  name: "Custom Memory",
  kind: "memory", // 声明为记忆类插件
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    api.registerTool(
      (ctx) => {
        const searchTool = api.runtime.tools.createMemorySearchTool({
          // 自定义记忆搜索实现
        });
        return [searchTool];
      },
      { names: ["memory_search"] },
    );

    api.registerCli(
      ({ program }) => {
        api.runtime.tools.registerMemoryCli(program);
      },
      { commands: ["memory"] },
    );
  },
};
```

### 5.5 后台服务插件

```typescript
const plugin = {
  id: "my-service",
  name: "My Service",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    api.registerService({
      id: "my-background-service",
      start: async (ctx) => {
        // 启动后台任务
        const interval = setInterval(() => {
          // 定期工作
        }, 60_000);

        ctx.abortSignal.addEventListener("abort", () => {
          clearInterval(interval);
        });
      },
      stop: async () => {
        // 清理资源
      },
    });
  },
};
```

---

## 6. 插件发现与加载流程

### 6.1 发现顺序

| 优先级 | 来源        | 路径                                                 | 说明         |
| ------ | ----------- | ---------------------------------------------------- | ------------ |
| 1      | `config`    | `plugins.load.paths` 配置项                          | 用户手动指定 |
| 2      | `workspace` | `<workspaceDir>/.openclaw/extensions/`               | 工作区级别   |
| 3      | `global`    | `~/.openclaw/extensions/`                            | 全局安装     |
| 4      | `bundled`   | 仓库 `extensions/` 或 `OPENCLAW_BUNDLED_PLUGINS_DIR` | 内置         |

同 ID 插件按优先级去重，先发现的优先。

### 6.2 加载流程

```
配置归一化 → 缓存检查 → 发现插件 → 创建 Jiti 加载器
  → 遍历候选者:
    1. 解析启用状态
    2. 验证清单文件
    3. 安全路径校验
    4. Jiti 加载模块
    5. 提取插件定义
    6. 校验配置 schema
    7. 调用 register(api)
  → 返回注册中心
```

### 6.3 启用状态判断

按优先级从高到低：

```
1. plugins.enabled === false         → 禁用（全局关闭）
2. 在 plugins.deny 中               → 禁用（黑名单）
3. plugins.allow 非空且不含该 ID    → 禁用（不在白名单）
4. plugins.slots.memory === id      → 启用（插槽选中）
5. plugins.entries[id].enabled       → 按显式配置
6. bundled 且在默认启用集合          → 启用
7. bundled 且不在默认启用集合        → 禁用
8. 非 bundled                        → 默认启用
```

默认启用的内置插件：`device-pair`、`phone-control`、`talk-voice`

---

## 7. 开发工作流

### 7.1 在 monorepo 中开发（内置插件）

```bash
# 1. 创建插件目录
mkdir extensions/my-plugin

# 2. 初始化文件
# 创建 package.json、openclaw.plugin.json、index.ts

# 3. 安装依赖
pnpm install

# 4. 开发运行
pnpm openclaw gateway run

# 5. 类型检查
pnpm tsgo

# 6. 测试
pnpm test
```

TypeScript 类型通过 `tsconfig.json` 的 `paths` 映射解析，运行时通过 Jiti alias 解析。

### 7.2 独立插件开发

```bash
# 1. 创建项目
mkdir my-openclaw-plugin && cd my-openclaw-plugin
npm init -y

# 2. 安装 openclaw 作为 dev 依赖（获取类型）
npm install --save-dev openclaw

# 3. 创建入口文件和清单
# package.json 中添加 "openclaw": { "extensions": ["./index.ts"] }
# 创建 openclaw.plugin.json

# 4. 本地测试（链接模式）
openclaw plugins install --link /path/to/my-openclaw-plugin

# 5. 发布到 npm
npm publish --access public

# 6. 用户安装
openclaw plugins install @my-org/my-plugin
```

### 7.3 单文件插件

最简场景，只需一个 `.ts` 文件，通过路径加载：

```bash
# 在 openclaw 配置中添加
openclaw config set plugins.load.paths '["~/my-plugins/simple-hook.ts"]'
```

```typescript
// ~/my-plugins/simple-hook.ts
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export default {
  id: "simple-hook",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.on("message_received", async (event) => {
      console.log("Message received:", event.text);
    });
  },
};
```

---

## 8. 安装与分发

### 8.1 安装方式

| 方式     | 命令                                              | 说明                  |
| -------- | ------------------------------------------------- | --------------------- |
| npm 安装 | `openclaw plugins install @org/plugin`            | 从 npm registry 下载  |
| 本地安装 | `openclaw plugins install /path/to/plugin`        | 从本地目录复制        |
| 链接安装 | `openclaw plugins install --link /path/to/plugin` | 符号链接，适合开发    |
| 归档安装 | `openclaw plugins install ./plugin.tgz`           | 从 `.tgz`/`.zip` 安装 |
| 路径加载 | `plugins.load.paths` 配置                         | 直接加载文件/目录     |

### 8.2 安装目录

- 全局安装目录：`~/.openclaw/extensions/<plugin-id>/`
- 工作区安装目录：`<workspace>/.openclaw/extensions/<plugin-id>/`

### 8.3 CLI 管理命令

```bash
openclaw plugins list                # 列出所有插件及状态
openclaw plugins info <id>           # 查看插件详情
openclaw plugins enable <id>         # 启用插件
openclaw plugins disable <id>        # 禁用插件
openclaw plugins install <spec>      # 安装插件
openclaw plugins uninstall <id>      # 卸载插件
openclaw plugins update [id] --all   # 更新插件
openclaw plugins doctor              # 诊断问题
```

---

## 9. 配置示例

```json5
// ~/.openclaw/config.json5
{
  plugins: {
    enabled: true,
    allow: ["telegram", "my-plugin"],
    deny: ["unsafe-plugin"],
    load: {
      paths: ["~/my-plugins/custom.ts"],
    },
    slots: {
      memory: "memory-core",
    },
    entries: {
      "my-plugin": {
        enabled: true,
        config: {
          apiKey: "sk-...",
          endpoint: "https://api.example.com",
        },
      },
    },
  },
}
```

插件通过 `api.pluginConfig` 访问 `entries.<id>.config` 中的配置。

---

## 10. 安全注意事项

- 入口文件不得逃逸插件根目录（防止符号链接攻击）
- 非内置插件检查文件权限（全局可写 `0o002` 触发警告）
- 非内置插件检查文件所有权（UID 不匹配触发警告）
- 安装时扫描危险代码模式（`child_process`、`eval` 等）
- `--omit=dev` 和 `--ignore-scripts` 限制安装时的攻击面

---

## 11. 参考实现

| 插件             | 路径                           | 类型    | 复杂度 | 说明               |
| ---------------- | ------------------------------ | ------- | ------ | ------------------ |
| msteams          | `extensions/msteams/`          | Channel | 中等   | 结构清晰的通道插件 |
| telegram         | `extensions/telegram/`         | Channel | 中等   | 文档齐全的通道实现 |
| feishu           | `extensions/feishu/`           | Channel | 高     | 功能完整的复杂实现 |
| memory-core      | `extensions/memory-core/`      | Memory  | 低     | 记忆插件+工具+CLI  |
| voice-call       | `extensions/voice-call/`       | Service | 高     | 服务+网关+CLI+工具 |
| llm-task         | `extensions/llm-task/`         | Tool    | 低     | 简单的工具插件     |
| diagnostics-otel | `extensions/diagnostics-otel/` | Hook    | 中等   | 钩子+服务组合      |

---

## 12. 快速检查清单

开发新插件前确认：

- [ ] `package.json` 包含 `"type": "module"` 和 `"openclaw": { "extensions": ["./index.ts"] }`
- [ ] `openclaw` 放在 `devDependencies`，不在 `dependencies`
- [ ] `openclaw.plugin.json` 包含 `id` 和 `configSchema`
- [ ] `index.ts` 默认导出插件定义对象
- [ ] `register(api)` 函数正确注册了所有能力
- [ ] 插件自身的运行时依赖在 `dependencies` 中
- [ ] 类型检查通过（`pnpm tsgo`）
- [ ] 插件可被 `openclaw plugins list` 识别
- [ ] 插件无错误加载（`openclaw plugins doctor`）
