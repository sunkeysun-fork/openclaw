# OpenClaw Skill 与插件加载方案技术分析

## 1. 目标与范围

本文梳理 OpenClaw 当前 **Skill** 与**插件（extensions/plugins）**的加载实现，回答以下问题：

- 默认加载路径与优先级是什么
- 加载调用链路是什么（发现 → 解析 → 注册/执行）
- 如何新增额外加载路径
- 是否支持热加载
- 当 `OPENCLAW_STATE_DIR` / `OPENCLAW_CONFIG_PATH` 改动时行为有何差异

---

## 2. 关键结论（先看版）

1. **Skill 有热加载**（chokidar watcher，默认开启）。
   - 代码：`src/agents/skills/refresh.ts:132`
2. **插件无自动热加载**，CLI 多处提示“重启 gateway 生效”。
   - 代码：`src/cli/plugins-cli.ts:349`, `src/cli/plugins-cli.ts:367`
3. Skill 额外路径用 `skills.load.extraDirs`；插件额外路径用 `plugins.load.paths`。
   - 代码：`src/config/types.skills.ts:8`, `src/config/types.plugins.ts:11`
4. `OPENCLAW_STATE_DIR` 会改变 `CONFIG_DIR` 指向，从而影响 managed skills / global extensions 的默认目录。
   - 代码：`src/utils.ts:304`, `src/utils.ts:394`
5. 若同时设置 `OPENCLAW_CONFIG_PATH`，配置文件读取将不再回退到 `~/.openclaw/openclaw.json`。
   - 代码：`src/config/paths.ts:119`, `src/config/paths.ts:156`

---

## 3. Skill 加载逻辑

### 3.1 路径来源与优先级

Skill 入口汇总在 `loadSkillEntries()`：`src/agents/skills/workspace.ts:221`。

实际合并优先级（低 → 高）：

1. `skills.load.extraDirs` + 插件声明的 skills 目录（`openclaw-extra`）
2. bundled skills（`openclaw-bundled`）
3. managed skills（`openclaw-managed`，默认 `CONFIG_DIR/skills`）
4. `~/.agents/skills`（`agents-skills-personal`）
5. `<workspace>/.agents/skills`（`agents-skills-project`）
6. `<workspace>/skills`（`openclaw-workspace`）

代码依据：
- 路径构建：`src/agents/skills/workspace.ts:324-367`
- 优先级注释与 merge 顺序：`src/agents/skills/workspace.ts:370-388`

> 同名 skill：后写入 `Map` 的来源覆盖先前来源（即高优先级覆盖低优先级）。

### 3.2 bundled skills 路径解析

`resolveBundledSkillsDir()`：`src/agents/skills/bundled-dir.ts:36`

解析顺序：
1. `OPENCLAW_BUNDLED_SKILLS_DIR`
2. 可执行文件同级 `skills/`
3. 包根 `skills/`
4. 向上最多 6 层查找 `skills/`

代码：`src/agents/skills/bundled-dir.ts:39-90`

### 3.3 发现/解析/执行链路

1. 发现并读取 skill 目录：`loadSkillEntries()`（`workspace.ts:221`）
2. 读取并解析 frontmatter：`parseFrontmatter()`（`src/agents/skills/frontmatter.ts:21`）
3. 解析 OpenClaw 元数据与调用策略：`resolveOpenClawMetadata()`（`frontmatter.ts:81`）、`resolveSkillInvocationPolicy()`（`frontmatter.ts:103`）
4. 过滤启用条件（enabled、allowBundled、requires.*）：`filterSkillEntries()`（`workspace.ts:67`）+ `shouldIncludeSkill()`（`src/agents/skills/config.ts:70`）
5. 生成快照与 prompt 注入：`buildWorkspaceSkillSnapshot()`（`workspace.ts:446`）、`buildWorkspaceSkillsPrompt()`（`workspace.ts:465`）

---

## 4. Skill 热加载机制

Skill 使用 chokidar 监听 `SKILL.md` 变化：`src/agents/skills/refresh.ts:132-207`。

默认监听来源：
- `<workspace>/skills`
- `<workspace>/.agents/skills`
- `CONFIG_DIR/skills`
- `~/.agents/skills`
- `skills.load.extraDirs`
- 插件声明 skills 目录

代码：`src/agents/skills/refresh.ts:59-75`。

默认参数：
- `skills.load.watch`（默认启用）
- `skills.load.watchDebounceMs`

类型定义：`src/config/types.skills.ts:14-17`。

