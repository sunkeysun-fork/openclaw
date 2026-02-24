/**
 * <Channel> 通道插件实现
 *
 * 该文件包含核心 ChannelPlugin 实现,定义了
 * OpenClaw 如何与 <channel> 消息平台交互。
 *
 * TODO: 将所有 <Channel>、<channel> 和 <channel-id> 占位符
 *       替换为实际的通道特定值
 */

import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
  normalizeAccountId,
  type ChannelCapabilities,
  type ChannelConfigAdapter,
  type ChannelGatewayAdapter,
  type ChannelOutboundAdapter,
  type ChannelPlugin,
  type ChannelSecurityAdapter,
  type ChannelStatusAdapter,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import { z } from "zod";
import { getMyChannelRuntime } from "./runtime.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 来自 OpenClaw 配置文件的原始通道配置
 *
 * TODO: 使用通道特定的配置字段扩展此接口
 */
interface MyChannelRawConfig {
  enabled?: boolean;
  botToken?: string;
  tokenFile?: string;
  name?: string;
  dmPolicy?: "open" | "pairing" | "allowlist";
  groupPolicy?: "open" | "allowlist" | "disabled";
  allowFrom?: Array<string | number>;
  proxy?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  accounts?: Record<string, MyChannelRawConfig>;
}

/**
 * 从 OpenClaw 配置获取通道配置的辅助函数
 */
function getChannelConfig(cfg: OpenClawConfig, channelId: string): MyChannelRawConfig {
  return (cfg.channels as Record<string, MyChannelRawConfig>)?.[channelId] ?? {};
}

/**
 * <Channel> 的已解析账户配置
 *
 * 此类型表示完全解析的账户配置,
 * 合并了基础级和账户级设置。
 */
export interface ResolvedMyChannelAccount {
  /** 账户标识符(DEFAULT_ACCOUNT_ID 或自定义 ID) */
  accountId: string;

  /** 人类可读的账户名称 */
  name?: string;

  /** 是否启用该账户 */
  enabled: boolean;

  /** 认证令牌 */
  token: string;

  /** 通道特定配置 */
  config: {
    /** 直接消息访问策略 */
    dmPolicy: "open" | "pairing" | "allowlist";

    /** 群组访问策略 */
    groupPolicy: "open" | "allowlist" | "disabled";

    /** 允许的发送者列表(用于 allowlist 策略) */
    allowFrom: Array<string | number>;

    /** 代理 URL(可选) */
    proxy?: string;

    /** 用于接收消息的 Webhook URL(可选) */
    webhookUrl?: string;
  };
}

/**
 * <Channel> 连接测试的探测结果
 *
 * 在检查通道凭据是否有效以及
 * bot/服务是否可访问时返回。
 */
export interface MyChannelProbe {
  /** 探测是否成功 */
  ok: boolean;

  /** Bot/服务信息(如果探测成功) */
  bot?: {
    id: string;
    username?: string;
  };

  /** 错误消息(如果探测失败) */
  error?: string;
}

// ============================================================================
// 元数据
// ============================================================================

/**
 * 来自 OpenClaw 中央注册表的通道元数据
 *
 * TODO: 将 "<channel-id>" 替换为您的通道标识符
 * 注意: 通道 ID 必须在 OpenClaw 的通道注册表中注册
 */
// @ts-expect-error - 模板占位符; 替换为实际的通道 ID
const meta = getChatChannelMeta("<channel-id>");

// ============================================================================
// 配置 Schema (Zod)
// ============================================================================

/**
 * <Channel> 配置验证的 Zod schema
 *
 * 该 schema 验证配置结构并为可选字段提供
 * 默认值。
 */
