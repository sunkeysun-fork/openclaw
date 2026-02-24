# OpenClaw 机器迁移指南

> 本机：`~/.openclaw/` → 新机器：`~/.openclaw/`

---

## 📦 必须迁移的内容

### 1️⃣ 配置文件（核心）

```bash
~/.openclaw/openclaw.json
```

**说明：** 主配置文件，包含所有 Gateway、Agent、Channel、Provider 设置

**迁移方式：**

```bash
# 打包
tar czf openclaw-config.tar.gz ~/.openclaw/openclaw.json*

# 或者只复制主配置
cp ~/.openclaw/openclaw.json ~/backup/openclaw-config.json
```

---

### 2️⃣ 会话和记忆（重要）

#### **记忆数据库**

```bash
~/.openclaw/memory/main.sqlite
```

**说明：** 长期记忆、聊天历史、搜索索引

#### **Workspace 文件**

```bash
~/.openclaw/workspace/
```

**包含：**

- `AGENTS.md` - Agent 配置和说明
- `SOUL.md` - AI 个性定义
- `USER.md` - 用户信息
- `MEMORY.md` - 长期记忆
- `memory/YYYY-MM-DD.md` - 每日记忆
- `TOOLS.md` - 本地工具配置
- `.claude/` - Claude Code 配置
- `.clawhub/` - ClawHub Skills 缓存
- `skills/` - 自定义 Skills

**迁移方式：**

```bash
# 整个 workspace 打包
tar czf workspace.tar.gz ~/.openclaw/workspace/

# 或使用 rsync（推荐）
rsync -avz ~/.openclaw/workspace/ user@newhost:~/.openclaw/workspace/
```

---

### 3️⃣ 认证和配对（关键）

```bash
~/.openclaw/credentials/
```

**包含：**

- `telegram-pairing.json` - Telegram 配对信息
- `telegram-allowFrom.json` - Telegram 允许列表
- `feishu-pairing.json` - Feishu 配对信息
- `feishu-allowFrom.json` - Feishu 允许列表

**⚠️ 注意：**

- 机器特定认证可能无法迁移（如 WhatsApp 会话文件）
- 配对信息通常是可迁移的
- 建议迁移后重新配对测试

---

### 4️⃣ Cron 任务（可选）

```bash
~/.openclaw/cron/
```

**包含：**

- `jobs.json` - 定时任务配置
- `jobs.json.bak` - 定时任务备份
- `runs/` - 定时任务执行记录

**迁移方式：**

```bash
tar czf cron-jobs.tar.gz ~/.openclaw/cron/
```

---

### 5️⃣ Agent 数据（推荐）

```bash
~/.openclaw/agents/
```

**包含：**

- `main/` - 主 Agent 配置
- `fin/` - 金融 Agent（如有）

**迁移方式：**

```bash
tar czf agents.tar.gz ~/.openclaw/agents/
```

---

## 🔧 可选迁移的内容

### 浏览器数据

```bash
~/.openclaw/browser/
~/.openclaw/media/
```

**说明：** 浏览器缓存、截图、媒体文件

**建议：** 重新生成，不迁移（体积大且机器相关）

---

### 执行批准

```bash
~/.openclaw/exec-approvals.json
```

**说明：** 代码执行批准历史

**建议：** 不迁移（安全考虑）

---

### 日志文件

```bash
~/.openclaw/logs/
```

**说明：** OpenClaw 运行日志

**建议：** 不迁移（体积大，历史日志）

---

### 临时文件

```bash
~/.openclaw/telegram/
~/.openclaw/delivery-queue/
~/.openclaw/devices/
~/.openclaw/completions/
~/.openclaw/extensions/
```

**建议：** 不迁移（临时数据）

---

## 📋 完整迁移清单

### ✅ 必须迁移（完整功能）

| 项目       | 路径                             | 重要性  | 原因       |
| ---------- | -------------------------------- | ------- | ---------- |
| 主配置     | `~/.openclaw/openclaw.json`      | 🔴 必须 | 所有设置   |
| 记忆数据库 | `~/.openclaw/memory/main.sqlite` | 🔴 必须 | 聊天历史   |
| Workspace  | `~/.openclaw/workspace/`         | 🔴 必须 | 用户数据   |
| 认证信息   | `~/.openclaw/credentials/`       | 🔴 必须 | 通道配对   |
| Cron 任务  | `~/.openclaw/cron/`              | 🟡 推荐 | 定时任务   |
| Agent 配置 | `~/.openclaw/agents/`            | 🟡 推荐 | Agent 设置 |

### ⚪ 可选迁移（增强体验）

| 项目        | 路径                             | 建议操作 |
| ----------- | -------------------------------- | -------- |
| 配置备份    | `~/.openclaw/openclaw.json.bak*` | 可选     |
| 检查更新    | `~/.openclaw/update-check.json`  | 不需要   |
| Canvas 数据 | `~/.openclaw/canvas/`            | 不迁移   |

### ❌ 不建议迁移