手动触发版本刷新：`bumpSkillsSnapshotVersion()`（`src/agents/skills/refresh.ts:105`）。

---

## 5. 插件加载逻辑

### 5.1 路径来源与顺序

插件发现入口：`discoverOpenClawPlugins()`（`src/plugins/discovery.ts:557`）。

扫描顺序：
1. `plugins.load.paths`（origin=`config`）
2. `<workspace>/.openclaw/extensions`（origin=`workspace`）
3. `resolveConfigDir()/extensions`（origin=`global`）
4. bundled extensions（origin=`bundled`）

代码：`src/plugins/discovery.ts:567-622`。

> 该顺序决定了 `seen` 去重时哪个候选先被采纳。

### 5.2 bundled plugins 路径解析

`resolveBundledPluginsDir()`：`src/plugins/bundled-dir.ts:5`

顺序：
1. `OPENCLAW_BUNDLED_PLUGINS_DIR`
2. 可执行文件同级 `extensions/`
3. 向上最多 6 层查找 `extensions/`

代码：`src/plugins/bundled-dir.ts:6-41`。

### 5.3 发现/加载/注册链路

插件主入口：`loadOpenClawPlugins()`（`src/plugins/loader.ts:359`）

核心步骤：
1. 配置归一化：`normalizePluginsConfig()`（`loader.ts:365`）
2. 发现插件：`discoverOpenClawPlugins()`（`loader.ts:389`）
3. 清单注册：`loadPluginManifestRegistry()`（`loader.ts:393`）
4. 按启用策略决定是否加载：`resolveEffectiveEnableState` 逻辑链（`src/plugins/config-state.ts:165`）
5. 用 jiti 加载模块并设置 SDK alias（`loader.ts:422-433`）
6. 调用 `register/activate` 完成能力注册（`loader.ts` 中加载分支）
7. 设置全局 registry：`setActivePluginRegistry()`（`loader.ts:374`, `loader.ts:697`）

插件可注册能力（tool/hook/channel/provider/cli/service/command...）：`src/plugins/registry.ts:172-447`。

---

## 6. 插件是否热加载

当前没有自动 watch 机制；CLI 在 enable/disable 后明确提示重启：
- `src/cli/plugins-cli.ts:349`
- `src/cli/plugins-cli.ts:367`

因此插件变更通常按“重启 gateway 生效”处理。

---

## 7. 新增额外加载路径：实践配置

### 7.1 Skill

```json5
{
  "skills": {
    "load": {
      "extraDirs": [
        "~/.openclaw/skills",
        "~/team-skills"
      ]
    }
  }
}
```

代码依据：`src/config/types.skills.ts:10-13`, `src/agents/skills/workspace.ts:327-335`。

### 7.2 插件

```json5
{
  "plugins": {
    "load": {
      "paths": [
        "~/.openclaw/extensions",
        "~/team-extensions"
      ]
    }
  }
}
```

代码依据：`src/config/types.plugins.ts:12-13`, `src/plugins/discovery.ts:567-585`。

---

## 8. `OPENCLAW_STATE_DIR=~/.qclaw` 后会发生什么

### 8.1 会变化的路径

`resolveConfigDir()` 会优先使用 `OPENCLAW_STATE_DIR`：`src/utils.ts:304-311`。

因此以下默认目录会随之变化：
- managed skills：`CONFIG_DIR/skills`（`src/agents/skills/workspace.ts:324`）
- global extensions：`resolveConfigDir()/extensions`（`src/plugins/discovery.ts:602`）

即从 `~/.openclaw/*` 转到 `~/.qclaw/*`。

### 8.2 是否还会“扫到 ~/.openclaw”

- **Skill/Plugin 默认全局目录扫描**：不会（走 `~/.qclaw`）
- **但配置候选查找**：若未显式设置 `OPENCLAW_CONFIG_PATH`，候选集仍可能包含默认目录（含 `~/.openclaw`）
  - 候选构建：`src/config/paths.ts:201-214`
  - 选择第一个存在的候选：`src/config/io.ts:664-669`

### 8.3 若同时设置 `OPENCLAW_CONFIG_PATH`

当设置：

```bash
export OPENCLAW_STATE_DIR=~/.qclaw
export OPENCLAW_CONFIG_PATH=~/.qclaw/openclaw.json
```

配置路径将被显式锁定（不再回退旧配置）：
- `resolveCanonicalConfigPath()`：`src/config/paths.ts:119-123`
- `resolveConfigPath()`：`src/config/paths.ts:156-159`

