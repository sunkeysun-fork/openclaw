# OpenClaw 环境变量完整参考

> 基于 OpenClaw 源码分析整理，版本：2026.2.17

---

## 📁 路径和目录配置

### `OPENCLAW_STATE_DIR`

**用途：** 指定 OpenClaw 的状态目录（sessions、logs、caches 等）

**默认值：** `~/.openclaw`

**示例：**

```bash
export OPENCLAW_STATE_DIR=~/openclaw-custom
export OPENCLAW_STATE_DIR=/tmp/openclaw-test
```

**优先级：** 最高

**相关：** `CLAWDBOT_STATE_DIR`（兼容旧版）

---

### `OPENCLAW_CONFIG_PATH`

**用途：** 指定配置文件的完整路径

**默认值：** `~/.openclaw/openclaw.json`

**示例：**

```bash
export OPENCLAW_CONFIG_PATH=~/configs/my-openclaw.json
export OPENCLAW_CONFIG_PATH=/etc/openclaw/config.json
```

**使用场景：** 多实例隔离、自定义配置位置

**相关：** `CLAWDBOT_CONFIG_PATH`（兼容旧版）

---

### `OPENCLAW_HOME`

**用途：** 改变 HOME 目录，配置目录为 `$OPENCLAW_HOME/.openclaw`

**默认值：** 系统的 HOME 目录

**示例：**

```bash
export OPENCLAW_HOME=/srv/openclaw-home
# 配置目录变为：/srv/openclaw-home/.openclaw
```

**优先级：** 高于系统 HOME，低于 `OPENCLAW_STATE_DIR`

---

### `OPENCLAW_OAUTH_DIR`

**用途：** 指定 OAuth 凭证存储目录

**默认值：** `$OPENCLAW_STATE_DIR/credentials`

**示例：**

```bash
export OPENCLAW_OAUTH_DIR=~/.openclaw-oauth
```

---

### `OPENCLAW_GIT_DIR`

**用途：** 指定 Git 工作目录

**示例：**

```bash
export OPENCLAW_GIT_DIR=~/projects/openclaw-repo
```

---

## 🌐 Gateway 配置

### `OPENCLAW_GATEWAY_PORT`

**用途：** Gateway WebSocket 服务端口

**默认值：** `18789`

**示例：**

```bash
export OPENCLAW_GATEWAY_PORT=8080
openclaw gateway start --port 8080
```

**相关：** `CLAWDBOT_GATEWAY_PORT`（兼容旧版）

---

### `OPENCLAW_GATEWAY_BIND`

**用途：** Gateway 绑定地址

**可选值：**

- `loopback` - 仅本地（默认）
- `lan` - 局域网
- `auto` - 自动选择
- `custom` - 自定义

**示例：**

```bash
export OPENCLAW_GATEWAY_BIND=lan
```

**相关：** `CLAWDBOT_GATEWAY_BIND`（兼容旧版）

---

### `OPENCLAW_GATEWAY_TOKEN`

**用途：** Gateway 认证令牌（token 模式）

**示例：**

```bash
export OPENCLAW_GATEWAY_TOKEN=your-secret-token-here
```

**相关：** `CLAWDBOT_GATEWAY_TOKEN`（兼容旧版）

---

### `OPENCLAW_GATEWAY_PASSWORD`

**用途：** Gateway 认证密码（password 模式）

**示例：**

```bash
export OPENCLAW_GATEWAY_PASSWORD=your-password-here
```

**相关：** `CLAWDBOT_GATEWAY_PASSWORD`（兼容旧版）

---

### `OPENCLAW_ALLOW_MULTI_GATEWAY`

**用途：** 允许多个 Gateway 实例同时运行

**默认值：** `false`（单实例保护）

**示例：**

```bash
export OPENCLAW_ALLOW_MULTI_GATEWAY=1
```

**注意：** 仅在需要强制多实例时使用，正常情况下通过不同 `OPENCLAW_STATE_DIR` 自动隔离

---

### `OPENCLAW_DISABLE_BONJOUR`