| 项目       | 路径                              | 原因             |
| ---------- | --------------------------------- | ---------------- |
| 日志       | `~/.openclaw/logs/`               | 体积大、历史数据 |
| 浏览器缓存 | `~/.openclaw/browser/`            | 机器相关         |
| 媒体文件   | `~/.openclaw/media/`              | 体积大           |
| 批准历史   | `~/.openclaw/exec-approvals.json` | 安全考虑         |
| 临时队列   | `~/.openclaw/delivery-queue/`     | 过期数据         |

---

## 🚀 迁移步骤

### 步骤 1：打包必须内容

```bash
# 创建备份目录
mkdir -p ~/openclaw-migration

# 打包配置
tar czf ~/openclaw-migration/config.tar.gz \
  ~/.openclaw/openclaw.json \
  ~/.openclaw/openclaw.json.bak*

# 打包记忆
tar czf ~/openclaw-migration/memory.tar.gz \
  ~/.openclaw/memory/main.sqlite

# 打包 workspace
tar czf ~/openclaw-migration/workspace.tar.gz \
  ~/.openclaw/workspace/

# 打包认证
tar czf ~/openclaw-migration/credentials.tar.gz \
  ~/.openclaw/credentials/

# 打包 cron（可选）
tar czf ~/openclaw-migration/cron.tar.gz \
  ~/.openclaw/cron/

# 打包 agents（可选）
tar czf ~/openclaw-migration/agents.tar.gz \
  ~/.openclaw/agents/
```

---

### 步骤 2：传输到新机器

```bash
# 方法 1：SCP
scp ~/openclaw-migration/*.tar.gz user@newhost:~/

# 方法 2：rsync（推荐）
rsync -avz ~/openclaw-migration/ user@newhost:~/openclaw-migration/

# 方法 3：SFTP
# 使用 FileZilla 或其他 SFTP 客户端上传

# 方法 4：云存储
# 上传到 Google Drive / Dropbox / iCloud
```

---

### 步骤 3：在新机器上解压

```bash
# 创建 .openclaw 目录
mkdir -p ~/.openclaw

# 解压配置
tar xzf ~/openclaw-migration/config.tar.gz -C ~/.openclaw/

# 解压记忆
tar xzf ~/openclaw-migration/memory.tar.gz -C ~/.openclaw/

# 解压 workspace
tar xzf ~/openclaw-migration/workspace.tar.gz -C ~/.openclaw/

# 解压认证
tar xzf ~/openclaw-migration/credentials.tar.gz -C ~/.openclaw/

# 解压 cron（可选）
tar xzf ~/openclaw-migration/cron.tar.gz -C ~/.openclaw/

# 解压 agents（可选）
tar xzf ~/openclaw-migration/agents.tar.gz -C ~/.openclaw/

# 设置权限
chmod -R 700 ~/.openclaw/
```

---

### 步骤 4：验证配置

```bash
# 检查配置文件
cat ~/.openclaw/openclaw.json

# 检查 workspace
ls -la ~/.openclaw/workspace/

# 检查记忆数据库
ls -la ~/.openclaw/memory/

# 检查认证
ls -la ~/.openclaw/credentials/
```

---

### 步骤 5：启动 OpenClaw

```bash
# 停止现有实例（如有）
openclaw gateway stop

# 启动新实例
openclaw gateway start

# 查看状态
openclaw status
```

---

## 🔍 验证清单

### ✅ 基础功能

- [ ] OpenClaw Gateway 成功启动
- [ ] 端口正常监听（默认 18789）
- [ ] 配置文件正确加载
- [ ] Workspace 路径正确

### ✅ 通道功能

- [ ] Telegram 机器人正常响应
- [ ] Feishu 机器人正常响应
- [ ] 配对状态正常

### ✅ Agent 功能

- [ ] 主 Agent 会话正常
- [ ] 记忆数据库可访问
- [ ] Workspace 文件可读写

### ✅ 定时任务

- [ ] Cron 任务已导入
- [ ] 定时任务正常执行
- [ ] 执行记录正常

---

## ⚠️ 注意事项

### 1. 端口冲突

如果新机器端口 18789 被占用，需要修改：

```bash
# 方法 1：修改配置文件
vim ~/.openclaw/openclaw.json
# 修改 "gateway.port" 为其他端口

# 方法 2：环境变量
export OPENCLAW_GATEWAY_PORT=18790
openclaw gateway start
```

---

### 2. 路径差异

如果新机器的 HOME 目录不同，需要调整：

```bash
# 旧机器：/Users/sun/.openclaw
# 新机器：/Users/otheruser/.openclaw

# 配置文件中的路径需要手动调整
vim ~/.openclaw/openclaw.json
# 搜索并替换 /Users/sun/ → /Users/otheruser/
```

---

### 3. Node.js 版本

确保新机器 Node.js 版本兼容：

```bash
# 检查版本
node --version  # 应该 >= v18.0.0

# 安装 OpenClaw
npm install -g openclaw
```

---

### 4. 依赖安装

某些插件可能需要额外依赖：

```bash
# Telegram 依赖
npm install -g @openclaw/telegram

# Feishu 依赖
npm install -g @openclaw/feishu
```

---

