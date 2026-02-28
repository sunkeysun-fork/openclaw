// SDK 模拟模块 — 模拟 openclaw/plugin-sdk 的角色
// 插件通过 alias 引用此文件，而非通过 node_modules 安装

export interface PluginApi {
  id: string;
  logger: { info: (msg: string) => void };
}

export function createApi(id: string): PluginApi {
  return {
    id,
    logger: {
      info: (msg: string) => console.log(`[${id}] ${msg}`),
    },
  };
}

export function emptyConfigSchema() {
  return { type: "object", properties: {} };
}
