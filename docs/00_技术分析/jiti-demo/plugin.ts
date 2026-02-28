// 模拟插件 — 通过 alias 路径引用 SDK（不是从 node_modules）
// 这里的 "my-app/sdk" 会被 jiti alias 重定向到 sdk.ts

import type { PluginApi } from "my-app/sdk";
import { emptyConfigSchema } from "my-app/sdk";

console.log("emptyConfigSchema", emptyConfigSchema);

interface Greeting {
  message: string;
  timestamp: number;
}

function greet(name: string): Greeting {
  return {
    message: `Hello, ${name}!`,
    timestamp: Date.now(),
  };
}

const plugin = {
  id: "demo-plugin",
  name: "Demo Plugin",
  configSchema: emptyConfigSchema(),

  register(api: PluginApi) {
    const result = greet("Jiti");
    api.logger.info(`Registered with config: ${JSON.stringify(plugin.configSchema)}`);
    api.logger.info(`Greeting: ${result.message}`);
  },
};

export default plugin;