**用途：** 禁用 mDNS/Bonjour 服务发现

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_DISABLE_BONJOUR=1
```

---

### `OPENCLAW_MDNS_HOSTNAME`

**用途：** 指定 mDNS 主机名

**示例：**

```bash
export OPENCLAW_MDNS_HOSTNAME=my-openclaw.local
```

**相关：** `CLAWDBOT_MDNS_HOSTNAME`（兼容旧版）

---

## 🔒 锁和多实例

### `OPENCLAW_ALLOW_MULTI_GATEWAY`

**用途：** 跳过单实例锁检查

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_ALLOW_MULTI_GATEWAY=1
```

**风险：** 可能导致配置文件竞争，仅用于特殊场景

---

## 🚀 启动和执行

### `OPENCLAW_NO_RESPAWN`

**用途：** 禁用进程重启（SIGUSR1 信号触发 in-process 重启）

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_NO_RESPAWN=1
```

---

### `OPENCLAW_SHELL_ENV_TIMEOUT_MS`

**用途：** Shell 环境加载超时时间（毫秒）

**默认值：** `30000`（30 秒）

**示例：**

```bash
export OPENCLAW_SHELL_ENV_TIMEOUT_MS=60000
```

---

### `OPENCLAW_LOAD_SHELL_ENV`

**用途：** 是否加载 Shell 环境

**默认值：** `true`

**示例：**

```bash
export OPENCLAW_LOAD_SHELL_ENV=0
```

---

### `OPENCLAW_DEFER_SHELL_ENV_FALLBACK`

**用途：** 延迟 Shell 环境回退

**示例：**

```bash
export OPENCLAW_DEFER_SHELL_ENV_FALLBACK=1
```

---

### `OPENCLAW_SHELL`

**用途：** 指定 Shell 路径

**示例：**

```bash
export OPENCLAW_SHELL=/bin/zsh
```

**相关：** `CLAWDBOT_SHELL`（兼容旧版）

---

## 🧩 插件和 Skills

### `OPENCLAW_BUNDLED_PLUGINS_DIR`

**用途：** 内置插件目录

**示例：**

```bash
export OPENCLAW_BUNDLED_PLUGINS_DIR=/opt/openclaw/plugins
```

---

### `OPENCLAW_BUNDLED_SKILLS_DIR`

**用途：** 内置 Skills 目录

**示例：**

```bash
export OPENCLAW_BUNDLED_SKILLS_DIR=/opt/openclaw/skills
```

---

### `OPENCLAW_BUNDLED_HOOKS_DIR`

**用途：** 内置 Hooks 目录

**示例：**

```bash
export OPENCLAW_BUNDLED_HOOKS_DIR=/opt/openclaw/hooks
```

---

### `OPENCLAW_DISABLE_PLUGIN_MANIFEST_CACHE`

**用途：** 禁用插件清单缓存

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_DISABLE_PLUGIN_MANIFEST_CACHE=1
```

---

### `OPENCLAW_PLUGIN_MANIFEST_CACHE_MS`

**用途：** 插件清单缓存时间（毫秒）

**示例：**

```bash
export OPENCLAW_PLUGIN_MANIFEST_CACHE_MS=3600000
```

---

## 🤖 Agent 配置

### `OPENCLAW_AGENT_DIR`

**用途：** Agent 目录

**示例：**

```bash
export OPENCLAW_AGENT_DIR=~/.openclaw/agents
```

---

### `OPENCLAW_CLAUDE_CLI_LOG_OUTPUT`

**用途：** 启用 Claude CLI 日志输出

**默认值：** `0`

**示例：**

```bash
export OPENCLAW_CLAUDE_CLI_LOG_OUTPUT=1
```

---

## 🧠 模型和提供商

### `OPENCLAW_ANTHROPIC_PAYLOAD_LOG`

