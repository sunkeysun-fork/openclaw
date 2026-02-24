# pnpm Node 版本不一致问题分析

## 问题描述

在 OpenClaw 项目中遇到以下现象：

| 命令                       | 返回的 Node 版本                       |
| -------------------------- | -------------------------------------- |
| `node --version`           | **v24.13.1** ✅                        |
| `pnpm exec node --version` | **v20.19.6** ❌                        |
| `pnpm install`             | 警告 `current: {"node":"v20.19.6"}` ❌ |

项目 `package.json` 配置：

```json
"engines": {
  "node": ">=22.12.0"
},
"volta": {
  "node": "24.13.1"
},
"packageManager": "pnpm@10.23.0"
```

## 根本原因

### pnpm 的版本检测机制

pnpm 在确定 Node 版本时，**不是直接运行 `node --version`**，而是读取 `npm-globalconfig` 路径来判断。

执行 `pnpm config list --json` 可见：

```json
{
  "node-version": "24.13.1", // 用户设置的配置（被 pnpm 忽略）
  "npm-globalconfig": "/Users/sunkeysun/.volta/tools/image/node/20.19.6/etc/npmrc", // ← 关键问题！
  "user-agent": "pnpm/10.23.0 npm/? node/v20.19.6 darwin arm64"
}
```

`npm-globalconfig` 指向了 **Node v20.19.6** 的路径，所以 pnpm 认为当前使用的是 v20.19.6。

### 为什么会发生这种情况？

**pnpm 的"安装记忆"机制**：

1. 当 pnpm 被安装时，它会在其内部结构中"记住"安装时使用的 Node 版本
2. 之前的 pnpm 是用 **Node v20.19.6**（Volta 的 default）安装的
3. 即使后来：
   - 项目配置了 `volta.node: 24.13.1`（package.json）
   - 创建了 `.volta.toml` 指定 `node = "24.13.1"`
   - 设置了 `pnpm config set node-version 24.13.1`

   pnpm **仍然使用旧的 npm-globalconfig 路径**

### Volta vs pnpm 的交互差异

```
直接运行 node:        Volta PATH 优先级 → 正确使用 v24.13.1
pnpm exec node:       pnpm 读取 npm-globalconfig → 错误使用 v20.19.6
volta run node:        Volta 显式指定 → 正确使用 v24.13.1
```

## 解决方案

### 正确的修复方法

用正确的 Node 版本重新安装 pnpm：

```bash
NODE_VERSION=24.13.1 volta install pnpm@10.23.0
```

这条命令让 pnpm **在 v24.13.1 环境下被重新安装**，它的内部引用路径就更新到了：

```
/Users/sunkeysun/.volta/tools/image/node/24.13.1/etc/npmrc
```

### 验证修复结果

```bash
# 确认版本一致
pnpm exec node --version  # 应该输出 v24.13.1
node --version             # 应该输出 v24.13.1
pnpm --version            # 应该输出 10.23.0

# 确认没有引擎警告
pnpm install              # 不应该再有 "Unsupported engine" 警告
```

### 无效的尝试方法

以下方法**不能解决问题**（只是经验记录）：

| 尝试方法                               | 效果                                   |
| -------------------------------------- | -------------------------------------- |
| 创建 `.volta.toml`                     | 不影响 pnpm                            |
| `volta install node@24.13.1`           | 只影响 `volta run node`，不影响 `pnpm` |
| `pnpm config set node-version 24.13.1` | pnpm 忽略此配置                        |
| `pnpm config set node-linker hoisted`  | 不影响 Node 版本检测                   |
| 修改 `.npmrc` 添加 node-version        | 不影响 pnpm 检测机制                   |

## 技术总结

| 因素                          | 影响                                   |
| ----------------------------- | -------------------------------------- |
| Volta default 版本 (v20.19.6) | 之前 pnpm 安装时使用的版本             |
| 项目 Volta 配置 (v24.13.1)    | 影响 `node` 和 `volta run` 命令        |
| pnpm npm-globalconfig         | **pnpm 自己使用的判断依据** ← 问题所在 |
| 用正确版本重新安装 pnpm       | 更新 npm-globalconfig 路径 ✅          |

## 经验教训

1. **pnpm 与 Volta 集成存在已知"坑"**：pnpm 有自己缓存的 Node 版本引用，不随 Volta 的项目配置自动更新

2. **版本一致性检查**：当遇到 "Unsupported engine" 警告时，同时检查：
   - `node --version`
   - `pnpm exec node --version`
   - `pnpm config get npm-globalconfig`

3. **重新安装是根本修复**：pnpm 的内部引用路径只能在安装时确定，后续配置更改不会更新它

## 相关文档

- [Volta 文档](https://docs.volta.sh/guide/understanding-the-tool/)
- [pnpm 配置](https://pnpm.io/npmrc)
- OpenClaw 项目 `package.json` 引擎要求：`>=22.12.0`
