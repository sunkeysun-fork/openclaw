---
title: OpenClaw 安全配置详解
read_when:
  - 配置 openclaw.json 和 exec-approvals.json
  - 理解两层配置文件的协同工作机制
  - 掌握执行审批的完整流程
summary: 深入解析 OpenClaw 的双重安全配置系统，包括配置文件结构、策略合并规则、审批流程设计等核心内容
x-i18n:
  generated_at: "2026-02-24T11:30:00Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
  source_path: docs/技术分析/openclaw安全配置详解.md
  workflow: 15
---

# OpenClaw 安全配置详解

本文档深入解析 OpenClaw 的双重安全配置系统：`openclaw.json`（主配置文件）和 `exec-approvals.json`（审批配置文件）。

## 目录

- [配置文件架构](#配置文件架构)
- [策略合并机制](#策略合并机制)
- [两层配置协同详解](#两层配置协同详解)
- [执行审批机制](#执行审批机制)
- [安全配置最佳实践](#安全配置最佳实践)
- [常见配置场景](#常见配置场景)

## 配置文件架构

OpenClaw 使用两个独立的 JSON 配置文件来控制执行行为：

| 配置文件                  | 存储位置                          | 主要作用                                | 维护方式                         |
| ------------------------- | --------------------------------- | --------------------------------------- | -------------------------------- |
| **`openclaw.json`**       | `~/.openclaw/openclaw.json`       | 定义全局默认值和每个 agent 的基础配置   | 手动编辑或 CLI 命令              |
| **`exec-approvals.json`** | `~/.openclaw/exec-approvals.json` | 定义每个 agent 的命令审批规则和允许列表 | 手动编辑、Control UI 或 CLI 命令 |

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
    - agents.*.allowlist      ← Agent 允许列表
    - agents.*.security/ask   ← Agent 审批策略
```

## 策略合并机制

### 核心原则

**有效策略取 `tools.exec.*`（来自 `openclaw.json`）和审批默认值（来自 `exec-approvals.json`）中更严格的一方。**

```typescript
// 来自 src/infra/exec-approvals.ts 第 331-366 行
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

### 策略优先级规则

```
minSecurity(a, b): 返回更严格的一方
  deny (0) < allowlist (1) < full (2)

maxAsk(a, b): 返回更严格的一方
  off (0) < on-miss (1) < always (2)
```

### 合并流程图解

```
┌─────────────────────────────────────────────────────┐
│  openclaw.json (主配置)                         │
│                                                     │
│  tools: {                                          │
│    exec: {                                        │
│      security: "allowlist",    ← 默认值          │
│      ask: "on-miss",          ← 默认值          │
│    }                                               │
└─────────────────────────────────────────────────────┘
                      │
                      取更严格的值
                      ↓
┌─────────────────────────────────────────────────────┐
│  exec-approvals.json (审批配置)                     │
│                                                     │
│  defaults: {                                        │
│    security: "deny",          ← 覆盖值        │
│    ask: "always",            ← 覆盖值        │
│    askFallback: "deny",   ← 降级策略         │
│  },                                               │
│  agents: {                                          │
│    main: {                                           │
│      security: "allowlist",     ← Agent 专用       │
│      ask: "on-miss",           ← Agent 专用       │
│      allowlist: [...]           ← Agent 专用       │
│    }                                               │
│  }                                                 │
└─────────────────────────────────────────────────────┘
                      │
                      最终生效策略
                      ↓
            ┌─────────────────────┐
            │   Exec 执行决策   │
            └─────────────────────┘
```

## 两层配置协同详解

### openclaw.json 结构

```json
{
  "gateway": {
    "mode": "local", // 或 "remote"
    "bind": "loopback", // 或 "auto", "lan"
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "your-token"
    }
  },

  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all", // "off" | "non-main" | "all"
        "scope": "session", // "session" | "agent" | "shared"
        "workspaceAccess": "ro", // "none" | "ro" | "rw"
        "docker": {
          "binds": ["/home/user/projects:/projects:ro", "/home/user/docs:/docs:ro"],
          "network": "none",
          "readOnlyRoot": true
        }
      }
    },
    "list": [
      {
        "id": "my-agent",
        "workspace": "~/.openclaw/workspace",
        "tools": {
          "allow": ["read", "memory_search", "session_status"],
          "deny": ["exec", "bash", "write", "edit", "apply_patch"],
          "exec": {
            "safeBins": ["/usr/bin/python3", "/usr/bin/node"],
            "safeBinProfiles": {
              "/usr/bin/python3": {
                "allow": [],
                "deny": ["--eval", "-c", "-m", "import"]
              }
            }
          }
        }
      }
    ]
  },

  "tools": {
    "exec": {
      "security": "allowlist", // 默认安全模式
      "ask": "on-miss", // 默认审批模式
      "safeBins": [], // 默认安全二进制
      "safeBinProfiles": {},
      "applyPatch": {
        "workspaceOnly": true // applyPatch 限制在工作区
      }
    },
    "fs": {
      "workspaceOnly": true // 文件操作限制在工作区
    },
    "elevated": {
      "enabled": false, // 禁用提权门控
      "allowFrom": {}
    }
  },

  "approvals": {
    "exec": {
      "enabled": true, // 启用审批转发
      "mode": "session", // "session" | "targets" | "both"
      "agentFilter": ["main"], // 只审批特定 agent
      "sessionFilter": ["discord"], // 只转发到特定会话
      "targets": [
        { "channel": "slack", "to": "U12345678" },
        { "channel": "telegram", "to": "123456789" }
      ]
    }
  }
}
```

### exec-approvals.json 结构

```json
{
  "version": 1,
  "socket": {
    "path": "~/.openclaw/exec-approvals.sock",
    "token": "base64url-random-token"
  },
  "defaults": {
    "security": "deny", // 默认审批安全模式
    "ask": "on-miss", // 默认审批询问模式
    "askFallback": "deny", // 审批超时策略
    "autoAllowSkills": false // Skill CLI 自动允许
  },
  "agents": {
    "main": {
      "security": "allowlist", // Agent 专用安全模式
      "ask": "on-miss", // Agent 专用询问模式
      "askFallback": "deny", // Agent 专用超时策略
      "autoAllowSkills": true, // Agent 专用 Skill 自动允许
      "allowlist": [
        {
          "id": "B0C8C0B3-2C2D-4F8A-9A3C-5A4B3C2D1E0F",
          "pattern": "~/Projects/**/bin/rg",
          "lastUsedAt": 1737150000000,
          "lastUsedCommand": "rg -n TODO",
          "lastResolvedPath": "/Users/user/Projects/.../bin/rg"
        }
      ]
    },
    "dev": {
      // 可以为不同 agent 设置不同策略
    }
  }
}
```

### 配置项对应关系

| 配置项              | openclaw.json                       | exec-approvals.json        | 优先级                            |
| ------------------- | ----------------------------------- | -------------------------- | --------------------------------- | --- |
| **默认 security**   | `tools.exec.security`               | `defaults.security`        | 取更严格者                        |
| **默认 ask**        | `tools.exec.ask`                    | `defaults.ask`             | 取更严格者                        |
| **降级策略**        | -                                   | `defaults.askFallback`     | 审批超时生效                      |
| **Agent security**  | `agents.list[].tools.exec.security` | `agents.main.security`     | Agent 配置优先                    |
| **Agent ask**       | `agents.list[].tools.exec.ask`      | `agents.main.ask`          | Agent 配置优先                    |
| **允许列表**        | `tools.exec.safeBins` (安全二进制)  | `agents.main.allowlist`    | 模式匹配                          |
|                     |                                     |                            | `agents.*.allowlist` (命令白名单) |     |
| **AutoAllowSkills** | -                                   | `defaults.autoAllowSkills` | Skill CLI 自动允许                |
|                     |                                     |                            | `agents.*.autoAllowSkills`        |     |

## 执行审批机制

### 两种审批方式

#### 1. Control UI 审批（本地）

当你在 macOS 上运行 OpenClaw 应用时，会看到系统原生的审批对话框：

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

- **Allow once** → 立即执行（不保存）
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
      "sessionFilter": ["discord"], // 只转发到 Discord 会话
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

### 审批超时处理

```javascript
// 如果用户在 120 秒内未响应
if (decision === undefined) {
  deniedReason = "approval-timeout";
  emitExecSystemEvent(`Exec denied: ${params.command}`);
}
```

**超时降级策略**：

```javascript
// 来自 bash-tools.exec-host-gateway.ts
if (askFallback === "full") {
  approvedByAsk = true; // 超时时自动批准
} else if (askFallback === "allowlist") {
  if (!analysisOk || !allowlistSatisfied) {
    deniedReason = "approval-timeout (allowlist-miss)"; // 未匹配则拒绝
  } else {
    approvedByAsk = true; // 已匹配则批准
  }
} else {
  deniedReason = "approval-timeout"; // 其他情况拒绝
}
```

### 安全通信机制

```
Gateway (Node进程)          macOS App (Control UI)
        │                           │
        └───────────── Unix Socket ─────────┘
                (UDS + token + HMAC + TTL)
```

- Socket 路径：`~/.openclaw/exec-approvals.sock`
- Token 存储在：`exec-approvals.json` 中
- 安全检查：同 UID 验证、nonce 防重放、请求哈希验证

## 安全配置最佳实践

### 1. 默认拒绝原则

使用 `deny` 禁用危险工具，再用 `allow` 明确允许需要的工具。

```json
{
  "tools": {
    "deny": [
      "exec",      // 禁用 shell 执行
      "bash",     // 禁用 bash
      "process",  // 禁用进程操作
      "gateway",  // 禁用网关控制
      "cron"      // 禁用定时任务
      "nodes"     // 禁用节点操作
    ]
  }
}
```

### 2. 最小权限原则

`workspaceAccess: "none"` 是最安全的，只在必要时使用 `ro` 或 `rw`。

### 3. 多层防御

同时使用沙箱 + 工具策略 + 审计日志。

### 4. 定期审计

使用 `openclaw security audit` 检查配置漏洞。

### 5. 文件权限

确保 `~/.openclaw` 为 `700`，`openclaw.json` 为 `600`。

## 常见配置场景

### 场景 1：完全受控执行环境

```json
// openclaw.json
{
  "tools": {
    "exec": {
      "security": "deny",  // 默认拒绝
      "ask": "off"          // 不提示
    }
  }
}

// exec-approvals.json
{
  "agents": {
    "main": {
      "security": "allowlist",  // 使用白名单
      "ask": "always",        // 每次都审批
      "allowlist": [
        { "pattern": "~/Projects/**/bin/git" },
        { "pattern": "/usr/bin/node" }
      ]
    }
  }
}
```

**效果**：只能执行用户明确允许的命令，且每次都需要审批。

### 场景 2：受限开发环境（只读）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "ro", // 只读访问
        "docker": {
          "binds": [
            "/home/user/projects:/projects:ro", // 只读挂载项目目录
            "/home/user/docs:/docs:ro" // 只读挂载文档目录
          ],
          "network": "bridge"
        }
      }
    },
    "list": [
      {
        "id": "dev-assistant",
        "tools": {
          "allow": ["read", "memory_search", "memory_get", "session_status"],
          "deny": ["exec", "bash", "write", "edit", "apply_patch"]
        }
      }
    ]
  },
  "tools": {
    "fs": {
      "workspaceOnly": true
    },
    "exec": {
      "applyPatch": {
        "workspaceOnly": true
      }
    }
  }
}
```

**效果**：只能读取文件和代码，不能修改、执行命令或 apply_patch。

### 场景 3：使用 SafeBins 限制可执行二进制

```json
{
  "tools": {
    "exec": {
      "safeBins": ["/usr/bin/jq", "/usr/bin/cut", "/usr/bin/sort"],
      "safeBinProfiles": {
        "/usr/bin/python3": {
          "allow": [],
          "deny": ["--eval", "-c", "-m", "import"]
        },
        "/usr/bin/git": {
          "allow": ["status", "log", "diff", "branch"],
          "deny": ["push", "fetch", "clone", "rm"]
        }
      }
    }
  }
}

// exec-approvals.json
{
  "agents": {
    "main": {
      "allowlist": [
        { "pattern": "/home/user/scripts/*" }
      ]
    }
  }
}
```

**效果**：允许运行 jq、cut、sort 以及 scripts 目录下的命令，禁止 Python 的 eval/c/m 参数。

## 安全检查清单

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

## 参考资料

- [OpenClaw Security](https://docs.openclaw.ai/gateway/security/index)
- [OpenClaw Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [Sandbox vs Tool Policy vs Elevated](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated)
- [Exec Approvals 文档](https://docs.openclaw.ai/tools/exec-approvals)