**用途：** 启用 Anthropic API 请求/响应日志

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_ANTHROPIC_PAYLOAD_LOG=1
```

---

### `OPENCLAW_ANTHROPIC_PAYLOAD_LOG_FILE`

**用途：** 指定 Anthropic 日志文件路径

**示例：**

```bash
export OPENCLAW_ANTHROPIC_PAYLOAD_LOG_FILE=~/anthropic-logs.json
```

---

### `OPENCLAW_LIVE_ANTHROPIC_KEY`

**用途：** 实时模式 Anthropic API Key

**示例：**

```bash
export OPENCLAW_LIVE_ANTHROPIC_KEY=sk-ant-xxx
```

---

### `OPENCLAW_LIVE_ANTHROPIC_KEYS`

**用途：** 实时模式多个 Anthropic API Key（JSON 数组）

**示例：**

```bash
export OPENCLAW_LIVE_ANTHROPIC_KEYS='["sk-ant-xxx", "sk-ant-yyy"]'
```

---

### `OPENCLAW_LIVE_MODELS`

**用途：** 实时模式模型配置

**示例：**

```bash
export OPENCLAW_LIVE_MODELS='[{"id":"claude-3-5-sonnet","provider":"anthropic"}]'
```

---

### `OPENCLAW_LIVE_PROVIDERS`

**用途：** 实时模式提供商配置

**示例：**

```bash
export OPENCLAW_LIVE_PROVIDERS='[{"name":"anthropic","baseUrl":"https://api.anthropic.com"}]'
```

---

### `OPENCLAW_LIVE_MODEL_TIMEOUT_MS`

**用途：** 实时模式模型超时时间（毫秒）

**示例：**

```bash
export OPENCLAW_LIVE_MODEL_TIMEOUT_MS=120000
```

---

## 📊 缓存和性能

### `OPENCLAW_DISABLE_CONFIG_CACHE`

**用途：** 禁用配置缓存

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_DISABLE_CONFIG_CACHE=1
```

---

### `OPENCLAW_CONFIG_CACHE_MS`

**用途：** 配置缓存时间（毫秒）

**示例：**

```bash
export OPENCLAW_CONFIG_CACHE_MS=5000
```

---

### `OPENCLAW_CACHE_TRACE`

