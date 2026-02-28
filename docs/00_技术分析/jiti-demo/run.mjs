// Jiti 功能验证入口
// 演示两个核心能力：运行时加载 TypeScript + alias 重定向

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 1. 创建 Jiti 加载器（配置 alias）
// ============================================================
// alias 将 "my-app/sdk" 映射到本地的 sdk.ts
// 模拟 openclaw 将 "openclaw/plugin-sdk" 映射到宿主 SDK 的机制

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
  alias: {
    "my-app/sdk": path.join(__dirname, "sdk.ts"),
  },
});

console.log("=== Jiti Demo ===\n");

// ============================================================
// 2. 验证 alias：直接通过 jiti 加载 alias 路径
// ============================================================
console.log("--- Test 1: Alias resolution ---");

const sdk = jiti("my-app/sdk");
console.log("sdk.emptyConfigSchema():", sdk.emptyConfigSchema());

const api = sdk.createApi("test");
api.logger.info("Alias resolution works!");

// ============================================================
// 3. 验证 TS 加载 + alias 联动：加载插件（插件内部 import alias 路径）
// ============================================================
console.log("\n--- Test 2: Load TypeScript plugin (with alias import) ---");

const plugin = jiti(path.join(__dirname, "plugin.ts"));
console.log("Plugin loaded:", { id: plugin.id, name: plugin.name });
console.log("Config schema:", plugin.configSchema);

// 调用 register，插件内部会通过 alias 引用 sdk
const pluginApi = sdk.createApi(plugin.id);
plugin.register(pluginApi);

console.log("\n=== All tests passed ===");
