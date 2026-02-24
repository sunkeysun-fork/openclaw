---
title: OpenClaw Exec Approvals 配置机制详解
read_when:
  - 理解 openclaw.json 和 exec-approvals.json 的关系
  - 配置执行审批和安全策略
  - 掌握 safeBins、safeBinProfiles 和 allowlist 的区别
summary: 深入解析 OpenClaw 的执行审批配置系统，包括配置文件关系、策略合并规则、审批流程设计、通配符支持等核心内容
x-i18n:
  generated_at: "2026-02-24T11:30:00Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
  source_path: docs/技术分析/openclaw-exec-approvals-配置机制详解.md
  workflow: 15
---

# OpenClaw Exec Approvals 配置机制详解

本文档深入解析 OpenClaw 的执行审批配置系统，重点说明 `openclaw.json` 和 `exec-approvals.json` 的关系、配置合并机制、审批流程、以及各项配置的作用。

## 目录

- [配置文件架构](#配置文件架构)
- [策略合并机制](#策略合并机制)
- [执行审批机制](#执行审批机制)
- [Socket 配置作用](#socket-配置作用)
- [聊天渠道审批交互](#聊天渠道审批交互)
- [通配符支持](#通配符支持)
- [完整配置示例](#完整配置示例)
- [最佳实践](#最佳实践)

---

## 配置文件架构

### 双重配置系统

OpenClaw 使用两个独立的 JSON 配置文件来控制执行行为：

| 配置文件                  | 存储位置                          | 主要作用                                | 维护方式                                   |
| ------------------------- | --------------------------------- | --------------------------------------- | ------------------------------------------ |
| **`openclaw.json`**       | `~/.openclaw/openclaw.json`       | 定义全局默认值和每个 agent 的基础配置   | 手动编辑或 CLI 命令                        |
| **`exec-approvals.json`** | `~/.openclaw/exec-approvals.json` | 定义每个 agent 的命令审批规则和允许列表 | 手动编辑、Control UI 或 CLI 命令，自动更新 |

### 配置文件目录结构

```
~/.openclaw/
├── openclaw.json              ← 主配置文件
│   - tools.exec.*            ← 全局 exec 默认值
│   - agents.list[].tools.exec  ← Agent 专用 exec 配置
│   - agents.defaults.sandbox  ← 沙箱配置
│   - approvals.exec.*         ← 审批转发配置
│
└── exec-approvals.json       ← 审批配置文件
    - defaults.security/ask     ← 审批默认值
    - agents.*.allowlist      ← Agent 允许列表（支持通配符）
    - agents.*.security/ask   ← Agent 审批策略
```

### 核心区别

| 方面       | openclaw.json      | exec-approvals.json              |
| ---------- | ------------------ | -------------------------------- |
| **作用**   | 定义策略和规则     | 存储审批状态和用户批准的命令模式 |
| **类型**   | 静态配置           | 动态状态文件                     |
| **持久化** | 手动编辑           | 自动更新（审批后）               |
| **优先级** | 定义 baseline 策略 | 叠加在 baseline 之上             |

---

## 策略合并机制

### 合并原则

**有效策略取 `tools.exec.*`（来自 `openclaw.json`）和审批默认值（来自 `exec-approvals.json`）中更严格的一方。**

### 配置合并优先级（从高到低）

```typescript
// 来自 src/infra/exec-approvals.ts 的 resolveExecApprovals 函数
const resolvedDefaults: Required<ExecApprovalsDefaults> = {
  security: normalizeSecurity(defaults.security, fallbackSecurity),
  ask: normalizeAsk(defaults.ask, fallbackAsk),
  askFallback: defaults.askFallback ?? fallbackAskFallback,
  autoAllowSkills: Boolean(defaults.autoAllowSkills ?? fallbackAutoAllowSkills),
};

const resolvedAgent: Required<ExecApprovalsDefaults> = {
  security: normalizeSecurity(
    agent.security ?? wildcard.security ?? resolvedDefaults.security,
    resolvedDefaults.security,
  ),
  ask: normalizeAsk(agent.ask ?? wildcard.ask ?? resolvedDefaults.ask, resolvedDefaults.ask),
  askFallback: normalizeSecurity(
    agent.askFallback ?? wildcard.askFallback ?? resolvedDefaults.askFallback,
    resolvedDefaults.askFallback,
  ),
  autoAllowSkills: Boolean(
    agent.autoAllowSkills ?? wildcard.autoAllowSkills ?? resolvedDefaults.autoAllowSkills,
  ),
};
```

**优先级顺序**：

1. 特定代理配置（`agents.<agentId>.security`/`ask`）
2. 通配符配置（`agents.*.security`/`ask`）
3. 全局默认配置（`defaults.security`/`ask`）
4. 系统默认值（`DEFAULT_SECURITY` = "deny", `DEFAULT_ASK` = "on-miss"`）

### 策略优先级规则

```
minSecurity(a, b): 返回更严格的一方
  deny (0) < allowlist (1) < full (2)

maxAsk(a, b): 返回更严格的一方
  off (0) < on-miss (1) < always (2)
```

### 配置项对应关系

| 配置项              | openclaw.json                       | exec-approvals.json                   | 优先级             |
| ------------------- | ----------------------------------- | ------------------------------------- | ------------------ |
| **默认 security**   | `tools.exec.security`               | `defaults.security`                   | 取更严格者         |
| **默认 ask**        | `tools.exec.ask`                    | `defaults.ask`                        | 取更严格者         |
| **降级策略**        | -                                   | `defaults.askFallback`                | 审批超时生效       |
| **Agent security**  | `agents.list[].tools.exec.security` | `agents.main.security`                | Agent 配置优先     |
| **Agent ask**       | `agents.list[].tools.exec.ask`      | `agents.main.ask`                     | Agent 配置优先     |
| **允许列表**        | `tools.exec.safeBins`（安全二进制） | `agents.main.allowlist`（命令白名单） | 模式匹配           |
| **AutoAllowSkills** | -                                   | `defaults.autoAllowSkills`            | Skill CLI 自动允许 |

---

## 执行审批机制

### requiresExecApproval() 判断逻辑

```typescript
export function requiresExecApproval(params: {
  ask: ExecAsk;
  security: ExecSecurity;
  analysisOk: boolean;
  allowlistSatisfied: boolean;
}): boolean {
  return (
    params.ask === "always" ||
    (params.ask === "on-miss" &&
      params.security === "allowlist" &&
      (!params.analysisOk || !params.allowlistSatisfied))
  );
}
```

**判断逻辑**：

- 如果 `ask = "always"`：总是需要审批
- 如果 `ask = "on-miss"` 且 `security = "allowlist"`：
  - 当命令不在 allowlist 中（`!allowlistSatisfied`）
  - 或者命令分析失败（`!analysisOk`）
  - 需要审批
- 其他情况（`ask = "off"` 或 `security = "deny"`/`full"`）：不需要审批

### 安全模式和审批模式

#### Security 模式优先级

| 模式          | 值  | 说明                      |
| ------------- | --- | ------------------------- |
| **deny**      | 0   | 拒绝所有执行              |
| **allowlist** | 1   | 只允许 allowlist 中的命令 |
| **full**      | 2   | 允许所有执行              |

#### Ask 模式优先级

| 模式        | 值  | 说明                                    |
| ----------- | --- | --------------------------------------- |
| **off**     | 0   | 从不自动审批                            |
| **on-miss** | 1   | 仅当不在 allowlist 中时需要审批（推荐） |
| **always**  | 2   | 总是需要用户审批                        |

### 交互规则

| security    | ask                | 行为                                  |
| ----------- | ------------------ | ------------------------------------- |
| `deny`      | 任意               | 总是拒绝                              |
| `allowlist` | `off`              | 在 allowlist 中直接执行，否则拒绝     |
| `allowlist` | `on-miss`          | 在 allowlist 中直接执行，否则需要审批 |
| `allowlist` | `always`           | 总是需要审批                          |
| `full`      | `off`              | 直接执行，无需审批                    |
| `full`      | `on-miss`/`always` | 总是需要审批                          |

### 两种审批方式

#### 1. Control UI 审批（本地）

当在 macOS 上运行 OpenClaw 应用时，会看到系统原生的审批对话框：

```typescript
// 审批请求内容
{
  type: "text",
  text: `${warningText}Approval required (id ${approvalSlug}). Approve to run; updates will arrive after completion.`,
  details: {
    status: "approval-pending",
    approvalId: "B0C8C0B3-2C2D-4F8A-9A3C-5A4B3C2D1E0F",
    approvalSlug: "exec:approval:B0C8C0B3-2C2D...",
    expiresAtMs: 1737280000000,
    host: "gateway",
    command: "npm install",
    cwd: "/home/user/projects"
  }
}
```

**用户操作按钮**：

- **Allow once** → 立即执行（不保存到 allowlist）
- **Always allow** → 保存到 allowlist + 执行
- **Deny** → 阻止执行

#### 2. 聊天渠道审批（远程）

审批请求可以转发到任何聊天渠道，用户通过**发送消息命令**来批准：

```bash
# 在聊天中回复
/approve <id> allow-once    # 允许执行一次
/approve <id> allow-always   # 添加到白名单
/approve <id> deny          # 拒绝执行
```

**配置转发**：

```json
{
  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "session", // "session" | "targets" | "both"
      "agentFilter": ["main"], // 只审批 main agent
      "sessionFilter": ["telegram"], // 只转发到 Telegram 会话
      "targets": [{ "channel": "slack", "to": "U12345678" }]
    }
  }
}
```

### 审批流程图解

```
┌─────────────────────────────────────────────┐
│  Exec 工具请求执行命令                │
└─────────────────────┬─────────────────────┘
                   │
        ┌────────▼─────────────┐
        │  加载配置并判断    │
        │  requiresExecApproval() │
        │  检查 security/ask 模式  │
        └────────┬─────────────┘
                 │
        ┌─────────▼─────────────┐
        │  需要审批吗？          │
        └────────┬─────────────┘
                 │
        ┌─────────▼─────────────┐       ┌──────────────────────────────┐
        │  否  (security=deny)    │       │  立即拒绝             │
        └──────────────────────┘       └──────────────────────────────┘
                 │
        ┌─────────▼─────────────┐
        │  是  (需要审批)        │
        └────────┬─────────────┘
                 │
        ┌─────────▼─────────────┐       ┌──────────────────────────────┐
        │  发送审批请求            │       │  ├─> Control UI (本地)      │
        │  ├─> 聊天渠道 (远程)  │       │  └─> /approve 命令         │
        └────────┬─────────────┘       └──────────────────────────────┘
                 │
        ┌─────────▼─────────────┐
        │  等待用户响应        │
        └────────┬─────────────┘
                 │
        ┌─────────▼─────────────┐       ┌──────────────────────────────┐
        │  用户批准             │       │  allow-once │ allow-always │ deny │
        └────────┬─────────────┘       └────────┬────────┬─────────────────┘
                 │                        │            │            │
        ┌─────────▼─────────────┐       │            │            │
        │  执行决策           │       │            │            │
        │  ──> 直接运行          │       │            │            │
        │  ──> 更新 allowlist     │       │            │            │
        │  ──> 拒绝            │       │            │            │
        └──────────────────────┘       └────────────┴───────────────────┘
```

---

## Socket 配置作用

### Socket 配置的定义

`socket` 配置定义了 **Gateway 和 Control UI（审批界面）之间的安全通信通道**。

```json
{
  "socket": {
    "path": "~/.openclaw/exec-approvals.sock", // Unix Socket 路径
    "token": "base64url-random-token" // 认证令牌
  }
}
```

### 工作原理

```
┌─────────────────────────────────────────────────────────────────┐
│                     macOS OpenClaw App                        │
│                  (Control UI / 审批界面)                     │
└────────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Unix Domain Socket (UDS)
                         │ + Token 认证 + HMAC 签名
                         │
┌────────────────────────┴──────────────────────────────────────────┐
│                    Gateway (Node 进程)                         │
│            ┌────────────────────────────────┐                    │
│            │  exec-approvals 服务         │                    │
│            │  监听 exec-approvals.sock   │                    │
│            └────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 配置项说明

| 配置项  | 必须 | 默认值                            | 作用                                 |
| ------- | ---- | --------------------------------- | ------------------------------------ |
| `path`  | 是   | `~/.openclaw/exec-approvals.sock` | Gateway 监听的 Unix Socket 路径      |
| `token` | 是   | 自动生成随机值                    | Gateway 和 Control UI 之间的认证令牌 |

### 安全机制

| 安全措施        | 作用                               |
| --------------- | ---------------------------------- |
| **Unix Socket** | 仅本地访问，同用户进程             |
| **Token 认证**  | 防止未授权访问                     |
| **HMAC 签名**   | 防止请求伪造和重放                 |
| **TTL 过期**    | 审批请求 120 秒后自动失效          |
| **UID 验证**    | 确保只有 Gateway 进程能读写 Socket |

### 配置生成方式

| 方式                 | 说明                                  |
| -------------------- | ------------------------------------- |
| **自动生成（推荐）** | 首次启动 Gateway 时自动生成随机 token |
| **手动配置**         | 可以自定义路径和 token，但很少需要    |

---

## 不同审批渠道的 Socket 使用

| 场景                  | 是否使用 socket | 通信方式                              |
| --------------------- | --------------- | ------------------------------------- |
| Telegram 审批         | ❌ 不使用       | HTTP API（/v1/exec/approval/resolve） |
| Slack 审批            | ❌ 不使用       | HTTP API                              |
| Discord 审批          | ❌ 不使用       | HTTP API                              |
| macOS Control UI 审批 | ✅ 使用         | Unix Domain Socket                    |

### 纯 Telegram 场景

如果你只使用 Telegram 审批，不使用 macOS Control UI：

**socket 配置需要存在，但不会实际被使用。**

```json
// exec-approvals.json - 最小配置
{
  "version": 1,
  "socket": {
    "path": "~/.openclaw/exec-approvals.sock", // ← 仍需存在
    "token": "any-value" // ← 仍需配置
  },
  "defaults": {
    "security": "deny",
    "ask": "on-miss"
  },
  "agents": {
    "main": {
      "allowlist": []
    }
  }
}
```

### 为什么文件仍需存在

| 原因               | 说明                                      |
| ------------------ | ----------------------------------------- |
| **代码检查**       | Gateway 启动时会读取并验证文件            |
| **配置完整性**     | 系统期望文件存在，即使部分配置不用        |
| **allowlist 存储** | 即使不用 socket，allowlist 仍存储在此文件 |
| **默认值引用**     | 代码中多处引用配置结构                    |

---

## 聊天渠道审批交互

### 审批请求发送到聊天渠道

#### 核心实现：`src/infra/exec-approval-forwarder.ts`

**审批消息格式构建**：

```typescript
function buildRequestMessage(request: ExecApprovalRequest, nowMs: number) {
  const lines: string[] = ["🔒 Exec approval required", `ID: ${request.id}`];

  // 命令格式化（简单命令内联，复杂命令用代码块）
  const command = formatApprovalCommand(request.request.command);
  if (command.inline) {
    lines.push(`Command: ${command.text}`);
  } else {
    lines.push("Command:");
    lines.push(command.text);
  }

  // 元数据行
  lines.push(`Node: ${request.request.node ?? "gateway"}`);
  lines.push(`Agent: ${request.request.agent ?? "main"}`);
  lines.push(`Security: ${request.request.security ?? "deny"}`);
  lines.push(`Ask: ${request.request.ask ?? "on-miss"}`);
  lines.push(`CWD: ${request.request.cwd ?? ""}`);

  // 过期时间
  const expiresIn = Math.max(0, Math.round((request.expiresAtMs - nowMs) / 1000));
  lines.push(`Expires in: ${expiresIn}s`);

  // 操作提示
  lines.push("Reply with: /approve <id> allow-once|allow-always|deny");

  return lines.join("\n");
}
```

**命令格式化函数**：

````typescript
function formatApprovalCommand(command: string): { inline: boolean; text: string } {
  // 简单命令内联显示
  if (!command.includes("\n") && !command.includes("`")) {
    return { inline: true, text: `\`${command}\`` };
  }

  // 复杂命令用代码块
  let fence = "```";
  while (command.includes(fence)) {
    fence += "`";
  }
  return {
    inline: false,
    text: `${fence}\n${command}\n${fence}`,
  };
}
````

#### Telegram 消息示例

````
🔒 Exec approval required
ID: abc-123-def-456-ghi-789
Command:
```bash
npm install lodash
````

Node: gateway
Agent: main
Security: allowlist
Ask: on-miss
CWD: /home/user/projects
Expires in: 120s
Reply with: /approve <id> allow-once|allow-always|deny

````

---

### /approve 命令解析和处理

#### 核心实现：`src/auto-reply/reply/commands-approve.ts`

**命令解析函数**：

```typescript
function parseApproveCommand(raw: string): ParsedApproveCommand | null {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("/approve")) {
    return null;
  }

  const rest = trimmed.slice("/approve".length).trim();
  if (!rest) {
    return { ok: false, error: "Usage: /approve <id> allow-once|allow-always|deny" };
  }

  // 按空格分割参数
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return { ok: false, error: "Usage: /approve <id> allow-once|allow-always|deny" };
  }

  const first = tokens[0].toLowerCase();
  const second = tokens[1].toLowerCase();

  // 支持参数交换：/approve <decision> <id> 或 /approve <id> <decision>
  if (DECISION_ALIASES[first]) {
    return {
      ok: true,
      decision: DECISION_ALIASES[first],
      id: tokens.slice(1).join(" ").trim(),
    };
  }

  if (DECISION_ALIASES[second]) {
    return {
      ok: true,
      decision: DECISION_ALIASES[second],
      id: tokens[0],
    };
  }

  return { ok: false, error: "Usage: /approve <id> allow-once|allow-always|deny" };
}
````

**决策别名映射**（灵活的输入方式）：

```typescript
const DECISION_ALIASES: Record<string, "allow-once" | "allow-always" | "deny"> = {
  allow: "allow-once",
  a: "allow-once",
  allowonce: "allow-once",
  "allow-once": "allow-once",
  allowonce: "allow-once",

  always: "allow-always",
  allowalways: "allow-always",
  "allow-always": "allow-always",
  allowalways: "allow-always",
  "allow-always": "allow-always",

  deny: "deny",
  reject: "deny",
  block: "deny",
};
```

#### 支持的命令格式

| 用户输入                      | 解析结果                                                    |
| ----------------------------- | ----------------------------------------------------------- |
| `/approve abc-123 allow-once` | `{ id: "abc-123", decision: "allow-once" }`                 |
| `/approve allow-once abc-123` | `{ id: "abc-123", decision: "allow-once" }`（支持参数交换） |
| `/approve abc-123 a`          | `{ id: "abc-123", decision: "allow-once" }`（支持简写）     |
| `/approve abc-123 always`     | `{ id: "abc-123", decision: "allow-always" }`（支持简写）   |
| `/approve abc-123 deny`       | `{ id: "abc-123", decision: "deny" }`                       |

---

### 审批决策发送到 Gateway

#### Gateway API 端点：`src/gateway/server-methods/exec-approval.ts`

```typescript
"exec.approval.resolve": async ({ params, respond, client, context }) => {
  // 1. 参数验证
  if (!validateExecApprovalResolveParams(params)) {
    respond(false, undefined, errorShape(...));
    return;
  }

  const { id, decision } = params;

  // 2. 决策验证
  const validDecisions = ["allow-once", "allow-always", "deny"];
  if (!validDecisions.includes(decision)) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid decision"));
    return;
  }

  // 3. 获取审批快照
  const snapshot = manager.getSnapshot(id);
  const resolvedBy = client?.connect?.client?.displayName ?? client?.connect?.client?.id;

  // 4. 处理决策
  const ok = manager.resolve(id, decision, resolvedBy ?? null);

  // 5. 广播决策事件
  context.broadcast("exec.approval.resolved", {
    id: id,
    decision,
    resolvedBy,
    ts: Date.now(),
    request: snapshot?.request,
  }, { dropIfSlow: true });

  // 6. 回复到原始渠道
  void opts?.forwarder?.handleResolved({
    id: id,
    decision,
    resolvedBy,
    ts: Date.now(),
    request: snapshot?.request,
  });

  // 7. 返回成功
  respond(true, { ok: true }, undefined);
}
```

---

### 不同渠道的实现差异

#### Telegram 纯文本交互

Telegram 主要依赖于纯文本命令 `/approve`，因为其按钮功能相对有限。

```
┌─────────────────────────────────────────────────────┐
│  🔒 Exec approval required                    │
│  ID: abc-123                             │
│  Command: `npm install`                   │
│  Expires in: 120s                       │
│  Reply with:                                │
│  /approve <id> allow-once|allow-always|deny │
└─────────────────────────────────────────────────────┘
```

#### Slack 按钮交互

Slack 使用 Block Kit 和按钮交互，提供更直观的用户界面。

```
┌─────────────────────────────────────────────────────┐
│  📋 Exec approval required                    │
│  ID: abc-123                             │
│  Command: `npm install`                   │
│                                              │
│  [Approve Once]  [Approve Always]  [Deny] │
└─────────────────────────────────────────────────────┘
         ↓ 点击 [Approve Always]
         ↓
┌─────────────────────────────────────────────────────┐
│  ✓ Approval allowed                           │
│  Submitted by @user                           │
└─────────────────────────────────────────────────────┘
```

#### Discord UI Components 交互

Discord 使用 UI Components，提供最丰富的显示效果。

````
┌─────────────────────────────────────────────────────┐
│  ## 🔒 Exec approval required                 │
│  Please approve the following command:            │
│                                              │
│  ### Command                                  │
│  ```bash                                     │
│  npm install lodash                          │
│  ```                                          │
│  ─────────────────────────────────────            │
│  📊 Node: gateway                              │
│  🤖 Agent: main                               │
│  🔒 Security: allowlist                       │
│  ❓ Ask: on-miss                            │
│  📁 CWD: /home/user/projects               │
│  ─────────────────────────────────────            │
│  ⏰ Expires in: 120s                        │
│  ─────────────────────────────────────            │
│  [Approve Once]  [Approve Always]  [Deny] │
└─────────────────────────────────────────────────────┘
````

---

### 错误处理

#### 重复审批

```typescript
if (explicitId && manager.getSnapshot(explicitId)) {
  respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "approval id already pending"));
  return;
}
```

**用户看到的错误**：

```
❌ Approval id abc-123 is already pending.
```

#### 未授权审批

```typescript
if (!params.command.isAuthorizedSender) {
  return {
    shouldContinue: false,
    reply: {
      text: "❌ /approve requires operator.approvals for gateway clients.",
    },
  };
}
```

#### 审批过期处理

```typescript
const handleExpired = async (requestId: string) => {
  const expiredText = buildExpiredMessage(request);
  await deliverToTargets({ cfg, targets: entry?.targets ?? [], text: expiredText, deliver });
};
```

**过期消息示例**：

```
⏰ Approval abc-123 has expired (timeout: 120s).
```

---

### 是否支持自然语言

**OpenClaw 不支持自然语言**如"同意"、"通过"、"批准"等。

只支持标准的 `/approve` 命令格式。

| 用户输入                        | 结果                              |
| ------------------------------- | --------------------------------- |
| `/approve abc-123 allow-always` | ✅ 识别正确，执行审批             |
| `/approve allow-always abc-123` | ✅ 识别正确（支持参数交换）       |
| `/approve abc-123 a`            | ✅ 识别正确（简写）               |
| `/approve abc-123 always`       | ✅ 识别正确（简写）               |
| `同意`                          | ❌ 不识别，被忽略                 |
| `通过`                          | ❌ 不识别，被忽略                 |
| `批准`                          | ❌ 不识别，被忽略                 |
| `allow`                         | ❌ 不识别，需要加 `/approve` 前缀 |

#### 为什么不支持自然语言

| 原因         | 说明                                      |
| ------------ | ----------------------------------------- |
| **精确性**   | 自然语言可能有歧义（"同意"可能指多个 ID） |
| **国际化**   | 不同语言需要不同的支持逻辑                |
| **命令冲突** | 避免与普通聊天内容混淆                    |
| **权限安全** | 明确的命令格式更容易验证权限              |

#### 给用户的提示建议

在 Telegram/Slack 等渠道配置时，可以给用户一个使用说明：

```
📋 审批命令说明：

收到审批请求后，使用以下格式回复：

/approve <ID> allow-once    # 允许执行一次
/approve <ID> allow-always   # 添加到白名单
/approve <ID> deny          # 拒绝执行

示例：
/approve abc-123 allow-always
```

---

## 通配符支持

### 配置项通配符支持对比

| 配置项                               | 支持通配符 | 匹配方式              | 使用场景                         |
| ------------------------------------ | ---------- | --------------------- | -------------------------------- |
| **safeBins**                         | ❌ 不支持  | 精确匹配（Set.has()） | 明确列出每个允许的可执行文件     |
| **safeBinProfiles**                  | ❌ 不支持  | 精确匹配（对象 key）  | 参数级别的精确控制               |
| **allowlist**（exec-approvals.json） | ✅ 支持    | Glob 模式匹配         | 灵活的通配符匹配（需要审批触发） |

### 代码证据

#### safeBins：精确匹配

```typescript
// src/infra/exec-approvals-allowlist.ts:72
const matchesSafeBin = params.safeBins.has(execName);
if (!matchesSafeBin) {
  return false; // ← 精确匹配，不匹配就拒绝
}
```

#### safeBinProfiles：精确匹配

```typescript
// src/infra/exec-approvals-allowlist.ts:90
const profile = safeBinProfiles[execName]; // ← 精确 key 查找
if (!profile) {
  return false;
}
```

#### allowlist：通配符匹配

```typescript
// src/infra/exec-command-resolution.ts:178-194
function matchesPattern(pattern: string, target: string): boolean {
  const regex = globToRegExp(normalizedPattern); // ← 转换为正则
  return regex.test(normalizedTarget);
}

function globToRegExp(pattern: string): RegExp {
  // ... 处理通配符
  if (ch === "*") {
    regex += ".*"; // ← * 转换为 .*
  }
  if (ch === "?") {
    regex += "."; // ← ? 转换为 .
  }
  // ...
}
```

### 支持的通配符（仅 allowlist）

| 通配符  | 匹配                 | 示例              |
| ------- | -------------------- | ----------------- |
| `*`     | 任意字符（任意数量） | `~/projects/**/*` |
| `?`     | 单个字符             | `file-?.sh`       |
| `[...]` | 字符类               | `file-[123].sh`   |
| `**`    | 多级目录             | `~/projects/**/*` |

### 配置示例对比

#### openclaw.json（safeBins + safeBinProfiles）：不支持通配符

```json
{
  "tools": {
    "exec": {
      "safeBins": [
        "/usr/bin/git", // ← 必须精确路径
        "/usr/local/bin/pnpm", // ← 必须精确路径
        "/usr/bin/python3" // ← 必须精确路径
      ],
      "safeBinProfiles": {
        "/usr/bin/git": {
          // ← 精确 key
          "allow": ["status", "pull"],
          "deny": ["push", "rm"]
        },
        "/usr/local/bin/pnpm": {
          // ← 精确 key
          "allow": ["install", "test", "run"]
        }
      }
    }
  }
}
```

#### exec-approvals.json（allowlist）：支持通配符

```json
{
  "agents": {
    "main": {
      "allowlist": [
        {
          "id": "uuid-1",
          "pattern": "/usr/bin/git", // ← 精确匹配也支持
          "lastUsedAt": 1737150000000
        },
        {
          "id": "uuid-2",
          "pattern": "~/projects/**/*.sh", // ← 支持 ** 通配符
          "lastUsedAt": 1737150000000
        },
        {
          "id": "uuid-3",
          "pattern": "/usr/local/bin/pnpm", // ← 支持通配符匹配
          "lastUsedAt": 1737150000000
        }
      ]
    }
  }
}
```

### 实际使用建议

**如果你想让 safeBinProfiles 支持通配符，可以通过 `allow` 配合实现：**

```json
{
  "tools": {
    "exec": {
      "safeBins": ["/usr/bin/git"],
      "safeBinProfiles": {
        "/usr/bin/git": {
          "allow": ["*"], // ← 通过 allow 匹配所有子命令
          "deny": ["push", "rm"] // ← 但仍然可以 deny 特定的
        }
      }
    }
  }
}
```

---

## 完整配置示例

### 场景 1：受限开发环境（推荐配置）

适用于需要代码查看、分析但不允许修改的场景。

```json
{
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "your-long-random-token-here"
    }
  },

  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "ro",
        "docker": {
          "binds": ["/home/user/projects:/projects:ro", "/home/user/docs:/docs:ro"],
          "network": "none",
          "readOnlyRoot": true
        }
      }
    },
    "list": [
      {
        "id": "dev-assistant",
        "workspace": "~/.openclaw/workspace",
        "tools": {
          "allow": ["read", "memory_search", "memory_get", "session_status"],
          "deny": [
            "exec",
            "bash",
            "process",
            "write",
            "edit",
            "apply_patch",
            "browser",
            "canvas",
            "nodes",
            "cron",
            "gateway",
            "sessions_spawn",
            "sessions_send"
          ]
        }
      }
    ]
  },

  "tools": {
    "exec": {
      "security": "allowlist",
      "ask": "on-miss",
      "safeBins": [],
      "safeBinProfiles": {},
      "applyPatch": {
        "workspaceOnly": true
      }
    },
    "fs": {
      "workspaceOnly": true
    },
    "elevated": {
      "enabled": false,
      "allowFrom": {}
    }
  },

  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "session",
      "agentFilter": ["main"]
    }
  },

  "logging": {
    "redactSensitive": "tools"
  }
}
```

### 场景 2：白名单模式（限制 git 命令）

适用于只想允许特定 git 命令，其他都禁用的场景。

```json
{
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "your-token-here"
    }
  },

  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "ro",
        "docker": {
          "binds": ["/home/user/projects:/projects:ro"],
          "network": "none",
          "readOnlyRoot": true
        }
      }
    },
    "list": [
      {
        "id": "main",
        "workspace": "~/.openclaw/workspace",
        "tools": {
          "allow": ["read", "exec", "memory_search", "memory_get", "session_status"],
          "deny": [
            "bash",
            "process",
            "write",
            "edit",
            "apply_patch",
            "browser",
            "canvas",
            "nodes",
            "cron",
            "gateway"
          ],
          "exec": {
            "security": "deny", // 默认全部禁止
            "ask": "on-miss", // 不在白名单时需要审批
            "safeBins": ["/usr/bin/git"], // 只允许 git
            "safeBinProfiles": {
              "/usr/bin/git": {
                "allow": ["status", "pull"], // 只允许 status 和 pull
                "deny": ["push", "fetch", "clone", "rm", "branch", "checkout", "reset", "rebase"]
              }
            }
          }
        }
      }
    ]
  },

  "tools": {
    "exec": {
      "security": "deny",
      "ask": "on-miss",
      "safeBins": ["/usr/bin/git"],
      "safeBinProfiles": {
        "/usr/bin/git": {
          "allow": ["status", "pull"],
          "deny": ["push", "fetch", "clone", "rm", "branch", "checkout", "reset", "rebase"]
        }
      },
      "applyPatch": {
        "workspaceOnly": true
      }
    },
    "fs": {
      "workspaceOnly": true
    },
    "elevated": {
      "enabled": false
    }
  },

  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "session",
      "sessionFilter": ["telegram"] // 只发送到 Telegram
    }
  }
}
```

### exec-approvals.json（对应场景 2）

```json
{
  "version": 1,
  "socket": {
    "path": "~/.openclaw/exec-approvals.sock",
    "token": "your-base64url-token"
  },
  "defaults": {
    "security": "deny",
    "ask": "on-miss",
    "askFallback": "deny",
    "autoAllowSkills": false
  },
  "agents": {
    "main": {
      "security": "deny",
      "ask": "on-miss",
      "askFallback": "deny",
      "autoAllowSkills": false,
      "allowlist": [] // 保持为空，不使用动态白名单
    },
    "*": {
      "security": "deny",
      "ask": "on-miss",
      "askFallback": "deny",
      "autoAllowSkills": false,
      "allowlist": []
    }
  }
}
```

---

## 最佳实践

### 1. 配置管理原则

| 原则                             | 说明                                             |
| -------------------------------- | ------------------------------------------------ |
| **全部配置在 openclaw.json**     | 策略定义、safeBins、safeBinProfiles 都在一个地方 |
| **exec-approvals.json 保持默认** | 只需配置 socket、defaults，allowlist 保持为空    |
| **使用白名单而非黑名单**         | 默认拒绝，明确允许需要的命令                     |

### 2. 审批模式选择

| 场景             | 推荐配置                                     |
| ---------------- | -------------------------------------------- |
| **完全受控环境** | `security: "deny"`, `ask: "off"`             |
| **渐进式信任**   | `security: "deny"`, `ask: "on-miss"`（推荐） |
| **最严格环境**   | `security: "deny"`, `ask: "always"`          |

### 3. allow-once vs allow-always

| 审批决定       | 是否写入 exec-approvals.json | 下次是否需要审批    |
| -------------- | ---------------------------- | ------------------- |
| `allow-once`   | ❌ 不写入                    | ✅ 是，仍然需要审批 |
| `allow-always` | ✅ 写入 allowlist            | ❌ 否，自动通过     |
| `deny`         | ❌ 不写入                    | ✅ 是，仍然需要审批 |

### 4. 安全检查清单

- [ ] Gateway 绑定到 loopback
- [ ] 启用 Gateway 认证（token 或 password）
- [ ] 启用 Sandbox（mode: "all"）
- [ ] 工作区访问设置为 "none" 或 "ro"
- [ ] 禁用危险控制面工具
- [ ] 配置 safeBins 和 safeBinProfiles
- [ ] 禁用网络或配置 SSRF 策略
- [ ] 启用日志脱敏
- [ ] 配置文件权限正确（700/600）
- [ ] 定期运行安全审计

### 5. 调试和验证工具

```bash
# 基础安全审计
openclaw security audit

# 深度安全审计
openclaw security audit --deep

# 沙箱配置解释
openclaw sandbox explain

# 查看审批配置
openclaw exec-approvals status

# 诊断
openclaw doctor
```

---

## 参考资料

- [OpenClaw Security](https://docs.openclaw.ai/gateway/security)
- [OpenClaw Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [Sandbox vs Tool Policy vs Elevated](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated)
- [Exec Approvals 文档](https://docs.openclaw.ai/tools/exec-approvals)
- [CLI reference: security](https://docs.openclaw.ai/cli/security)