**用途：** 启用缓存追踪

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_CACHE_TRACE=1
```

---

### `OPENCLAW_CACHE_TRACE_FILE`

**用途：** 缓存追踪日志文件路径

**示例：**

```bash
export OPENCLAW_CACHE_TRACE_FILE=~/cache-trace.log
```

---

### `OPENCLAW_CACHE_TRACE_MESSAGES`

**用途：** 追踪消息缓存

**示例：**

```bash
export OPENCLAW_CACHE_TRACE_MESSAGES=1
```

---

### `OPENCLAW_CACHE_TRACE_PROMPT`

**用途：** 追踪 Prompt 缓存

**示例：**

```bash
export OPENCLAW_CACHE_TRACE_PROMPT=1
```

---

### `OPENCLAW_CACHE_TRACE_SYSTEM`

**用途：** 追踪系统缓存

**示例：**

```bash
export OPENCLAW_CACHE_TRACE_SYSTEM=1
```

---

### `OPENCLAW_SESSION_CACHE_TTL_MS`

**用途：** Session 缓存过期时间（毫秒）

**示例：**

```bash
export OPENCLAW_SESSION_CACHE_TTL_MS=3600000
```

---

### `OPENCLAW_SESSION_MANAGER_CACHE_TTL_MS`

**用途：** Session Manager 缓存过期时间（毫秒）

**示例：**

```bash
export OPENCLAW_SESSION_MANAGER_CACHE_TTL_MS=1800000
```

---

## 🌐 浏览器控制

### `OPENCLAW_BROWSER_CONTROL_MODULE`

**用途：** 指定浏览器控制模块

**示例：**

```bash
export OPENCLAW_BROWSER_CONTROL_MODULE=@openclaw/browser-playwright
```

---

### `OPENCLAW_SKIP_BROWSER_CONTROL_SERVER`

**用途：** 跳过浏览器控制服务器

**示例：**

```bash
export OPENCLAW_SKIP_BROWSER_CONTROL_SERVER=1
```

---

### `OPENCLAW_LIVE_BROWSER_CDP_URL`

**用途：** 实时模式 Chrome DevTools Protocol URL

**示例：**

```bash
export OPENCLAW_LIVE_BROWSER_CDP_URL=ws://localhost:9222
```

---

### `OPENCLAW_IMAGE_BACKEND`

**用途：** 指定图像后端

**示例：**

```bash
export OPENCLAW_IMAGE_BACKEND=openai
export OPENCLAW_IMAGE_BACKEND=anthropic
```

---

## 🖼️ Canvas

### `OPENCLAW_CANVAS_HOST_PORT`

**用途：** Canvas 主机端口

**示例：**

```bash
export OPENCLAW_CANVAS_HOST_PORT=3000
```

---

### `OPENCLAW_SKIP_CANVAS_HOST`

**用途：** 跳过 Canvas 主机

**示例：**

```bash
export OPENCLAW_SKIP_CANVAS_HOST=1
```

---

## 🎯 CLI 行为

### `OPENCLAW_HIDE_BANNER`

**用途：** 隐藏启动横幅

**示例：**

```bash
export OPENCLAW_HIDE_BANNER=1
```

---

### `OPENCLAW_DISABLE_LAZY_SUBCOMMANDS`

**用途：** 禁用懒加载子命令

**示例：**

```bash
export OPENCLAW_DISABLE_LAZY_SUBCOMMANDS=1
```

---

### `OPENCLAW_DISABLE_ROUTE_FIRST`

**用途：** 禁用路由优先模式

**示例：**

```bash
export OPENCLAW_DISABLE_ROUTE_FIRST=1
```

---

### `OPENCLAW_EAGER_CHANNEL_OPTIONS`

**用途：** 预加载通道选项

**示例：**

```bash
export OPENCLAW_EAGER_CHANNEL_OPTIONS=1
```

---

### `OPENCLAW_PROFILE`

**用途：** 配置文件名（profile 模式）

**示例：**

```bash
export OPENCLAW_PROFILE=dev
# 使用 ~/.openclaw/openclaw.dev.json
```

---

### `OPENCLAW_PREPEND_PATH`

**用途：** 预添加到 PATH 环境变量

**示例：**

```bash
export OPENCLAW_PREPEND_PATH=/usr/local/bin:/opt/custom/bin
```

---

### `OPENCLAW_ALLOW_PROJECT_LOCAL_BIN`

**用途：** 允许项目本地二进制文件

**示例：**

```bash
export OPENCLAW_ALLOW_PROJECT_LOCAL_BIN=1
```

---

### `OPENCLAW_PATH_BOOTSTRAPPED`

**用途：** 标记 PATH 已被 Bootstrap 处理

**示例：**

```bash
export OPENCLAW_PATH_BOOTSTRAPPED=1
```

---

## 📝 日志和输出

### `OPENCLAW_LOG_PREFIX`

**用途：** 日志前缀

**示例：**

```bash
export OPENCLAW_LOG_PREFIX="[OpenClaw] "
```

---

### `OPENCLAW_RAW_STREAM`

**用途：** 启用原始流输出

**示例：**

```bash
export OPENCLAW_RAW_STREAM=1
```

---

### `OPENCLAW_RAW_STREAM_PATH`

**用途：** 原始流输出文件路径

**示例：**

```bash
export OPENCLAW_RAW_STREAM_PATH=~/openclaw-stream.log
```

---

## ⏭️ 跳过功能开关

### `OPENCLAW_SKIP_CHANNELS`

**用途：** 跳过通道初始化

**示例：**

```bash
export OPENCLAW_SKIP_CHANNELS=1
```

---

### `OPENCLAW_SKIP_CRON`

**用途：** 跳过 Cron 任务

**示例：**

```bash
export OPENCLAW_SKIP_CRON=1
```

---

### `OPENCLAW_SKIP_GMAIL_WATCHER`

**用途：** 跳过 Gmail 监听器

**示例：**

```bash
export OPENCLAW_SKIP_GMAIL_WATCHER=1
```

---

### `OPENCLAW_SKIP_PROVIDERS`

**用途：** 跳过提供商初始化

**示例：**

```bash
export OPENCLAW_SKIP_PROVIDERS=1
```

---

## 🔧 Node.js 执行

### `OPENCLAW_NODE_EXEC_FALLBACK`

**用途：** Node.js 执行回退模式

**示例：**

```bash
export OPENCLAW_NODE_EXEC_FALLBACK=1
```

---

### `OPENCLAW_NODE_EXEC_HOST`

**用途：** Node.js 执行主机

**示例：**

```bash
export OPENCLAW_NODE_EXEC_HOST=remote-host:3000
```

---

### `OPENCLAW_NODE_OPTIONS_READY`

**用途：** 标记 Node.js 选项已准备

**示例：**

```bash
export OPENCLAW_NODE_OPTIONS_READY=1
```

---

## 🧪 测试和调试

### `OPENCLAW_TEST_ENV`

**用途：** 测试环境标记

**示例：**

```bash
export OPENCLAW_TEST_ENV=1
```

---

### `OPENCLAW_TEST_FAST`

**用途：** 快速测试模式

**示例：**

```bash
export OPENCLAW_TEST_FAST=1
```

---

### `OPENCLAW_TEST_MINIMAL_GATEWAY`

**用途：** 最小化 Gateway 测试

**示例：**

```bash
export OPENCLAW_TEST_MINIMAL_GATEWAY=1
```

---

### `OPENCLAW_TEST_MEMORY_UNSAFE_REINDEX`

**用途：** 不安全的内存重索引测试

**示例：**

```bash
export OPENCLAW_TEST_MEMORY_UNSAFE_REINDEX=1
```

---

### `OPENCLAW_SMOKE`

**用途：** 冒烟测试模式

**示例：**

```bash
export OPENCLAW_SMOKE=1
```

---

### `OPENCLAW_SMOKE_QR`

**用途：** 冒烟测试二维码生成

**示例：**

```bash
export OPENCLAW_SMOKE_QR=1
```

---

### `OPENCLAW_DEBUG_HEALTH`

**用途：** 健康检查调试

**示例：**

```bash
export OPENCLAW_DEBUG_HEALTH=1
```

---

### `OPENCLAW_DEBUG_MEMORY_EMBEDDINGS`

**用途：** 调试内存嵌入

**示例：**

```bash
export OPENCLAW_DEBUG_MEMORY_EMBEDDINGS=1
```

---

### `OPENCLAW_DEBUG_TELEGRAM_ACCOUNTS`

**用途：** 调试 Telegram 账号

**示例：**

```bash
export OPENCLAW_DEBUG_TELEGRAM_ACCOUNTS=1
```

---

## 🔄 实时模式 (Live Mode)

### `OPENCLAW_LIVE_GATEWAY`

**用途：** 实时模式 Gateway

**示例：**

```bash
export OPENCLAW_LIVE_GATEWAY=1
```

---

### `OPENCLAW_LIVE_MODELS`

**用途：** 实时模式模型配置（JSON）

**示例：**

```bash
export OPENCLAW_LIVE_MODELS='[{"id":"claude-3-5-sonnet","provider":"anthropic"}]'
```

---

### `OPENCLAW_LIVE_PROVIDERS`

**用途：** 实时模式提供商配置（JSON）

**示例：**

```bash
export OPENCLAW_LIVE_PROVIDERS='[{"name":"anthropic","baseUrl":"https://api.anthropic.com"}]'
```

---

### `OPENCLAW_LIVE_CLI_BACKEND`

**用途：** 实时模式 CLI 后端

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND=codex
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_COMMAND`

