# OpenCLaw 安全配置深度分析

## 目录

- [OpenCLaw 安全架构分析](#openclaw-安全架构分析)
  - [核心安全理念](#核心安全理念)
  - [三层安全控制模型](#三层安全控制模型)
  - [安全审计机制](#安全审计机制)
- [安全边界控制能力分析](#安全边界控制能力分析)
  - [限制运行目录](#限制运行目录)
  - [限制运行指令](#限制运行指令)
  - [过滤和拦截危险指令](#过滤和拦截危险指令)
- [完整安全配置示例](#完整安全配置示例)
  - [场景 1：受限开发环境 Agent（推荐配置）](#场景-1受限开发环境-agent推荐配置)
  - [场景 2：受控执行环境 Agent](#场景-2受控执行环境-agent)
  - [场景 3：只读查询 Agent（最安全）](#场景-3只读查询-agent最安全)
- [调试和验证工具](#调试和验证工具)
- [安全边界控制总结](#安全边界控制总结)

---

## OpenCLaw 安全架构分析

### 核心安全理念：访问控制优先于智能

OpenCLaw 的安全架构遵循以下核心原则：

```
优先级 1: Identity (身份) → 谁能和 Bot 对话
优先级 2: Scope (作用域) → Bot 能在哪里执行
优先级 3: Model (模型)   → 模型抗注入能力
```

**威胁模型认知**：

- AI 助手可以执行任意 shell 命令、读写文件、访问网络服务
- 攻击者可以通过社会工程欺骗 AI 执行危险操作
- **系统提示词不是可靠的防线**，硬性限制来自工具策略、沙箱和访问控制

### 三层安全控制模型

OpenCLaw 采用 **三层互补控制** 机制：

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: Sandboxing                      │
│         决定工具在哪里运行（Docker 容器 vs 主机）            │
│         - mode: "off" | "non-main" | "all"                │
│         - scope: "session" | "agent" | "shared"             │
│         - workspaceAccess: "none" | "ro" | "rw"            │
├─────────────────────────────────────────────────────────────┤
│                 Layer 2: Tool Policy                        │
│              决定哪些工具可用/可调用                          │
│         - tools.allow / tools.deny                          │
│         - tools.safeBins / safeBinProfiles                   │
│         - tools.fs.workspaceOnly                           │
├─────────────────────────────────────────────────────────────┤
│                 Layer 3: Elevated                           │
│              exec 工具的逃逸机制（主机运行）                  │
│         - tools.elevated.enabled                            │
│         - tools.elevated.allowFrom                          │
└─────────────────────────────────────────────────────────────┘
```

#### 架构关系图

```
                    ┌─────────────────────┐
                    │   Tool Policy       │
                    │  (allow/deny)       │
                    │  - deny 优先级最高   │
                    │  - allow 白名单       │
                    └──────────┬──────────┘
                               │
                      ┌────────▼─────────┐
                      │   Sandbox Mode    │
                      │  (决定执行位置)    │
                      │  - mode: all/off   │
                      │  - scope: session  │
                      └────────┬─────────┘
                               │
           ┌───────────────────┴───────────────────┐
           │                                       │
    ┌──────▼──────┐                         ┌──────▼──────┐
    │   Sandbox   │                         │    Host     │
    │  (Docker)   │                         │   (Elevated) │
    └──────┬──────┘                         └─────────────┘
           │
    ┌──────▼──────┐
    │   Container │
    │  内部限制:  │
    │  - 工作区访问│  ← workspaceAccess
    │  - 网络     │  ← docker.network: "none"
    │  - Bind 挂载│  ← docker.binds
    └─────────────┘
```

### 安全审计机制

OpenCLaw 提供内置安全审计工具：

```bash
# 基础审计
openclaw security audit

# 深度审计
openclaw security audit --deep
```

#### 关键审计项（按优先级排序）

| checkId                                            | 严重级别      | 问题描述                                                           | 主要修复路径                                                     | 自动修复 |
| -------------------------------------------------- | ------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | -------- |
| `fs.state_dir.perms_world_writable`                | critical      | 其他用户可修改完整 OpenCLaw 状态                                   | 文件系统权限 `~/.openclaw`                                       | 是       |
| `fs.config.perms_writable`                         | critical      | 其他人可修改认证/工具策略/配置                                     | `~/.openclaw/openclaw.json` 权限                                 | 是       |
| `fs.config.perms_world_readable`                   | critical      | 配置可暴露令牌/设置                                                | 配置文件权限                                                     | 是       |
| `gateway.bind_no_auth`                             | critical      | 远程绑定无共享密钥                                                 | `gateway.bind`, `gateway.auth.*`                                 | 否       |
| `gateway.loopback_no_auth`                         | critical      | 反向代理 loopback 可能未认证                                       | `gateway.auth.*`, 代理设置                                       | 否       |
| `gateway.http.no_auth`                             | warn/critical | Gateway HTTP API 可在 `auth.mode="none"` 下访问                    | `gateway.auth.mode`, `gateway.http.endpoints.*`                  | 否       |
| `gateway.tailscale_funnel`                         | critical      | 公共互联网暴露                                                     | `gateway.tailscale.mode`                                         | 否       |
| `gateway.control_ui.allowed_origins_required`      | critical      | 非 loopback Control UI 无显式浏览器源 allowlist                    | `gateway.controlUi.allowedOrigins`                               | 否       |
| `discovery.mdns_full_mode`                         | warn/critical | mDNS 完整模式在本地网络广播 `cliPath`/`sshPort` 元数据             | `discovery.mdns.mode`                                            | 否       |
| `sandbox.docker_config_mode_off`                   | warn          | Sandbox Docker 配置存在但未激活                                    | `agents.*.sandbox.mode`                                          | 否       |
| `tools.exec.host_sandbox_no_sandbox_defaults`      | warn          | `exec host=sandbox` 在沙箱关闭时解析为主机执行                     | `tools.exec.host`, `agents.defaults.sandbox.mode`                | 否       |
| `tools.exec.safe_bins_interpreter_unprofiled`      | warn          | `safeBins` 中的解释器/运行时二进制文件无显式配置文件，扩大执行风险 | `tools.exec.safeBins`, `tools.exec.safeBinProfiles`              | 否       |
| `security.exposure.open_groups_with_runtime_or_fs` | critical/warn | 开放群组可在无沙箱/工作区守卫的情况下访问命令/文件工具             | `channels.*.groupPolicy`, `tools.deny`, `tools.fs.workspaceOnly` | 否       |
| `plugins.tools_reachable_permissive_policy`        | warn          | 扩展工具在宽松上下文中可访问                                       | `tools.profile` + 工具 allow/deny                                | 否       |

---

## 安全边界控制能力分析

### 限制运行目录

OpenCLaw **完全支持** 运行目录限制，提供多层次控制机制。

#### 能力矩阵

| 能力                 | 支持程度    | 实现方式                    | 配置项                                      |
| -------------------- | ----------- | --------------------------- | ------------------------------------------- |
| **隔离工作区**       | ✅ 完全支持 | 只能访问沙箱工作区          | `workspaceAccess: "none"`                   |
| **只读访问工作区**   | ✅ 完全支持 | 工作区挂载为只读            | `workspaceAccess: "ro"`                     |
| **自定义目录挂载**   | ✅ 完全支持 | 额外挂载主机目录            | `docker.binds`                              |
| **限制文件操作范围** | ✅ 完全支持 | 强制限制在工作区内          | `tools.fs.workspaceOnly: true`              |
| **applyPatch 限制**  | ✅ 完全支持 | applyPatch 只能在工作区操作 | `tools.exec.applyPatch.workspaceOnly: true` |

#### 配置示例

**方案 A：完全隔离 - 只能访问沙箱工作区**

```yaml
agents:
  defaults:
    sandbox:
      mode: "all"
      scope: "session"
      workspaceAccess: "none" # 只看到 ~/.openclaw/sandboxes 下的工作区
```

**方案 B：只读访问特定目录**

```yaml
agents:
  defaults:
    sandbox:
      mode: "all"
      scope: "session"
      workspaceAccess: "ro" # 工作区只读
      docker:
        binds:
          - "/home/user/projects:/projects:ro" # 只读挂载项目目录
          - "/home/user/docs:/docs:ro" # 只读挂载文档目录
          - "/var/data:/data:ro" # 只读数据目录
```

**方案 C：配合 workspaceOnly 限制文件操作**

```yaml
tools:
  fs:
    workspaceOnly: true # 强制所有文件操作限制在工作区内
  exec:
    applyPatch:
      workspaceOnly: true # applyPatch 只能在工作区操作
```

#### 目录限制机制图解

```
主机文件系统
├── ~/.openclaw/
│   ├── sandboxes/              ← sandbox 访问（默认，workspaceAccess: "none"）
│   └── workspace-personal/      ← agent 工作区
│                                └─ workspaceAccess: "ro" 时只读挂载到 /agent
│                                └─ workspaceAccess: "rw" 时读写挂载到 /workspace
│
├── /home/user/
│   ├── projects/               ← 需要显式 binds 才能访问
│   ├── secrets/                ← ⚠️ 危险！不要 binds
│   └── .ssh/                  ← ⚠️ 危险！不要 binds
│
├── /etc/                       ← ⚠️ OpenCLaw 自动阻止
├── /proc/                      ← ⚠️ OpenCLaw 自动阻止
├── /sys/                       ← ⚠️ OpenCLaw 自动阻止
└── /dev/                       ← ⚠️ OpenCLaw 自动阻止
```

#### Workspace Access 三种模式详解

| 模式            | 挂载点                               | 写权限                               | 使用场景       |
| --------------- | ------------------------------------ | ------------------------------------ | -------------- |
| `"none"` (默认) | `~/.openclaw/sandboxes/<session-id>` | ✅ 完全隔离，只能访问沙箱工作区      | 最高安全级别   |
| `"ro"`          | `/agent` (只读)                      | ❌ 禁用 `write`/`edit`/`apply_patch` | 读取配置和代码 |
| `"rw"`          | `/workspace` (读写)                  | ✅ 完整访问                          | 受控开发环境   |

---

### 限制运行指令

OpenCLaw **完全支持** 运行指令限制，从工具级别到参数级别的精细化控制。

#### 能力矩阵

| 能力                 | 支持程度    | 实现方式             | 配置项                         |
| -------------------- | ----------- | -------------------- | ------------------------------ |
| **完全禁用 exec**    | ✅ 完全支持 | 禁用执行工具         | `tools.deny: ["exec"]`         |
| **限制可执行二进制** | ✅ 完全支持 | 白名单指定可执行文件 | `tools.exec.safeBins`          |
| **参数级别限制**     | ✅ 完全支持 | 禁用特定参数/选项    | `tools.exec.safeBinProfiles`   |
| **工具白名单**       | ✅ 完全支持 | 只允许指定工具       | `tools.allow`                  |
| **工具黑名单**       | ✅ 完全支持 | 禁用危险工具         | `tools.deny`                   |
| **组级别控制**       | ✅ 完全支持 | 按 `group:*` 控制    | `group:runtime`, `group:fs` 等 |

#### 配置示例

**方案 A：完全禁用命令执行**

```yaml
tools:
  deny: ["exec", "bash", "process"]
```

**方案 B：限制只允许特定安全工具**

```yaml
tools:
  allow: ["read", "memory_search", "memory_get", "session_status"]
  deny: [
      "exec", # 禁用 shell 执行
      "bash", # 禁用 bash
      "process", # 禁用进程操作
      "write", # 禁用写文件
      "edit", # 禁用编辑
      "apply_patch", # 禁用补丁应用
      "browser", # 禁用浏览器
      "canvas", # 禁用画布
      "nodes", # 禁用节点操作
      "cron", # 禁用定时任务
      "gateway", # 禁用网关控制
    ]
```

**方案 C：使用 safeBins 限制可执行二进制**

```yaml
tools:
  exec:
    safeBins:
      - /usr/bin/python3
      - /usr/bin/git
      - /usr/bin/npm
    safeBinProfiles:
      /usr/bin/python3:
        allow: []
        deny: ["--eval", "-c", "-m", "import"] # 禁用代码执行参数
      /usr/bin/git:
        allow: ["status", "log", "diff", "branch"]
        deny: ["push", "fetch", "clone", "rm"] # 禁用网络/破坏性操作
      /usr/bin/npm:
        allow: ["install", "test", "run"]
        deny: ["publish", "unpublish", "owner"]
```

**方案 D：使用 group 简写进行批量控制**

```yaml
tools:
  sandbox:
    tools:
      allow: ["group:memory", "group:sessions", "session_status"]
      deny: ["group:runtime", "group:fs", "group:ui", "group:automation"]
```

#### 支持的组别名

| 组名               | 包含工具                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `group:runtime`    | `exec`, `bash`, `process`                                                                |
| `group:fs`         | `read`, `write`, `edit`, `apply_patch`                                                   |
| `group:sessions`   | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status` |
| `group:memory`     | `memory_search`, `memory_get`                                                            |
| `group:ui`         | `browser`, `canvas`                                                                      |
| `group:automation` | `cron`, `gateway`                                                                        |
| `group:messaging`  | `message`                                                                                |
| `group:nodes`      | `nodes`                                                                                  |
| `group:openclaw`   | 所有内置 OpenCLaw 工具（不含提供商插件）                                                 |

#### safeBinProfiles 工作原理

```
输入: git push origin main
       ↓
   检查 safeBins
       ↓
   /usr/bin/git 在白名单中 ✓
       ↓
   检查 safeBinProfiles
       ↓
   "push" 在 deny 列表中 ✗
       ↓
   【拒绝执行】
```

---

### 过滤和拦截危险指令

OpenCLaw **完全支持** 危险指令的过滤和拦截。

#### 能力矩阵

| 能力                 | 支持程度    | 实现方式       | 配置项                                  |
| -------------------- | ----------- | -------------- | --------------------------------------- |
| **危险工具拦截**     | ✅ 完全支持 | 禁用控制面工具 | `tools.deny: ["gateway", "cron"]`       |
| **网络访问限制**     | ✅ 完全支持 | 禁用容器网络   | `docker.network: "none"`                |
| **SSRF 防护**        | ✅ 完全支持 | 禁止访问内网   | `browser.ssrfPolicy`                    |
| **私有网络访问控制** | ✅ 完全支持 | 严格模式       | `dangerouslyAllowPrivateNetwork: false` |
| **域名白名单**       | ✅ 完全支持 | 只允许特定域名 | `hostnameAllowlist`                     |

#### 配置示例

**危险指令拦截完整配置**

```yaml
# 拦截危险控制面工具
tools:
  deny: [
      "gateway", # 可修改配置
      "cron", # 可创建持久任务
      "sessions_spawn", # 可创建子会话
      "sessions_send", # 可发送消息
      "nodes", # 高权限节点操作
    ]

# 限制网络相关工具
browser:
  ssrfPolicy:
    dangerouslyAllowPrivateNetwork: false # 禁止访问内网
    hostnameAllowlist: ["*.example.com"] # 只允许白名单域名
    allowedHostnames: ["localhost"]

# 沙箱网络隔离
agents:
  defaults:
    sandbox:
      mode: "all"
      docker:
        network: "none" # 完全禁用网络（默认）
```

#### SSRF 防护详细配置

```yaml
browser:
  ssrfPolicy:
    # 严格模式：禁止访问私有/内网/特殊用途目的地址
    dangerouslyAllowPrivateNetwork: false

    # 域名白名单（通配符模式）
    hostnameAllowlist:
      - "*.example.com"
      - "*.api.internal"
      - "example.com"

    # 精确主机名例外（包括被阻止的名称）
    allowedHostnames:
      - "localhost"
      - "127.0.0.1"
```

#### 控制面工具风险说明

| 工具             | 风险                                                | 建议配置         |
| ---------------- | --------------------------------------------------- | ---------------- |
| `gateway`        | 可调用 `config.apply`、`config.patch`、`update.run` | 非受信任环境禁用 |
| `cron`           | 可创建持续运行的定时任务                            | 非受信任环境禁用 |
| `sessions_spawn` | 可创建子会话绕过限制                                | 非受信任环境禁用 |
| `sessions_send`  | 可向任意会话发送消息                                | 非受信任环境禁用 |
| `nodes`          | 高权限节点操作（相机/屏幕/联系人/日历/SMS）         | 非受信任环境禁用 |

---

## 完整安全配置示例

### 场景 1：受限开发环境 Agent（推荐配置）

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
        "workspace": "~/.openclaw/workspace-dev",
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
      "safeBins": [],
      "safeBinProfiles": {},
      "applyPatch": {
        "workspaceOnly": true
      }
    },
    "fs": {
      "workspaceOnly": true
    }
  },
  "logging": {
    "redactSensitive": "tools",
    "redactPatterns": ["sk-.*", "Bearer\\s+[\\w-]+", "password\\s*=\\s*\\S+"]
  }
}
```

### 场景 2：受控执行环境 Agent

适用于需要执行代码测试、构建等操作的场景。

```json
{
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "your-token"
    }
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "agent",
        "workspaceAccess": "rw",
        "docker": {
          "binds": ["/home/user/app:/workspace/app:rw"],
          "network": "bridge"
        }
      }
    },
    "list": [
      {
        "id": "task-runner",
        "tools": {
          "allow": ["read", "write", "edit", "exec", "memory_search", "memory_get"],
          "deny": [
            "bash",
            "process",
            "browser",
            "canvas",
            "nodes",
            "cron",
            "gateway",
            "sessions_spawn"
          ],
          "exec": {
            "safeBins": ["/usr/bin/python3", "/usr/bin/node", "/usr/bin/npm"],
            "safeBinProfiles": {
              "/usr/bin/python3": {
                "allow": [],
                "deny": ["--eval", "-c", "-m", "import"]
              },
              "/usr/bin/npm": {
                "allow": ["install", "test", "run"],
                "deny": ["publish", "unpublish", "owner"]
              }
            }
          }
        }
      }
    ]
  },
  "tools": {
    "elevated": {
      "enabled": false,
      "allowFrom": {}
    }
  }
}
```

### 场景 3：只读查询 Agent（最安全）

适用于日志分析、配置查询等只读场景。

```json
{
  "agents": {
    "list": [
      {
        "id": "read-only",
        "workspace": "~/.openclaw/workspace-readonly",
        "sandbox": {
          "mode": "all",
          "scope": "session",
          "workspaceAccess": "none",
          "docker": {
            "binds": ["/var/log:/logs:ro", "/etc/config:/config:ro"],
            "network": "none"
          }
        },
        "tools": {
          "allow": ["read", "session_status"],
          "deny": [
            "write",
            "edit",
            "apply_patch",
            "exec",
            "bash",
            "process",
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
    "fs": {
      "workspaceOnly": true
    },
    "exec": {
      "safeBins": []
    }
  }
}
```

---

## 调试和验证工具

### Sandbox Explain

查看当前会话的有效沙箱配置：

```bash
# 查看当前会话的沙箱配置
openclaw sandbox explain

# 查看特定会话的配置
openclaw sandbox explain --session agent:main:main

# 查看特定 agent 的配置
openclaw sandbox explain --agent work

# 输出 JSON 格式的完整配置
openclaw sandbox explain --json
```

**输出信息包括**：

- 有效的沙箱模式/作用域/工作区访问
- 会话是否被沙箱化（main vs non-main）
- 有效的沙箱工具 allow/deny（以及来源）
- Elevated 门控和修复键路径

### Security Audit

安全审计工具：

```bash
# 基础安全审计
openclaw security audit

# 深度安全审计
openclaw security audit --deep
```

### Doctor

文件权限检查和配置诊断：

```bash
# 运行诊断
openclaw doctor

# 生成 gateway token
openclaw doctor --generate-gateway-token
```

---

## 安全边界控制总结

### OpenCLaw 支持的安全边界控制

| 边界类型         | 支持程度    | 主要配置项                                  |
| ---------------- | ----------- | ------------------------------------------- |
| **文件系统边界** | ✅ 完全支持 | `workspaceAccess`、`binds`、`workspaceOnly` |
| **执行边界**     | ✅ 完全支持 | `safeBins`、`safeBinProfiles`、`allow/deny` |
| **网络边界**     | ✅ 完全支持 | `docker.network`、`ssrfPolicy`              |
| **工具边界**     | ✅ 完全支持 | `tools.allow/deny`、`elevated`              |
| **会话边界**     | ✅ 完全支持 | `scope`、`dmScope`、allowlists              |

### 实施路线图

```
需求优先级 1: 限制运行目录
├─ 启用 sandbox: mode: "all"
├─ 设置 workspaceAccess: "ro" 或 "none"
└─ 使用 binds 精确控制目录访问

需求优先级 2: 限制运行指令
├─ 禁用危险工具: deny: ["exec", "bash", "process"]
├─ 使用 safeBins 白名单指定可执行文件
└─ 用 safeBinProfiles 限制参数

需求优先级 3: 拦截危险指令
├─ 禁用控制面工具: deny: ["gateway", "cron", "nodes"]
├─ 网络隔离: docker.network: "none"
└─ SSRF 防护: browser.ssrfPolicy
```

### 最佳实践

1. **默认拒绝原则**：使用 `deny` 禁用危险工具，再用 `allow` 明确允许需要的工具

2. **最小权限原则**：`workspaceAccess: "none"` 是最安全的，只在必要时使用 `ro` 或 `rw`

3. **多层防御**：同时使用沙箱 + 工具策略 + 审计日志

4. **定期审计**：使用 `openclaw security audit` 检查配置漏洞

5. **监控日志**：启用 `logging.redactSensitive` 并定期审查会话记录

6. **文件权限**：确保 `~/.openclaw` 为 `700`，`openclaw.json` 为 `600`

7. **网络隔离**：默认使用 `docker.network: "none"`，仅在必要时开放

8. **模型选择**：对于启用工具的 Agent，使用更强的模型（如 Opus 4.6）

### 安全配置检查清单

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

---

## 附录：配置参考

### 沙箱模式说明

| mode         | 说明                             |
| ------------ | -------------------------------- |
| `"off"`      | 不使用沙箱，所有工具在主机上运行 |
| `"non-main"` | 只对非主会话进行沙箱             |
| `"all"`      | 所有会话都进行沙箱               |

### 沙箱作用域说明

| scope              | 说明                     |
| ------------------ | ------------------------ |
| `"session"` (默认) | 每个会话一个容器         |
| `"agent"`          | 每个 agent 一个容器      |
| `"shared"`         | 所有沙箱会话共享一个容器 |

### 工作区访问说明

| workspaceAccess | 挂载点                               | 写权限     |
| --------------- | ------------------------------------ | ---------- |
| `"none"` (默认) | `~/.openclaw/sandboxes/<session-id>` | 完全隔离   |
| `"ro"`          | `/agent` (只读)                      | 禁用写操作 |
| `"rw"`          | `/workspace` (读写)                  | 完整访问   |

---

## 参考资料

- [OpenClaw Security](https://docs.openclaw.ai/gateway/security/index)
- [OpenClaw Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [Sandbox vs Tool Policy vs Elevated](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated)