### 5. 认证重新配对

某些通道可能需要重新配对：

```bash
# 重新配对 Telegram
openclaw channel:pair telegram

# 重新配对 Feishu
openclaw channel:pair feishu
```

---

## 🔄 迁移后调整

### 调整 1：更新 Gateway 端口

如果需要不同端口：

```json
{
  "gateway": {
    "port": 18790,
    "bind": "loopback"
  }
}
```

---

### 调整 2：更新 PATH

如果使用了自定义脚本：

```bash
# ~/.zshrc 或 ~/.bash_profile
export PATH="$HOME/.openclaw/workspace/skills:$PATH"
```

---

### 调整 3：更新环境变量

如果使用了自定义环境变量：

```bash
# ~/.zshrc 或 ~/.bash_profile
export OPENCLAW_STATE_DIR=~/.openclaw
export OPENCLAW_PROFILE=dev
```

---

## 🎯 快速迁移命令

### 一键打包（本机）

```bash
#!/bin/bash
# save as: backup-openclaw.sh

MIGRATION_DIR=~/openclaw-migration
mkdir -p "$MIGRATION_DIR"

echo "📦 打包配置..."
tar czf "$MIGRATION_DIR/config.tar.gz" ~/.openclaw/openclaw.json*

echo "🧠 打包记忆..."
tar czf "$MIGRATION_DIR/memory.tar.gz" ~/.openclaw/memory/

echo "💾 打包 workspace..."
tar czf "$MIGRATION_DIR/workspace.tar.gz" ~/.openclaw/workspace/

echo "🔑 打包认证..."
tar czf "$MIGRATION_DIR/credentials.tar.gz" ~/.openclaw/credentials/

echo "⏰ 打包 cron..."
tar czf "$MIGRATION_DIR/cron.tar.gz" ~/.openclaw/cron/

echo "🤖 打包 agents..."
tar czf "$MIGRATION_DIR/agents.tar.gz" ~/.openclaw/agents/

echo "✅ 打包完成！目录: $MIGRATION_DIR"
ls -lh "$MIGRATION_DIR"
```

---

### 一键解压（新机器）

```bash
#!/bin/bash
# save as: restore-openclaw.sh

MIGRATION_DIR=~/openclaw-migration
mkdir -p ~/.openclaw

echo "📦 解压配置..."
tar xzf "$MIGRATION_DIR/config.tar.gz" -C ~/.openclaw/

echo "🧠 解压记忆..."
tar xzf "$MIGRATION_DIR/memory.tar.gz" -C ~/.openclaw/

echo "💾 解压 workspace..."
tar xzf "$MIGRATION_DIR/workspace.tar.gz" -C ~/.openclaw/

echo "🔑 解压认证..."
tar xzf "$MIGRATION_DIR/credentials.tar.gz" -C ~/.openclaw/

echo "⏰ 解压 cron..."
tar xzf "$MIGRATION_DIR/cron.tar.gz" -C ~/.openclaw/

echo "🤖 解压 agents..."
tar xzf "$MIGRATION_DIR/agents.tar.gz" -C ~/.openclaw/

echo "🔒 设置权限..."
chmod -R 700 ~/.openclaw/

echo "✅ 解压完成！"
```

---

## 📊 文件大小参考

| 项目             | 估计大小                        |
| ---------------- | ------------------------------- |
| 配置文件         | ~10 KB                          |
| 记忆数据库       | ~100 KB - 10 MB（取决于使用量） |
| Workspace        | ~1 MB - 100 MB（取决于文件）    |
| 认证信息         | ~10 KB                          |
| Cron 任务        | ~10 KB                          |
| **总计（核心）** | **~1 MB - 120 MB**              |

---

## 💡 最佳实践

1. **先在新机器上测试** - 不要直接替换现有配置
2. **保留旧配置** - 迁移失败可以回滚
3. **逐步验证** - 先启动 Gateway，再测试通道
4. **备份新机器** - 迁移前先备份新机器的配置
5. **文档化差异** - 记录两台机器的配置差异

---

## 🆘 故障排查

### 问题：Gateway 启动失败

**原因：** 配置文件损坏或路径错误

**解决：**

```bash
# 检查配置语法
cat ~/.openclaw/openclaw.json | jq '.'

# 查看启动日志
openclaw gateway start --verbose
```

---

### 问题：通道连接失败

**原因：** 认证信息无效或过期

**解决：**

```bash
# 重新配对
openclaw channel:pair telegram

# 或检查认证文件
cat ~/.openclaw/credentials/telegram-pairing.json
```

---

### 问题：记忆无法访问

**原因：** 数据库损坏或权限问题

**解决：**

```bash
# 检查权限
ls -la ~/.openclaw/memory/

# 修复权限
chmod 600 ~/.openclaw/memory/main.sqlite
```

---

## 📞 支持

如果迁移遇到问题：

1. 检查日志：`~/.openclaw/logs/`
2. 运行诊断：`openclaw doctor`
3. 查看文档：https://docs.openclaw.ai

---

**文档版本：** 2026.2.17
**最后更新：** 2025-02-19