**用途：** 实时模式 CLI 后端命令

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_COMMAND="codex exec"
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_ARGS`

**用途：** 实时模式 CLI 后端参数

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_ARGS="--full-auto"
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_MODEL`

**用途：** 实时模式 CLI 后端模型

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_MODEL=gpt-5.2-codex
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_IMAGE_ARG`

**用途：** 实时模式 CLI 后端镜像参数

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_IMAGE_ARG="--image gpt-5.2-codex"
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_IMAGE_MODE`

**用途：** 实时模式 CLI 后端镜像模式

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_IMAGE_MODE=container
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_IMAGE_PROBE`

**用途：** 实时模式 CLI 后端镜像探测

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_IMAGE_PROBE=1
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_RESUME_PROBE`

**用途：** 实时模式 CLI 后端恢复探测

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_RESUME_PROBE=1
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_CLEAR_ENV`

**用途：** 实时模式 CLI 后端清除环境

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_CLEAR_ENV=1
```

---

### `OPENCLAW_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG`

**用途：** 实时模式 CLI 后端禁用 MCP 配置

**示例：**

```bash
export OPENCLAW_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG=1
```

---

### `OPENCLAW_LIVE_GATEWAY_MODELS`

**用途：** 实时模式 Gateway 模型配置

**示例：**

