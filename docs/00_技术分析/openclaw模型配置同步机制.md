# OpenClaw 模型配置同步机制

## 概述

OpenClaw 的模型配置涉及两个核心文件：

- **`openclaw.json`**：用户配置文件，位于 state 目录下（如 `~/.openclaw/openclaw.json`）
- **`models.json`**：模型注册表文件，位于 `agents/main/agent/models.json`，由代码自动生成

本文档分析 `openclaw.json` 中的模型配置如何同步到 `models.json`，以及 `merge` 与 `overwrite` 两种模式的区别。

## 核心文件与职责

### openclaw.json

用户手动编辑的配置文件，包含两个与模型相关的独立配置项：

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "qclaw/modelroute"
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "qclaw": {
        "baseUrl": "https://example.com/v1",
        "apiKey": "sk-xxx",
        "api": "openai-completions",
        "models": [
          { "id": "modelroute", "name": "modelroute" }
        ]
      }
    }
  }
}
```

- `agents.defaults.model.primary`：运行时 agent 默认使用哪个模型，**不影响 `models.json`**
- `models.providers`：声明可用的模型提供商（explicit providers），是 `models.json` 的数据来源之一

### models.json

由 `ensureOpenClawModelsJson()` 自动生成的模型注册表，供 pi-ai 的 `ModelRegistry` 读取。它描述"有哪些 provider 可用、每个 provider 有哪些模型"。

## 数据流向

```
openclaw.json
├── models.providers ─────────────┐
│   (explicit providers)          │
│                                 ├─→ ensureOpenClawModelsJson() ─→ models.json
│                                 │
环境变量 / auth profiles ─────────┘
   (implicit providers)

openclaw.json
└── agents.defaults.model.primary ─→ resolveAgentModel() ─→ 运行时模型选择
                                     (不写入 models.json)
```

`agents.defaults.model.primary` 和 `models.json` 是两个独立的概念，没有同步关系。

## Explicit vs Implicit Providers

### Explicit Providers

在 `openclaw.json` 的 `models.providers` 中手动配置的 provider。

**源码位置**：`src/agents/models-config.ts:107`

```typescript
const explicitProviders = cfg.models?.providers ?? {};
```

### Implicit Providers

代码根据环境变量或 auth profile 自动探测的 provider。

**源码位置**：`src/agents/models-config.providers.ts:796+`

自动探测逻辑会依次检查以下 provider 的 API key 环境变量：

| Provider | 环境变量 |
|----------|---------|
| minimax | `MINIMAX_API_KEY` |
| moonshot | `MOONSHOT_API_KEY` |
| kimi-coding | `KIMI_CODING_API_KEY` |
| synthetic | `SYNTHETIC_API_KEY` |
| venice | `VENICE_API_KEY` |
| volcengine (doubao) | `VOLCENGINE_API_KEY` |
| byteplus | `BYTEPLUS_API_KEY` |
| xiaomi | `XIAOMI_API_KEY` |
| cloudflare-ai-gateway | `CLOUDFLARE_AI_GATEWAY_API_KEY` |
| ollama | `OLLAMA_API_KEY` |
| vllm | `VLLM_API_KEY` |
| together | `TOGETHER_API_KEY` |
| huggingface | `HF_TOKEN` |
| qianfan | `QIANFAN_API_KEY` |
| openrouter | `OPENROUTER_API_KEY` |
| nvidia | `NVIDIA_API_KEY` |
| kilocode | `KILOCODE_API_KEY` |
| amazon-bedrock | AWS SDK 凭证 |
| github-copilot | GitHub Copilot token |

### 合并优先级

```typescript
const providers = mergeProviders({
  implicit: implicitProviders,
  explicit: explicitProviders,
});
```

同名 provider key 下，**explicit 优先**。即用户在 `openclaw.json` 中的配置（包括 `baseUrl`、`apiKey` 等）会覆盖自动探测的值。

**源码位置**：`src/agents/models-config.ts:75-89`

```typescript
function mergeProviders({ implicit, explicit }) {
  const out = { ...implicit };
  for (const [key, explicitVal] of Object.entries(explicit)) {
    const implicitVal = out[key];
    // explicit 覆盖 implicit
    out[key] = implicitVal ? mergeProviderModels(implicitVal, explicitVal) : explicitVal;
  }
  return out;
}
```

`mergeProviderModels` 内部做的是 `{ ...implicit, ...explicit, models: mergedModels }`，explicit 的 `baseUrl` 等顶层字段优先。

## models.json 的生成时机

`ensureOpenClawModelsJson()` 在以下场景被**按需调用**（非文件监听，非定时触发）：

| 时机 | 源码位置 |
|------|---------|
| agent 上下文初始化 | `src/agents/context.ts:79` |
| 每次 agent 会话运行 | `src/agents/pi-embedded-runner/run.ts:236` |
| 会话 compaction | `src/agents/pi-embedded-runner/compact.ts:276` |
| `openclaw models list` 命令 | `src/commands/models/list.registry.ts:99` |
| 图片理解 / 图片工具 | `src/media-understanding/providers/image.ts:13` |
| 模型目录发现 | `src/agents/model-catalog.ts:188` |

每次调用都会重新从 `openclaw.json` 读取最新配置（`loadConfig()`），然后重新生成内容。如果生成结果与磁盘上已有的 `models.json` 相同（字符串精确比较），则跳过写入。

## merge 与 replace 模式详解

### 核心代码

**源码位置**：`src/agents/models-config.ts:129-143`

```typescript
const mode = cfg.models?.mode ?? "merge";  // 默认 merge

