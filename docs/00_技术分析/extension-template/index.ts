/**
 * OpenClaw 通道插件入口点
 *
 * 这是通道插件的主入口点。
 * 它将通道注册到 OpenClaw 的插件系统中。
 *
 * TODO: 将所有 <Channel> 和 <channel-id> 占位符替换为实际值
 */

import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { myChannelPlugin } from "./src/channel.js";
import { setMyChannelRuntime } from "./src/runtime.js";

/**
 * 插件定义对象
 *
 * 该对象定义了插件的标识和注册逻辑。
 */
const plugin = {
  /** 唯一插件标识符 - 应与通道 ID 匹配 */
  id: "<channel-id>",

  /** 人类可读的插件名称 */
  name: "<Channel Name>",

  /** 插件简短描述 */
  description: "<Channel Name> channel plugin",

  /**
   * 插件配置 schema
   * 使用 emptyPluginConfigSchema() 表示无自定义配置的插件
   * 使用 buildChannelConfigSchema(yourZodSchema) 表示自定义配置
   */
  configSchema: emptyPluginConfigSchema(),

  /**
   * 注册函数,由 OpenClaw 在加载插件时调用
   *
   * @param api - 用于注册组件的 OpenClaw 插件 API
   */
  register(api: OpenClawPluginApi) {
    // 1. 设置运行时访问(允许内部代码访问核心功能)
    setMyChannelRuntime(api.runtime);

    // 2. 注册通道插件
    api.registerChannel({ plugin: myChannelPlugin as ChannelPlugin });

    // 3. 可选: 注册其他组件
    // api.registerTool(myCustomTool);
    // api.registerHook("some-event", handler);
  },
};

export default plugin;

// 可选: 导出供外部使用的函数
// export { sendMessage, probeChannel } from "./src/outbound.js";