```bash
export OPENCLAW_LIVE_GATEWAY_MODELS='[{"id":"claude-3-5-sonnet"}]'
```

---

### `OPENCLAW_LIVE_GATEWAY_PROVIDERS`

**用途：** 实时模式 Gateway 提供商配置

**示例：**

```bash
export OPENCLAW_LIVE_GATEWAY_PROVIDERS='[{"name":"anthropic"}]'
```

---

### `OPENCLAW_LIVE_GATEWAY_ZAI_FALLBACK`

**用途：** 实时模式 Gateway ZAI 回退

**示例：**

```bash
export OPENCLAW_LIVE_GATEWAY_ZAI_FALLBACK=1
```

---

### `OPENCLAW_LIVE_REQUIRE_PROFILE_KEYS`

**用途：** 实时模式要求 Profile Keys

**示例：**

```bash
export OPENCLAW_LIVE_REQUIRE_PROFILE_KEYS=1
```

---

### `OPENCLAW_LIVE_TEST`

**用途：** 实时模式测试

**示例：**

```bash
export OPENCLAW_LIVE_TEST=1
```

---

### `OPENCLAW_LIVE_SETUP_TOKEN`

**用途：** 实时模式 Setup Token

**示例：**

```bash
export OPENCLAW_LIVE_SETUP_TOKEN=your-setup-token
```

---

### `OPENCLAW_LIVE_SETUP_TOKEN_MODEL`

**用途：** 实时模式 Setup Token 模型

**示例：**

```bash
export OPENCLAW_LIVE_SETUP_TOKEN_MODEL=claude-3-5-sonnet
```

---

### `OPENCLAW_LIVE_SETUP_TOKEN_PROFILE`

**用途：** 实时模式 Setup Token Profile

**示例：**

```bash
export OPENCLAW_LIVE_SETUP_TOKEN_PROFILE=default
```

---

### `OPENCLAW_LIVE_SETUP_TOKEN_VALUE`

**用途：** 实时模式 Setup Token 值

**示例：**

```bash
export OPENCLAW_LIVE_SETUP_TOKEN_VALUE=sk-ant-xxx
```

---

## 🪟 系统集成

### `OPENCLAW_NIX_MODE`

**用途：** Nix 模式（禁用自动安装）

**默认值：** `false`

**示例：**

```bash
export OPENCLAW_NIX_MODE=1
```

---

### `OPENCLAW_BASE_ENV`

**用途：** 基础环境配置

**示例：**

```bash
export OPENCLAW_BASE_ENV=production
```

---

### `OPENCLAW_TAILNET_DNS`

**用途：** Tailscale DNS 配置

**示例：**

```bash
export OPENCLAW_TAILNET_DNS=100.100.100.100
```

---

### `OPENCLAW_WIDE_AREA_DOMAIN`

**用途：** 广域域名

**示例：**

```bash
export OPENCLAW_WIDE_AREA_DOMAIN=example.com
```

---

### `OPENCLAW_SSH_PORT`

**用途：** SSH 端口

**示例：**

```bash
export OPENCLAW_SSH_PORT=2222
```

