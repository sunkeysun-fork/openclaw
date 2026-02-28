# OpenClaw 插件 SDK 依赖解析机制

## 核心问题

插件代码中会 import `openclaw/plugin-sdk`：

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
```

但插件安装时执行的是 `npm install --omit=dev`，而 `openclaw` 只在 `devDependencies` 中，不会被安装到插件的 `node_modules`。那运行时如何解析这个 import？

**答案：通过 Jiti 的 alias 机制，将 `openclaw/plugin-sdk` 重定向到宿主 openclaw 安装中的 SDK 文件。插件不需要单独安装 openclaw。**

---

## 完整解析链路

```
插件代码: import { ... } from "openclaw/plugin-sdk"
         │
         ▼
Jiti 加载器拦截 import
         │
         ▼
检查 alias 映射表: "openclaw/plugin-sdk" → 实际文件路径
         │
         ├─ 开发环境 → <openclaw-root>/src/plugin-sdk/index.ts
         │
         └─ 生产环境 → <openclaw-root>/dist/plugin-sdk/index.js
         │
         ▼
从宿主 openclaw 安装的 SDK 文件中获取导出
```

---

## 1. Jiti Alias 配置

> 源码: `src/plugins/loader.ts:417-439`

```typescript
let jitiLoader: ReturnType<typeof createJiti> | null = null;

