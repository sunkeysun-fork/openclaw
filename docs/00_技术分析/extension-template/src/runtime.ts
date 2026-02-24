/**
 * <Channel> 插件的运行时管理
 *
 * 该模块提供对 OpenClaw 运行时服务的访问,
 * 用于插件代码的各个部分。
 *
 * 运行时在插件注册期间设置一次,
 * 提供对配置、日志、通道工具等的访问。
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

/** 单例运行时实例 */
// oxlint-disable-next-line typescript/no-redundant-type-constituents
let runtime: PluginRuntime | null = null;

/**
 * 设置运行时实例(在插件注册期间调用)
 *
 * @param next - OpenClaw 提供的 PluginRuntime 实例
 */
export function setMyChannelRuntime(next: PluginRuntime): void {
  runtime = next;
}

/**
 * 获取运行时实例(在插件代码各处使用)
 *
 * @returns PluginRuntime 实例
 * @throws 如果运行时未初始化则抛出错误
 *
 * @example
 * ```typescript
 * const runtime = getMyChannelRuntime();
 * const config = runtime.config;
 * const logger = runtime.logging;
 * ```
 */
export function getMyChannelRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("<Channel> runtime not initialized");
  }
  return runtime;
}