---

## 🚦 服务管理

### `OPENCLAW_SERVICE_KIND`

**用途：** 服务类型

**示例：**

```bash
export OPENCLAW_SERVICE_KIND=systemd
```

---

### `OPENCLAW_SERVICE_MARKER`

**用途：** 服务标记

**示例：**

```bash
export OPENCLAW_SERVICE_MARKER=openclaw-daemon
```

---

### `OPENCLAW_SERVICE_VERSION`

**用途：** 服务版本

**示例：**

```bash
export OPENCLAW_SERVICE_VERSION=2026.2.17
```

---

### `OPENCLAW_SYSTEMD_UNIT`

**用途：** Systemd 单元名称

**示例：**

```bash
export OPENCLAW_SYSTEMD_UNIT=openclaw-gateway.service
```

---

### `OPENCLAW_LAUNCHD_LABEL`

**用途：** macOS launchd 标签

**示例：**

```bash
export OPENCLAW_LAUNCHD_LABEL=com.openclaw.gateway
```

---

### `OPENCLAW_WINDOWS_TASK_NAME`

**用途：** Windows 任务计划程序名称

**示例：**

```bash
export OPENCLAW_WINDOWS_TASK_NAME=OpenClawGateway
```

---

## ⚙️ 其他配置

### `OPENCLAW_BUNDLED_VERSION`

**用途：** 捆绑版本号

**示例：**

```bash
export OPENCLAW_BUNDLED_VERSION=2026.2.17
```

---

### `OPENCLAW_VERSION`

**用途：** 版本号

**示例：**

```bash
export OPENCLAW_VERSION=2026.2.17
```

---

### `OPENCLAW_UPDATE_IN_PROGRESS`

**用途：** 标记更新进行中

**示例：**

```bash
export OPENCLAW_UPDATE_IN_PROGRESS=1
```

---

### `OPENCLAW_CLI_PATH`

**用途：** CLI 路径

**示例：**

```bash
export OPENCLAW_CLI_PATH=/usr/local/bin/openclaw
```

---

### `OPENCLAW_TASK_SCRIPT`

**用途：** 任务脚本

**示例：**

```bash
export OPENCLAW_TASK_SCRIPT=/opt/openclaw/tasks.sh
```

---

### `OPENCLAW_TASK_SCRIPT_NAME`

**用途：** 任务脚本名称

**示例：**

```bash
export OPENCLAW_TASK_SCRIPT_NAME=my-task
```

---

### `OPENCLAW_TTS_PREFS`

**用途：** TTS 偏好（JSON）

**示例：**

```bash
export OPENCLAW_TTS_PREFS='{"voice":"nova","speed":1.0}'
```

---

### `OPENCLAW_WATCH_COMMAND`

**用途：** 监控命令

**示例：**

```bash
export OPENCLAW_WATCH_COMMAND="openclaw status"
```

---

### `OPENCLAW_WATCH_MODE`

**用途：** 监控模式

**示例：**

```bash
export OPENCLAW_WATCH_MODE=poll
```

---

### `OPENCLAW_WATCH_SESSION`

**用途：** 监控会话

**示例：**

```bash
export OPENCLAW_WATCH_SESSION=main
```

---

### `OPENCLAW_SHOW_SECRETS`

**用途：** 显示敏感信息

**示例：**

```bash
export OPENCLAW_SHOW_SECRETS=1
```

**相关：** `CLAWDBOT_SHOW_SECRETS`（兼容旧版）

---

## 🧪 测试专用变量

以下变量仅供测试使用，生产环境不应设置：

