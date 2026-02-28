# Jiti 功能验证 Demo

最小化示例，验证 [Jiti](https://github.com/unjs/jiti) 的两个核心能力：

1. **运行时加载 TypeScript** — 无需预编译，直接加载 `.ts` 文件
2. **Alias 重定向** — 将模块路径映射到本地文件，模拟 openclaw 的 plugin-sdk 解析机制

## 文件结构

```
jiti-demo/
  run.mjs       # 入口：创建 jiti 加载器，配置 alias，加载插件
  sdk.ts        # 模拟 SDK（被 alias 指向的目标）
  plugin.ts     # 模拟插件（通过 alias 路径 import SDK）
  package.json
```

## 运行

```bash
cd docs/00_技术分析/jiti-demo
npm install
npm run demo
```

## 对应 openclaw 机制

| Demo 中              | OpenClaw 中                   | 说明           |
| -------------------- | ----------------------------- | -------------- |
| `"my-app/sdk"` alias | `"openclaw/plugin-sdk"` alias | alias 路径     |
| `sdk.ts`             | `src/plugin-sdk/index.ts`     | alias 目标文件 |
| `plugin.ts`          | `extensions/*/index.ts`       | 插件入口       |
| `run.mjs`            | `src/plugins/loader.ts`       | 加载器         |

## 预期输出

```
=== Jiti Demo ===

--- Test 1: Alias resolution ---
sdk.emptyConfigSchema(): { type: 'object', properties: {} }
[test] Alias resolution works!

--- Test 2: Load TypeScript plugin (with alias import) ---
Plugin loaded: { id: 'demo-plugin', name: 'Demo Plugin' }
Config schema: { type: 'object', properties: {} }
[demo-plugin] Registered with config: {"type":"object","properties":{}}
[demo-plugin] Greeting: Hello, Jiti!

=== All tests passed ===
```