export const MyChannelConfigSchema = z.object({
  // 账户级设置
  enabled: z.boolean().optional().default(true),

  // 认证
  botToken: z.string().optional(),
  tokenFile: z.string().optional(),

  // 显示名称
  name: z.string().optional(),

  // 访问策略
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional().default("pairing"),
  groupPolicy: z.enum(["open", "allowlist", "disabled"]).optional().default("open"),

  // 允许列表
  allowFrom: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .default([]),

  // 网络设置
  proxy: z.string().optional(),

  // Webhook 设置(用于基于推送的消息传递)
  webhookUrl: z.string().optional(),
  webhookSecret: z.string().optional(),

  // 多账户支持
  accounts: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// 配置适配器
// ============================================================================

/**
 * <Channel> 的配置适配器
 *
 * 处理账户列表、解析和配置管理。
 */
const configAdapter: ChannelConfigAdapter<ResolvedMyChannelAccount> = {
  /**
   * 列出所有已配置的账户 ID
   *
   * @param cfg - OpenClaw 配置
   * @returns 账户 ID 数组
   */
  listAccountIds: (cfg: OpenClawConfig): string[] => {
    // TODO: 将 CHANNEL_ID 替换为您的通道标识符
    const CHANNEL_ID = "<channel-id>";
    const channelConfig = getChannelConfig(cfg, CHANNEL_ID);
    const accounts = channelConfig.accounts;

    if (!accounts || typeof accounts !== "object") {
      return [DEFAULT_ACCOUNT_ID];
    }

    const ids = Object.keys(accounts).filter((id) => id !== DEFAULT_ACCOUNT_ID);

    // 如果配置了基础级令牌,则包含默认账户
    if (channelConfig.botToken || channelConfig.tokenFile) {
      ids.unshift(DEFAULT_ACCOUNT_ID);
    }

    return ids;
  },

  /**
   * 解析账户配置
   *
   * @param cfg - OpenClaw 配置
   * @param accountId - 可选账户 ID(默认为 DEFAULT_ACCOUNT_ID)
   * @returns 已解析的账户配置
   */
  resolveAccount: (cfg: OpenClawConfig, accountId?: string | null): ResolvedMyChannelAccount => {
    // TODO: 将 CHANNEL_ID 替换为您的通道标识符
    const CHANNEL_ID = "<channel-id>";
    const id = normalizeAccountId(accountId);
    const base = getChannelConfig(cfg, CHANNEL_ID);
    const account = id !== DEFAULT_ACCOUNT_ID ? base.accounts?.[id] : null;

    // 从账户级或基础级配置解析令牌
    const token = account?.botToken ?? base.botToken ?? "";

    return {
      accountId: id,
      name: account?.name ?? base.name,
      enabled: account?.enabled ?? base.enabled ?? true,
      token,
      config: {
        dmPolicy: account?.dmPolicy ?? base.dmPolicy ?? "pairing",
        groupPolicy: account?.groupPolicy ?? base.groupPolicy ?? "open",
        allowFrom: account?.allowFrom ?? base.allowFrom ?? [],
        proxy: account?.proxy ?? base.proxy,
        webhookUrl: account?.webhookUrl ?? base.webhookUrl,
      },
    };
  },

  /**
   * 获取默认账户 ID
   *
   * @param cfg - OpenClaw 配置
   * @returns 默认账户 ID
   */
  defaultAccountId: (cfg: OpenClawConfig): string => {
    return resolveDefaultMyChannelAccountId(cfg);
  },

  /**
   * 检查账户是否正确配置
   *
   * @param account - 已解析的账户配置
   * @returns 账户是否有有效凭据
   */
  isConfigured: (account: ResolvedMyChannelAccount): boolean => {
    return Boolean(account.token?.trim());
  },

  /**
   * 获取账户未配置的原因
   *
   * @param account - 已解析的账户配置
   * @returns 人类可读的原因
   */
  unconfiguredReason: (account: ResolvedMyChannelAccount): string => {
    if (!account.token?.trim()) {
      return "Bot token not configured";
    }
    return "not configured";
  },

  /**
   * 解析账户的 allowFrom 列表
   *
   * @param params - 配置和账户 ID
   * @returns 允许的发送者标识符数组
   */
  resolveAllowFrom: ({ cfg, accountId }) => {
    return resolveMyChannelAccount({ cfg, accountId }).config.allowFrom;
  },
};

// ============================================================================
// 出站适配器(消息发送)
// ============================================================================

/**
 * <Channel> 的出站消息适配器
 *
 * 处理向通道发送消息和媒体。
 */
const outboundAdapter: ChannelOutboundAdapter = {
  /**
   * 传递模式:
   * - "direct": 消息通过 API 直接发送
   * - "gateway": 消息通过网关进程传递
   * - "hybrid": 支持两种模式
   */
  deliveryMode: "direct" as const,

  /**
   * 每条文本消息的最大字符数
   * 根据通道的 API 限制进行调整
   */
  textChunkLimit: 4000,

  /**
   * 将长文本分割为块
   *
   * @param text - 要分割的文本
   * @param limit - 每块的最大字符数
   * @returns 文本块数组
   */
  chunker: (text: string, limit: number): string[] => {
    // TODO: 实现通道特定的分块逻辑
    // 考虑: 消息边界、代码块、markdown 格式
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += limit) {
      chunks.push(text.slice(i, i + limit));
    }
    return chunks;
  },

  /**
   * 发送文本消息
   *
   * @param params - 消息参数
   * @returns 包含消息 ID 的发送结果
   */
  sendText: async ({ to, text, accountId, replyToId, threadId }) => {
    const runtime = getMyChannelRuntime();
    const cfg = runtime.config.loadConfig();
    const account = resolveMyChannelAccount({ cfg, accountId });

    // TODO: 实现实际的消息发送
    const result = await sendMyChannelMessage(to, text, {
      token: account.token,
      replyToId: replyToId ?? undefined,
      threadId: threadId != null ? String(threadId) : undefined,
    });

    return { channel: "<channel-id>", ...result };
  },

  /**
   * 发送媒体消息
   *
   * @param params - 媒体消息参数
   * @returns 包含消息 ID 的发送结果
   */
  sendMedia: async ({ to, text, mediaUrl, _mediaLocalRoots, accountId }) => {
    const runtime = getMyChannelRuntime();
    const cfg = runtime.config.loadConfig();
    const account = resolveMyChannelAccount({ cfg, accountId });

    if (!mediaUrl) {
      throw new Error("mediaUrl is required for media messages");
    }

    // TODO: 实现媒体发送
    const result = await sendMyChannelMedia(to, text, mediaUrl, {
      token: account.token,
    });

    return { channel: "<channel-id>", ...result };
  },
};

// ============================================================================
// 网关适配器(连接管理)
// ============================================================================

/**
 * <Channel> 的网关适配器
 *
 * 处理启动/停止消息监听器和管理连接。
 */
const gatewayAdapter: ChannelGatewayAdapter<ResolvedMyChannelAccount> = {
  /**
   * 开始监听账户上的消息
   *
   * @param ctx - 包含账户、配置和运行时的网关上下文
   * @returns 当监控停止时解析的 Promise
   */
  startAccount: async (ctx) => {
    const { account, cfg, runtime, abortSignal, log } = ctx;

    log?.info(`[${account.accountId}] starting provider`);

    // TODO: 实现连接监控
    // 选项:
    // 1. WebSocket 连接
    // 2. Webhook 服务器
    // 3. 长轮询
    // 4. 其他推送/拉取机制

    return monitorMyChannelProvider({
      token: account.token,
      accountId: account.accountId,
      config: cfg,
      runtime,
      abortSignal,
    });
  },

  /**
   * 停止监听账户上的消息
   *
   * @param ctx - 网关上下文
   */
  stopAccount: async (_ctx) => {
    // TODO: 实现清理逻辑
    // - 关闭连接
    // - 清除定时器
    // - 释放资源
  },

  /**
   * 注销账户(清除凭据)
   *
   * @param params - 账户和配置
   * @returns 指示已清除内容的的结果
   */
  logoutAccount: async ({ _accountId, _cfg }) => {
    // TODO: 实现凭据清除
    // - 从配置中删除令牌
    // - 如果为空则清理账户条目

    return { cleared: true, loggedOut: true };
  },
};

// ============================================================================
// 状态适配器(连接监控)
// ============================================================================

/**
 * <Channel> 的状态适配器
 *
 * 提供连接状态和健康监控。
 */
const statusAdapter: ChannelStatusAdapter<ResolvedMyChannelAccount, MyChannelProbe> = {
  /**
   * 新账户的默认运行时状态
   */
  defaultRuntime: {
    accountId: DEFAULT_ACCOUNT_ID,
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
  },

  /**
   * 探测账户连接
   *
   * @param params - 账户和超时
   * @returns 包含 bot 信息或错误的探测结果
   */
  probeAccount: async ({ account, timeoutMs }) => {
    // TODO: 实现连接探测
    // - 验证令牌有效
    // - 获取 bot/用户信息
    // - 检查 API 连接性
    return probeMyChannelConnection(account.token, timeoutMs);
  },

  /**
   * 为状态显示构建账户快照
   *
   * @param params - 账户、配置、运行时和探测数据
   * @returns 账户快照对象
   */
  buildAccountSnapshot: ({ account, runtime, probe }) => ({
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: Boolean(account.token?.trim()),
    running: runtime?.running ?? false,
    lastStartAt: runtime?.lastStartAt ?? null,
    lastStopAt: runtime?.lastStopAt ?? null,
    lastError: runtime?.lastError ?? null,
    probe,
  }),
};

// ============================================================================
// 安全适配器(访问控制)
// ============================================================================

/**
 * <Channel> 的安全适配器
 *
 * 处理 DM 和群组访问策略。
 */
const securityAdapter: ChannelSecurityAdapter<ResolvedMyChannelAccount> = {
  /**
   * 解析 DM 访问策略
   *
   * @param params - 账户配置
   * @returns 包含 allowlist 和提示的 DM 策略
   */
  resolveDmPolicy: ({ account }) => ({
    policy: account.config.dmPolicy,
    allowFrom: account.config.allowFrom,
    policyPath: `channels.<channelId>.dmPolicy`,
    allowFromPath: `channels.<channelId>.`,
    approveHint: `Run: openclaw pairing approve <channel-id>:<user-id>`,
    normalizeEntry: (raw) => raw.replace(/^(<channel-id>):/i, ""),
  }),
};

// ============================================================================
// 功能
// ============================================================================

/**
 * 通道功能声明
 *
 * 声明此通道支持的功能。
 */
const capabilities: ChannelCapabilities = {
  /** 支持的聊天类型 */
  chatTypes: ["direct", "group"],

  /** 是否支持 emoji 反应 */
  reactions: false,

  /** 是否支持线程对话 */
  threads: false,

  /** 是否支持媒体附件 */
  media: true,

  /** 是否支持投票 */
  polls: false,

  /** 是否可以编辑消息 */
  edit: false,

  /** 是否支持回复功能 */
  reply: true,
};

// ============================================================================
// 通道插件导出
// ============================================================================

/**
 * <Channel> 通道插件
 *
 * 这是与 OpenClaw 通道系统集成的
 * 主插件导出。
 */
export const myChannelPlugin: ChannelPlugin<ResolvedMyChannelAccount, MyChannelProbe> = {
  // ========================================================================
  // 必需: 身份
  // ========================================================================

  /** 唯一通道标识符(必须与 package.json openclaw.channel.id 匹配) */
  id: "<channel-id>",

  // ========================================================================
  // 必需: 元数据
  // ========================================================================

  meta: {
    ...meta,
    /** 此通道是否出现在快速启动中 */
    quickstartAllowFrom: true,
  },

  // ========================================================================
  // 必需: 功能
  // ========================================================================

  capabilities,

  // ========================================================================
  // 必需: 配置
  // ========================================================================

  config: configAdapter,

  // ========================================================================
  // 可选: 配置 Schema
  // ========================================================================

  configSchema: buildChannelConfigSchema(MyChannelConfigSchema),

  // ========================================================================
  // 可选: 安全策略
  // ========================================================================

  security: securityAdapter,

  // ========================================================================
  // 可选: 出站消息
  // ========================================================================

  outbound: outboundAdapter,

  // ========================================================================
  // 可选: 网关管理
  // ========================================================================

  gateway: gatewayAdapter,

  // ========================================================================
  // 可选: 状态监控
  // ========================================================================

  status: statusAdapter,

  // ========================================================================
  // 可选: 配置热重载
  // ========================================================================

  reload: { configPrefixes: ["channels.<channelId>"] },

  // ========================================================================
  // 可选: 配对(设备授权)
  // ========================================================================

  pairing: {
    /** 配对 ID 显示的标签 */
    idLabel: "<channelId>UserId",

    /** 规范化 allowlist 条目 */
    normalizeAllowEntry: (entry) => entry.replace(/^(<channel-id>):/i, ""),

    /** 向用户发送批准通知 */
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveMyChannelAccount({ cfg });
      // TODO: 使用 account.token 发送配对批准消息
      console.log(`Pairing approved for ${id}`, account.token ? "(token available)" : "(no token)");
    },
  },

  // ========================================================================
  // 可选: 消息工具
  // ========================================================================

  messaging: {
    /** 规范化目标标识符 */
    normalizeTarget: (target: string) => target.trim(),

    /** 用于 CLI 的目标 ID 解析器 */
    targetResolver: {
      /** 检查字符串是否看起来像有效的目标 ID */
      looksLikeId: (id: string) => /^-?\d+$/.test(id),
      /** CLI 使用提示 */
      hint: "<chatId>",
    },
  },

  // ========================================================================
  // 可选: 目录(用户/群组查找)
  // ========================================================================

  directory: {
    /** 获取当前用户/bot 信息 */
    self: async () => null,

    /** 列出已知对等点(DM 联系人) */
    listPeers: async () => [],

    /** 列出已知群组 */
    listGroups: async () => [],
  },
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从配置解析默认账户 ID
 */
function resolveDefaultMyChannelAccountId(cfg: OpenClawConfig): string {
  const ids = configAdapter.listAccountIds(cfg);
  return ids.includes(DEFAULT_ACCOUNT_ID) ? DEFAULT_ACCOUNT_ID : (ids[0] ?? DEFAULT_ACCOUNT_ID);
}

/**
 * 解析账户配置
 */
function resolveMyChannelAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedMyChannelAccount {
  return configAdapter.resolveAccount(params.cfg, params.accountId);
}

// ============================================================================
// TODO: 实现这些函数
// ============================================================================

/**
 * 通过 <Channel> API 发送文本消息
 *
 * TODO: 实现实际的 API 调用
 */
async function sendMyChannelMessage(
  _to: string,
  _text: string,
  _options: {
    token: string;
    replyToId?: string;
    threadId?: string;
  },
): Promise<{ messageId: string }> {
  // TODO: 替换为实际的 API 实现
  // 示例:
  // const client = createMyChannelClient(options.token);
  // const result = await client.sendMessage(to, text);
  // return { messageId: result.id };

  throw new Error("sendMyChannelMessage not implemented");
}

/**
 * 通过 <Channel> API 发送媒体消息
 *
 * TODO: 实现实际的 API 调用
 */
async function sendMyChannelMedia(
  _to: string,
  _text: string,
  _mediaUrl: string,
  _options: {
    token: string;
  },
): Promise<{ messageId: string }> {
  // TODO: 替换为实际的 API 实现
  // 示例:
  // const client = createMyChannelClient(options.token);
  // const result = await client.sendMedia(to, { caption: text, media: mediaUrl });
  // return { messageId: result.id };

  throw new Error("sendMyChannelMedia not implemented");
}

/**
 * 探测 <Channel> 连接
 *
 * TODO: 实现连接测试
 */
async function probeMyChannelConnection(
  _token: string,
  _timeoutMs: number,
): Promise<MyChannelProbe> {
  // TODO: 替换为实际的 API 实现
  // 示例:
  // const client = createMyChannelClient(token);
  // const me = await client.getMe();
  // return { ok: true, bot: { id: me.id, username: me.username } };

  return { ok: false, error: "Not implemented" };
}

/**
 * 监控 <Channel> 接收消息
 *
 * TODO: 实现消息监控
 * 此函数应运行直到 abortSignal 被中止。
 */
async function monitorMyChannelProvider(_params: {
  token: string;
  accountId: string;
  config: OpenClawConfig;
  runtime: unknown;
  abortSignal: AbortSignal;
}): Promise<void> {
  // TODO: 替换为实际实现
  // 选项:
  // 1. WebSocket: 连接并监听事件
  // 2. Webhook: 启动 HTTP 服务器并接收 POST
  // 3. 轮询: 定期获取新消息
  //
  // 当收到消息时:
  // - 解析并验证消息
  // - 调用 params.runtime.handleInboundMessage(message)
  //
  // 尊重 abortSignal:
  // - 定期检查 abortSignal.aborted
  // - 使用 abortSignal.addEventListener("abort", ...) 进行清理

  throw new Error("monitorMyChannelProvider not implemented");
}