| 变量名                                | 用途                  |
| ------------------------------------- | --------------------- |
| `OPENCLAW_TEST_CONSOLE`               | 测试控制台            |
| `OPENCLAW_TEST_FILE_LOG`              | 测试文件日志          |
| `OPENCLAW_TEST_HANDSHAKE_TIMEOUT_MS`  | 测试握手超时          |
| `OPENCLAW_TEST_LAUNCHCTL_LIST_OUTPUT` | 测试 launchctl 输出   |
| `OPENCLAW_TEST_LAUNCHCTL_LOG`         | 测试 launchctl 日志   |
| `OPENCLAW_TEST_RUNTIME_LOG`           | 测试运行时日志        |
| `OPENCLAW_TEST_SHELL`                 | 测试 Shell            |
| `OPENCLAW_TEST_TAILSCALE_BINARY`      | 测试 Tailscale 二进制 |
| `OPENCLAW_TEST_CONFIG_OVERWRITE_LOG`  | 测试配置覆盖日志      |

---

## 🔄 旧版兼容变量

以下变量用于兼容旧版本（ClawDBot/MoldBot/MoltBot）：

| 旧版变量                    | 推荐替代                    |
| --------------------------- | --------------------------- |
| `CLAWDBOT_STATE_DIR`        | `OPENCLAW_STATE_DIR`        |
| `CLAWDBOT_CONFIG_PATH`      | `OPENCLAW_CONFIG_PATH`      |
| `CLAWDBOT_GATEWAY_PORT`     | `OPENCLAW_GATEWAY_PORT`     |
| `CLAWDBOT_GATEWAY_BIND`     | `OPENCLAW_GATEWAY_BIND`     |
| `CLAWDBOT_GATEWAY_TOKEN`    | `OPENCLAW_GATEWAY_TOKEN`    |
| `CLAWDBOT_GATEWAY_PASSWORD` | `OPENCLAW_GATEWAY_PASSWORD` |
| `CLAWDBOT_MDNS_HOSTNAME`    | `OPENCLAW_MDNS_HOSTNAME`    |
| `CLAWDBOT_SHELL`            | `OPENCLAW_SHELL`            |
| `CLAWDBOT_SHOW_SECRETS`     | `OPENCLAW_SHOW_SECRETS`     |

---

## 📚 常用组合示例

### 开发多实例

```bash
# 实例 1
export OPENCLAW_STATE_DIR=~/openclaw-dev
export OPENCLAW_GATEWAY_PORT=18789
openclaw gateway start

# 实例 2
export OPENCLAW_STATE_DIR=~/openclaw-test
export OPENCLAW_GATEWAY_PORT=18790
openclaw gateway start
```

### 生产环境

```bash
export OPENCLAW_STATE_DIR=/var/lib/openclaw
export OPENCLAW_GATEWAY_PORT=8080
export OPENCLAW_GATEWAY_TOKEN=$(cat /etc/openclaw/token)
export OPENCLAW_GATEWAY_BIND=lan
openclaw gateway start
```

### 调试模式

```bash
export OPENCLAW_ANTHROPIC_PAYLOAD_LOG=1
export OPENCLAW_ANTHROPIC_PAYLOAD_LOG_FILE=~/debug-logs.json
export OPENCLAW_CACHE_TRACE=1
export OPENCLAW_CACHE_TRACE_FILE=~/cache-trace.log
openclaw gateway start --verbose
```

### Nix 模式

```bash
export OPENCLAW_NIX_MODE=1
export OPENCLAW_STATE_DIR=/nix/var/lib/openclaw
export OPENCLAW_DISABLE_BONJOUR=1
openclaw gateway start
```

---

## 📖 环境变量解析规则

### 布尔值

接受以下值为 `true`：

- `1`
- `true`
- `yes`
- `ON`
- 带空格的 `yes`

其他值为 `false`（包括 `0`, `false`, 空, `undefined`）

### 路径

- 支持波浪号 `~` 展开
- 相对路径会转换为绝对路径
- 自动创建不存在的目录

### 数值

- 端口：正整数
- 超时：毫秒数
- 缓存 TTL：毫秒数

---

## 📝 注意事项

1. **优先级：** 环境变量 > 命令行参数 > 配置文件
2. **安全：** 敏感信息（token、password）应通过安全方式传递
3. **兼容：** 旧版变量会自动映射到新变量
4. **测试：** 测试专用变量不应在生产环境使用

---

**文档版本：** 2026.2.17
**最后更新：** 2025-02-19