const getJiti = () => {
  if (jitiLoader) return jitiLoader;

  const pluginSdkAlias = resolvePluginSdkAlias();
  const pluginSdkAccountIdAlias = resolvePluginSdkAccountIdAlias();

  jitiLoader = createJiti(import.meta.url, {
    interopDefault: true,
    extensions: [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".js", ".mjs", ".cjs", ".json"],
    ...(pluginSdkAlias || pluginSdkAccountIdAlias
      ? {
          alias: {
            ...(pluginSdkAlias ? { "openclaw/plugin-sdk": pluginSdkAlias } : {}),
            ...(pluginSdkAccountIdAlias
              ? { "openclaw/plugin-sdk/account-id": pluginSdkAccountIdAlias }
              : {}),
          },
        }
      : {}),
  });
  return jitiLoader;
};
```

Jiti 是一个 TypeScript 运行时加载器（来自 unjs 生态），支持 `alias` 配置项。当插件代码 import `openclaw/plugin-sdk` 时，Jiti 不会走 Node.js 标准的模块解析（在 `node_modules` 中查找），而是直接重定向到 alias 指向的本地文件路径。

---

## 2. SDK 文件路径解析

> 源码: `src/plugins/loader.ts:48-87`

```typescript
const resolvePluginSdkAliasFile = (params: {
  srcFile: string;
  distFile: string;
}): string | null => {
  const modulePath = fileURLToPath(import.meta.url);
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.VITEST || process.env.NODE_ENV === "test";

  let cursor = path.dirname(modulePath);
  for (let i = 0; i < 6; i += 1) {
    const srcCandidate = path.join(cursor, "src", "plugin-sdk", params.srcFile);
    const distCandidate = path.join(cursor, "dist", "plugin-sdk", params.distFile);

    // 环境决定查找顺序
    const orderedCandidates = isProduction
      ? isTest
        ? [distCandidate, srcCandidate] // 生产+测试: 优先 dist
        : [distCandidate] // 生产: 仅 dist
      : [srcCandidate, distCandidate]; // 开发: 优先 src

    for (const candidate of orderedCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
};
```

### 解析策略

| 环境                               | 查找顺序                                               | 说明                    |
| ---------------------------------- | ------------------------------------------------------ | ----------------------- |
| 开发 (`NODE_ENV !== "production"`) | `src/plugin-sdk/index.ts` > `dist/plugin-sdk/index.js` | 优先源码，支持热改      |
| 生产 (`NODE_ENV === "production"`) | `dist/plugin-sdk/index.js`                             | 仅编译产物              |
| 测试+生产 (`VITEST` + production)  | `dist/plugin-sdk/index.js` > `src/plugin-sdk/index.ts` | 优先 dist，fallback src |

### 向上遍历机制

函数从 `loader.ts` 所在目录开始，向上最多遍历 6 层父目录，在每层查找 `src/plugin-sdk/` 或 `dist/plugin-sdk/`。这确保了无论 openclaw 以何种方式安装（npm 全局、本地开发、bun --compile），都能找到 SDK 文件。

```
src/plugins/loader.ts  (起点)
  ↑ src/plugins/       → 查找 src/plugins/src/plugin-sdk/  ✗
  ↑ src/               → 查找 src/src/plugin-sdk/          ✗
  ↑ <repo-root>/       → 查找 <repo-root>/src/plugin-sdk/  ✓ 命中
```

---

## 3. 两个 Alias 入口

| Import 路径                      | Alias 目标                                                                     | 说明                          |
| -------------------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| `openclaw/plugin-sdk`            | `src/plugin-sdk/index.ts` (dev) 或 `dist/plugin-sdk/index.js` (prod)           | 主 SDK 入口，导出全部公开 API |
| `openclaw/plugin-sdk/account-id` | `src/plugin-sdk/account-id.ts` (dev) 或 `dist/plugin-sdk/account-id.js` (prod) | 账号 ID 工具函数              |

对应 `package.json` 的 exports 声明:

```json
{
  "exports": {
    "./plugin-sdk": {
      "types": "./dist/plugin-sdk/index.d.ts",
      "default": "./dist/plugin-sdk/index.js"
    },
    "./plugin-sdk/account-id": {
      "types": "./dist/plugin-sdk/account-id.d.ts",
      "default": "./dist/plugin-sdk/account-id.js"
    }
  }
}
```

> `package.json` exports 供标准 Node.js 模块解析使用（如果 openclaw 作为 npm 包被直接引用）。但在插件场景下，Jiti alias 优先级更高，实际走的是 alias 路径。

---

## 4. 插件安装时的依赖处理

### 4.1 package.json 配置约定

```json
{
  "dependencies": {
    "@microsoft/agents-hosting": "^1.3.1",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}
```

- `dependencies`: 插件自身的运行时依赖（第三方库），会被安装
- `devDependencies`: `openclaw` 放在这里，仅用于开发时类型检查，不会被安装

### 4.2 安装流程

> 源码: `src/infra/install-package-dir.ts:10-49, 93-110`

```
1. sanitizeManifestForNpmInstall()
   ├─ 读取 package.json
   ├─ 过滤 devDependencies 中的 workspace:* 条目
   └─ 重写 package.json（防止 npm install 因 workspace 协议报错）

2. npm install --omit=dev --silent --ignore-scripts
   ├─ 跳过 devDependencies（openclaw 不会被安装）
   └─ 只安装 dependencies 中的包
```

`sanitizeManifestForNpmInstall` 核心逻辑:

```typescript
const filteredEntries = Object.entries(devDependencies).filter(([, rawSpec]) => {
  const spec = typeof rawSpec === "string" ? rawSpec.trim() : "";
  return !spec.startsWith("workspace:");
});
```

这一步确保 `workspace:*` 这种 pnpm workspace 专属协议不会传递给标准 npm，避免安装报错。

---

## 5. 三层环境的 SDK 解析对比

### 开发环境（monorepo 内）

```
TypeScript → tsconfig.json paths → src/plugin-sdk/index.ts
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "openclaw/plugin-sdk": ["./src/plugin-sdk/index.ts"],
      "openclaw/plugin-sdk/*": ["./src/plugin-sdk/*.ts"],
      "openclaw/plugin-sdk/account-id": ["./src/plugin-sdk/account-id.ts"]
    }
  }
}
```

### 测试环境（Vitest）

```
Vitest → vitest.config.ts alias → src/plugin-sdk/index.ts
```

`vitest.config.ts`:

```typescript
resolve: {
  alias: [
    {
      find: "openclaw/plugin-sdk/account-id",
      replacement: path.join(repoRoot, "src", "plugin-sdk", "account-id.ts"),
    },
    {
      find: "openclaw/plugin-sdk",
      replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
    },
  ],
}
```

> 注意 alias 顺序：更具体的 `account-id` 路径必须排在前面，否则会被 `openclaw/plugin-sdk` 前缀匹配提前拦截。

### 运行时（生产/用户安装）

```
Jiti loader → alias → dist/plugin-sdk/index.js（或 src/plugin-sdk/index.ts）
```

---

## 6. 设计优势

| 特性                | 说明                                                 |
| ------------------- | ---------------------------------------------------- |
| **零冗余安装**      | 插件 node_modules 中不含 openclaw，减小体积          |
| **版本一致性**      | SDK 始终来自宿主 openclaw 安装，不存在版本不匹配问题 |
| **TypeScript 支持** | 开发时通过 tsconfig paths 获得完整类型提示           |
| **跨环境统一**      | 开发/测试/生产三套 alias 机制保证行为一致            |
| **向上兼容**        | 宿主升级 openclaw 后，插件自动获得新 SDK 能力        |

---

## 7. 关键源文件索引

| 文件                                      | 职责                                      |
| ----------------------------------------- | ----------------------------------------- |
| `src/plugins/loader.ts:48-87`             | SDK alias 文件路径解析                    |
| `src/plugins/loader.ts:82-87`             | 两个 alias 入口函数                       |
| `src/plugins/loader.ts:417-439`           | Jiti 加载器创建与 alias 配置              |
| `src/infra/install-package-dir.ts:10-49`  | 安装前 manifest 清洗（移除 workspace:\*） |
| `src/infra/install-package-dir.ts:93-110` | npm install --omit=dev 执行               |
| `src/plugin-sdk/index.ts`                 | SDK 主导出（约 544 行 re-exports）        |
| `src/plugin-sdk/account-id.ts`            | 账号 ID 辅助导出                          |
| `package.json` (exports)                  | Node.js 标准模块导出声明                  |
| `tsconfig.json` (paths)                   | 开发时 TypeScript 路径映射                |
| `vitest.config.ts` (alias)                | 测试时模块 alias                          |