let mergedProviders = providers;  // 本次从 config + env 新算出的 providers
if (mode === "merge") {
    const existing = await readJson(targetPath);  // 读磁盘上旧的 models.json
    if (isRecord(existing) && isRecord(existing.providers)) {
        mergedProviders = { ...existingProviders, ...providers };  // 旧 + 新合并
    }
}
// replace 模式：直接用 providers，不读旧文件
```

### 行为对比

| 行为 | merge | replace |
|------|-------|---------|
| 旧 `models.json` 中已不存在于当前 config/env 的 provider | **保留** | **丢弃** |
| 同名 provider 的字段更新（如 `baseUrl` 变更） | 新值覆盖旧值 | 直接用新值 |
| 手动编辑 `models.json` 添加的 provider | **保留** | 下次触发时**被清除** |

### 具体实例

#### 初始状态

环境变量中设置了 `MOONSHOT_API_KEY`，`openclaw.json` 中配置了 `qclaw` provider。

第一次运行后，`models.json` 生成为：

```json
{
  "providers": {
    "moonshot": { "baseUrl": "https://api.moonshot.cn/v1", "models": [...] },
    "qclaw": { "baseUrl": "https://old-url.com/v1", "models": [...] }
  }
}
```

#### 操作

1. 修改 `openclaw.json` 中 `qclaw` 的 `baseUrl` → `https://new-url.com/v1`
2. 删除 `MOONSHOT_API_KEY` 环境变量

此时本次新算出的 `providers` 只有：

```json
{ "qclaw": { "baseUrl": "https://new-url.com/v1", "models": [...] } }
```

#### merge 模式结果

```json
{
  "providers": {
    "moonshot": { "baseUrl": "https://api.moonshot.cn/v1", "models": [...] },
    "qclaw": { "baseUrl": "https://new-url.com/v1", "models": [...] }
  }
}
```

- `qclaw` 的 `baseUrl` 正确更新（同名 key 被新值覆盖）
- `moonshot` **残留**（旧 `models.json` 中的数据被保留，尽管环境变量已删除）

#### replace 模式结果

```json
{
  "providers": {
    "qclaw": { "baseUrl": "https://new-url.com/v1", "models": [...] }
  }
}
```

- `qclaw` 的 `baseUrl` 正确更新
- `moonshot` **消失**（不读旧文件，当前 config/env 中没有就不会出现）

### 模式选择建议

| 场景 | 推荐模式 |
|------|---------|
| 以 `openclaw.json` 为唯一配置来源，不手动编辑 `models.json` | **replace** |
| 需要手动向 `models.json` 添加额外 provider 且不希望被覆盖 | **merge** |
| 多来源（手动编辑 + 自动生成）共存 | **merge** |

对于大多数用户，如果只通过 `openclaw.json` 管理 provider 配置，`replace` 模式行为更可预测、更干净。`merge` 模式的价值在于兼容手动编辑 `models.json` 的场景，但代价是"删除一个 provider"变得困难——从 `openclaw.json` 和环境变量中移除后，旧 `models.json` 中的残留依然存在。

> **注意**：配置值是 `"replace"`，不是 `"overwrite"`。Schema 校验只接受 `"merge"` 和 `"replace"` 两个值。
>
> **源码位置**：
> - 类型定义：`src/config/types.models.ts:64` — `mode?: "merge" | "replace"`
> - Zod schema：`src/config/zod-schema.core.ts:86` — `z.union([z.literal("merge"), z.literal("replace")])`

## 配置路径解析

### State 目录解析顺序

**源码位置**：`src/config/paths.ts:60-86`

1. 环境变量 `OPENCLAW_STATE_DIR`（或 `CLAWDBOT_STATE_DIR`）— 最高优先
2. `~/.openclaw/`（`NEW_STATE_DIRNAME`）— 如果目录存在
3. Legacy 目录（按顺序检查）：`~/.clawdbot/`、`~/.moldbot/`、`~/.moltbot/`
4. 回退到 `~/.openclaw/`

### 配置文件路径

`openclaw.json` 位于 state 目录下，文件名优先级：

1. `openclaw.json`
2. Legacy 文件名：`clawdbot.json`、`moldbot.json`、`moltbot.json`

### models.json 路径

```
{stateDir}/agents/main/agent/models.json
```

其中 `stateDir` 由上述解析逻辑决定。

### 常见问题：配置不生效

如果修改了 `openclaw.json` 但 `models.json` 未更新，首先排查**是否编辑了正确的配置文件**。当系统中存在多个 state 目录时（如 `~/.openclaw/` 和自定义目录），需要确认实际运行的 openclaw 进程通过 `OPENCLAW_STATE_DIR` 环境变量指向了正确的目录。