---

## 9. 与 clawhub 等旧工具兼容建议

如果第三方工具仍把 skill 装在 `~/.openclaw/skills`，建议在新状态目录配置里加兼容路径：

```json5
{
  "skills": {
    "load": {
      "extraDirs": ["~/.openclaw/skills"]
    }
  }
}
```

理由：
- 可兼容旧工具安装路径
- `extraDirs` 为最低优先级，不会覆盖 workspace/managed 高优先级技能
  - 证据：`src/agents/skills/workspace.ts:370-388`
- watcher 会监听 extraDirs 变更
  - 证据：`src/agents/skills/refresh.ts:67-75`

如旧工具也装插件，可追加：

```json5
{
  "plugins": {
    "load": {
      "paths": ["~/.openclaw/extensions"]
    }
  }
}
```

---

## 10. 关键文件清单

- Skill 加载总入口：`src/agents/skills/workspace.ts:221`
- Skill watcher：`src/agents/skills/refresh.ts:132`
- bundled skills 目录解析：`src/agents/skills/bundled-dir.ts:36`
- 插件发现：`src/plugins/discovery.ts:557`
- 插件加载总入口：`src/plugins/loader.ts:359`
- 插件 bundled 目录解析：`src/plugins/bundled-dir.ts:5`
- 插件注册 API：`src/plugins/registry.ts:172`
- 插件配置类型：`src/config/types.plugins.ts:18`
- Skill 配置类型：`src/config/types.skills.ts:38`
- state/config 路径解析：`src/utils.ts:304`, `src/config/paths.ts:60`

---

## 11. 最终建议

1. 新环境统一使用：
   - `OPENCLAW_STATE_DIR=~/.qclaw`
   - `OPENCLAW_CONFIG_PATH=~/.qclaw/openclaw.json`
2. 为兼容历史工具，在 `skills.load.extraDirs` 增加 `~/.openclaw/skills`
3. 若存在历史插件安装目录，再在 `plugins.load.paths` 增加 `~/.openclaw/extensions`
4. Skill 可以依赖热加载；插件改动按“重启 gateway”流程执行

---

## 12. 可执行迁移清单（`~/.openclaw` → `~/.qclaw`）

### 12.1 迁移前备份

```bash
mkdir -p ~/.qclaw-backup
cp -a ~/.openclaw ~/.qclaw-backup/openclaw-$(date +%Y%m%d-%H%M%S)
```

### 12.2 创建新状态目录并迁移配置

```bash
mkdir -p ~/.qclaw
[ -f ~/.qclaw/openclaw.json ] || cp ~/.openclaw/openclaw.json ~/.qclaw/openclaw.json
```

### 12.3 锁定新路径（建议同时设置）

将以下内容写入 shell 配置（如 `~/.zshrc`）：

```bash
export OPENCLAW_STATE_DIR=~/.qclaw
export OPENCLAW_CONFIG_PATH=~/.qclaw/openclaw.json
```

生效：

```bash
source ~/.zshrc
```

### 12.4 增加兼容路径（兼容 clawhub 等旧工具）

编辑 `~/.qclaw/openclaw.json`：

```json5
{
  skills: {
    load: {
      extraDirs: ["~/.openclaw/skills"]
    }
  },
  plugins: {
    load: {
      paths: ["~/.openclaw/extensions"]
    }
  }
}
```

说明：
- `skills.load.extraDirs` 为低优先级，不会覆盖 workspace 高优先级 skill（`src/agents/skills/workspace.ts:370`）
- Skill watcher 会监听 extraDirs（`src/agents/skills/refresh.ts:67`）

### 12.5 重启与生效

- Skill：watch 开启时可在下个 turn 刷新，但建议重启会话核对
- 插件：按重启 gateway 生效（`src/cli/plugins-cli.ts:349`, `src/cli/plugins-cli.ts:367`）

### 12.6 验证步骤

```bash
echo "$OPENCLAW_STATE_DIR"
echo "$OPENCLAW_CONFIG_PATH"
openclaw skills list
openclaw plugins list
```

检查点：
- state/config 环境变量指向 `~/.qclaw`
- 旧目录安装的 skill/plugin 能被发现（通过兼容路径）

### 12.7 回滚步骤

1. 还原 shell 环境变量到旧值（或移除上述两个 export）
2. 恢复 `OPENCLAW_CONFIG_PATH` 到旧配置
3. 重启 gateway 与会话
