# OpenClaw 定时任务实现原理

## 概述

OpenClaw 的定时任务系统采用**进程内轮询调度**架构，不依赖任何操作系统级定时服务（crontab、launchd、systemd timer 等）。整个调度器运行在 Gateway Node.js 进程内部，通过 `setTimeout` 驱动定时轮询，配合第三方库 `croner` 解析 cron 表达式并计算下次触发时间。

**核心设计理念**：将 `croner` 作为无状态的 cron 表达式求解器使用（仅调用 `nextRun()`），调度控制、持久化、并发管理等全部由 OpenClaw 自行实现。

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Gateway 进程                              │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ server-cron  │───▶│   CronService    │───▶│   timer.ts    │  │
│  │ (Gateway集成) │    │   (service.ts)   │    │  (调度引擎)    │  │
│  └──────────────┘    └──────────────────┘    └───────┬───────┘  │
│                                                       │          │
│                              ┌────────────────────────┼────┐     │
│                              ▼                        ▼    │     │
│                       ┌────────────┐          ┌──────────┐ │     │
│                       │  jobs.ts   │          │ store.ts │ │     │
│                       │ (Job计算)  │          │ (持久化)  │ │     │
│                       └──────┬─────┘          └──────────┘ │     │
│                              │                              │     │
│                              ▼                              │     │
│                       ┌────────────┐                        │     │
│                       │schedule.ts │                        │     │
│                       │(cron求解)  │                        │     │
│                       └──────┬─────┘                        │     │
│                              │                              │     │
│                              ▼                              │     │
│                       ┌────────────┐                        │     │
│                       │  croner    │                        │     │
│                       │ (第三方库)  │                        │     │
│                       └────────────┘                        │     │
│                                                             │     │
│  ┌─────────────────────────────────────────────────────────┘     │
│  │  locked.ts (操作串行化)                                        │
│  └───────────────────────────────────────────────────────────────│
│                                                                  │
│  持久化: ~/.openclaw/cron/jobs.json                               │
└─────────────────────────────────────────────────────────────────┘
```

## 源码目录结构

```
src/cron/
├── service.ts                    # CronService 主类（对外 API 门面）
├── service/
│   ├── timer.ts                 # 定时器引擎（armTimer, onTimer, 执行逻辑）
│   ├── jobs.ts                  # Job 计算（nextRunAtMs, stagger, 创建/更新）
│   ├── store.ts                 # 内存 ↔ 磁盘同步（ensureLoaded, persist）
│   ├── state.ts                 # 服务状态类型定义与依赖注入
│   ├── ops.ts                   # 操作入口（start, stop, add, update, run 等）
│   ├── locked.ts                # 基于 Promise 链的操作串行化
│   └── normalize.ts             # 字段规范化
├── schedule.ts                  # croner 封装（computeNextRunAtMs）
├── parse.ts                     # 绝对时间解析（ISO 8601 / 毫秒时间戳）
├── stagger.ts                   # 惊群防护（整点分散）
├── store.ts                     # 文件 I/O（loadCronStore / saveCronStore）
├── types.ts                     # 完整类型定义
├── delivery.ts                  # 投递计划解析
├── isolated-agent.ts            # 隔离 Agent 执行
├── isolated-agent/              # 隔离 Agent 子模块
├── run-log.ts                   # 运行日志
├── session-reaper.ts            # 会话清理
├── stagger.ts                   # 惊群分散
└── webhook-url.ts               # Webhook URL 规范化

src/gateway/
├── server-cron.ts               # Gateway 集成入口（buildGatewayCronService）
└── server.impl.ts               # Gateway 启动（调用 cron.start()）
```

## 三种调度类型

定义在 `src/cron/types.ts:3-12`：

```typescript
export type CronSchedule =
  | { kind: "at"; at: string }                          // 一次性绝对时间
  | { kind: "every"; everyMs: number; anchorMs?: number } // 固定间隔
  | {
      kind: "cron";
      expr: string;       // 标准 cron 表达式（5 或 6 字段）
      tz?: string;        // IANA 时区
      staggerMs?: number; // 确定性分散窗口
    };
```

| 类型 | 示例 | 说明 |
|------|------|------|
| `at` | `"2026-03-01T08:00:00Z"` | 一次性触发，执行后自动禁用或删除 |
| `every` | `{ everyMs: 300000 }` | 固定间隔（如每 5 分钟），基于锚点时间对齐 |
| `cron` | `{ expr: "0 7 * * *" }` | 标准 cron 表达式，支持时区和分散调度 |

## 定时器引擎（核心调度机制）

### 关键常量

定义在 `src/cron/service/timer.ts`：

```typescript
const MAX_TIMER_DELAY_MS = 60_000;            // 最大休眠间隔 60 秒
const MIN_REFIRE_GAP_MS = 2_000;              // 同一 Job 最小重触发间隔 2 秒
export const DEFAULT_JOB_TIMEOUT_MS = 10 * 60_000; // 单 Job 执行超时 10 分钟
```

### armTimer — 设置下次唤醒

`src/cron/service/timer.ts:253-292`:

```typescript
export function armTimer(state: CronServiceState) {
  // 1. 清除旧 timer
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;

  // 2. 查找最近的 nextRunAtMs
  const nextAt = nextWakeAtMs(state);
  if (!nextAt) return;  // 没有待执行的 Job

  // 3. 计算延迟，但不超过 60 秒
  const now = state.deps.nowMs();
  const delay = Math.max(nextAt - now, 0);
  const clampedDelay = Math.min(delay, MAX_TIMER_DELAY_MS);

  // 4. 设置 setTimeout
  state.timer = setTimeout(() => {
    void onTimer(state).catch(err => { /* 日志 */ });
  }, clampedDelay);
}
```

**60 秒上限的设计意义**：
- 防止系统休眠/恢复后 `setTimeout` 回调被延迟导致的调度漂移
- 避免 `setTimeout` 的 32 位整数溢出问题（约 24.8 天上限）
- 确保进程恢复后能在最多 60 秒内重新响应

### onTimer — 主循环

`src/cron/service/timer.ts:305-457`，完整执行流程：

```
onTimer() 被 setTimeout 唤醒
  │
  ├─ 检查 state.running（防并发）
  │   └─ 如果正在运行 → armRunningRecheckTimer() → 60秒后再检查 → return
  │
  ├─ state.running = true
  ├─ armRunningRecheckTimer()   ← 看门狗：即使执行卡住也能继续调度
  │
  ├─ locked() {
  │     ensureLoaded(forceReload)  ← 从磁盘重新加载 jobs.json
  │     findDueJobs()              ← 筛选 nowMs >= nextRunAtMs 的 Job
  │     标记 runningAtMs → persist  ← 落盘"正在执行"标记
  │   }
  │
  ├─ 并发执行到期 Job（受 maxConcurrentRuns 限制）
  │     workers = Array(concurrency) → 每个 worker 从队列取 Job 执行
  │     executeJobCoreWithTimeout()  ← 单 Job 超时保护
  │
  ├─ locked() {
  │     ensureLoaded(forceReload)    ← 再次从磁盘加载
  │     applyOutcomeToStoredJob()    ← 更新执行结果
  │     recomputeNextRunsForMaintenance() ← 维护性重算
  │     persist()                    ← 落盘
  │   }
  │
  ├─ 会话清理（sweepCronRunSessions，每 5 分钟自限流）
  │
  └─ finally {
       state.running = false
       armTimer()  ← 重新设置下次唤醒
     }
```

### 并发控制模型

```typescript
// timer.ts:382-398
const concurrency = Math.min(resolveRunConcurrency(state), Math.max(1, dueJobs.length));
const results = Array.from({ length: dueJobs.length });
let cursor = 0;

// Worker 池模式：N 个 worker 从共享游标取任务
const workers = Array.from({ length: concurrency }, async () => {
  for (;;) {
    const index = cursor++;
    if (index >= dueJobs.length) return;
    results[index] = await runDueJob(dueJobs[index]);
  }
});
await Promise.all(workers);
```

默认 `maxConcurrentRuns = 1`（串行执行），可通过配置调高。

## Job 生命周期与状态机

### CronJob 完整类型

`src/cron/types.ts:110-127`:

```typescript
export type CronJob = {
  id: string;                       // UUID
  agentId?: string;                 // 所属 Agent
  sessionKey?: string;              // 会话命名空间
  name: string;                     // 显示名称
  description?: string;             // 描述
  enabled: boolean;                 // 是否启用
  deleteAfterRun?: boolean;         // 执行后删除（一次性 Job）
  createdAtMs: number;              // 创建时间戳
  updatedAtMs: number;              // 更新时间戳
  schedule: CronSchedule;           // 调度配置
  sessionTarget: CronSessionTarget; // "main" | "isolated"
  wakeMode: CronWakeMode;          // "next-heartbeat" | "now"
  payload: CronPayload;            // 执行载荷
  delivery?: CronDelivery;         // 投递配置
  state: CronJobState;             // 运行时状态
};
```

### CronJobState 运行时状态

`src/cron/types.ts:88-108`:

```typescript
export type CronJobState = {
  nextRunAtMs?: number;            // 下次执行时间（毫秒时间戳）
  runningAtMs?: number;            // 当前正在执行的时间标记
  lastRunAtMs?: number;            // 上次执行时间
  lastRunStatus?: CronRunStatus;   // "ok" | "error" | "skipped"
  lastError?: string;              // 上次错误信息
  lastDurationMs?: number;         // 上次执行耗时
  consecutiveErrors?: number;      // 连续错误计数（用于退避）
  scheduleErrorCount?: number;     // 调度计算错误计数（超限自动禁用）
  lastDeliveryStatus?: CronDeliveryStatus;
  lastDeliveryError?: string;
  lastDelivered?: boolean;
};
```

### 状态转换

```
                    ┌─────────────┐
                    │   created   │
                    │ enabled=true│
                    └──────┬──────┘
                           │ computeJobNextRunAtMs()
                           ▼
                    ┌─────────────┐
              ┌────▶│   waiting   │◀────────────────────────────┐
              │     │ nextRunAtMs │                              │
              │     └──────┬──────┘                              │
              │            │ nowMs >= nextRunAtMs                │
              │            ▼                                     │
              │     ┌─────────────┐                              │
              │     │  running    │                              │
              │     │ runningAtMs │                              │
              │     └──────┬──────┘                              │
              │            │                                     │
              │     ┌──────┴──────┐                              │
              │     ▼             ▼                              │
              │  ┌──────┐   ┌──────────┐                        │
              │  │  ok  │   │  error   │                        │
              │  └──┬───┘   └────┬─────┘                        │
              │     │            │                               │
              │     │ recompute  │ backoff + recompute           │
              │     │ nextRunAtMs│ nextRunAtMs                   │
              │     └────────────┴───────────────────────────────┘
              │
              │  一次性 Job (kind="at")
              │     │
              │     ▼
              │  ┌──────────┐
              └──│ disabled  │  enabled=false, nextRunAtMs=undefined
                 └──────────┘
```

## 下次执行时间计算

### computeNextRunAtMs — 三类调度的统一入口

`src/cron/schedule.ts:13-77`:

#### kind = "at"（一次性）

直接解析 ISO 8601 或毫秒时间戳，若 `atMs > nowMs` 则返回，否则返回 `undefined`。

#### kind = "every"（固定间隔）

```
anchor = schedule.anchorMs ?? nowMs
elapsed = nowMs - anchor
steps = ceil(elapsed / everyMs)
nextRunAtMs = anchor + steps * everyMs
```

基于锚点的对齐计算，确保间隔一致。

#### kind = "cron"（cron 表达式）

调用 croner 库计算：

```typescript
const cron = new Cron(expr, {
  timezone: resolveCronTimezone(schedule.tz),
  catch: false,
});
const next = cron.nextRun(new Date(nowMs));
```

**防同秒重调度**：如果 croner 返回的时间 <= nowMs，则从下一个整秒重试：

```typescript
const nextSecondMs = Math.floor(nowMs / 1000) * 1000 + 1000;
const retry = cron.nextRun(new Date(nextSecondMs));
```

### computeJobNextRunAtMs — Job 级增强

`src/cron/service/jobs.ts:134-178`，在 `computeNextRunAtMs` 基础上增加：

1. **`every` 类型的 lastRunAtMs 感知**：优先从上次执行时间推算，保证间隔准确
2. **`at` 类型的去重**：已成功执行过的一次性 Job 不再返回
3. **cron 类型的分散调度**：经过 `computeStaggeredCronNextRunAtMs` 处理

### 惊群分散（Stagger）

`src/cron/service/jobs.ts:30-64` + `src/cron/stagger.ts`:

**问题**：大量 Job 配置 `"0 * * * *"`（每小时整点）时，会同时触发产生惊群效应。

**方案**：基于 SHA-256 的确定性偏移。

```typescript
function resolveStableCronOffsetMs(jobId: string, staggerMs: number) {
  if (staggerMs <= 1) return 0;
  const digest = crypto.createHash("sha256").update(jobId).digest();
  return digest.readUInt32BE(0) % staggerMs;
}
```

- 默认对整点 cron 表达式启用 **5 分钟分散窗口** (`DEFAULT_TOP_OF_HOUR_STAGGER_MS = 300_000`)
- 每个 Job 根据 `SHA256(jobId) % staggerMs` 获得固定偏移量
- 可通过 `schedule.staggerMs = 0` 禁用（精确调度）

## 错误处理与退避机制

### 指数退避

`src/cron/service/timer.ts:108-119`:

```typescript
const ERROR_BACKOFF_SCHEDULE_MS = [
  30_000,       // 第 1 次错误 →  30 秒
  60_000,       // 第 2 次错误 →   1 分钟
  5 * 60_000,   // 第 3 次错误 →   5 分钟
  15 * 60_000,  // 第 4 次错误 →  15 分钟
  60 * 60_000,  // 第 5+ 次错误 →  60 分钟
];
```

应用逻辑（`applyJobResult`，`timer.ts:188-204`）：

```
正常 nextRunAtMs = croner 计算的下次时间
退避 nextRunAtMs = max(正常 nextRunAtMs, endedAt + backoffMs)
```

成功执行后 `consecutiveErrors` 重置为 0，退避随之消除。

### 调度计算错误自动禁用

`src/cron/service/jobs.ts:180-210`：

连续 3 次调度计算失败（如 cron 表达式无效）后自动禁用 Job：

```typescript
const MAX_SCHEDULE_ERRORS = 3;

if (errorCount >= MAX_SCHEDULE_ERRORS) {
  job.enabled = false;
  // 日志: "cron: auto-disabled job after repeated schedule errors"
}
```

### 卡死运行检测

`src/cron/service/jobs.ts:28, 236-244`：

```typescript
const STUCK_RUN_MS = 2 * 60 * 60 * 1000; // 2 小时

if (typeof runningAt === "number" && nowMs - runningAt > STUCK_RUN_MS) {
  job.state.runningAtMs = undefined; // 清除卡死标记
}
```

## 持久化机制

### 存储格式

文件路径：`~/.openclaw/cron/jobs.json`（默认）

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "每日摘要",
      "enabled": true,
      "schedule": { "kind": "cron", "expr": "0 7 * * *", "tz": "Asia/Shanghai" },
      "sessionTarget": "isolated",
      "wakeMode": "now",
      "payload": { "kind": "agentTurn", "message": "生成今日摘要" },
      "state": {
        "nextRunAtMs": 1709456400000,
        "lastRunAtMs": 1709370000000,
        "lastRunStatus": "ok"
      }
    }
  ]
}
```

### 原子写入

`src/cron/store.ts:50-62`:

```typescript
export async function saveCronStore(storePath: string, store: CronStoreFile) {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  // 1. 写入临时文件（pid + 随机后缀）
  const tmp = `${storePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");
  // 2. 原子 rename
  await fs.promises.rename(tmp, storePath);
  // 3. 最佳努力备份
  try {
    await fs.promises.copyFile(storePath, `${storePath}.bak`);
  } catch { /* best-effort */ }
}
```

### 操作串行化

`src/cron/service/locked.ts`:

基于 Promise 链的无锁串行化，按 storePath 隔离：

```typescript
const storeLocks = new Map<string, Promise<void>>();

export async function locked<T>(state: CronServiceState, fn: () => Promise<T>): Promise<T> {
  const storePath = state.deps.storePath;
  const storeOp = storeLocks.get(storePath) ?? Promise.resolve();
  // 等待当前 state 操作和同 storePath 操作都完成后再执行
  const next = Promise.all([resolveChain(state.op), resolveChain(storeOp)]).then(fn);
  // 无论成功失败都更新链
  const keepAlive = resolveChain(next);
  state.op = keepAlive;
  storeLocks.set(storePath, keepAlive);
  return (await next) as T;
}
```

这确保了同一个 store 文件的所有读写操作不会产生竞态条件。

## Job 执行模型

### 两种执行目标

`src/cron/service/timer.ts:605-771`:

#### 1. Main Session（`sessionTarget: "main"`）

将文本注入主会话的系统事件队列：

```
enqueueSystemEvent(text, { agentId, sessionKey, contextKey })
  │
  ├─ wakeMode = "now"
  │     → runHeartbeatOnce() 立即执行心跳（带忙等待重试）
  │
  └─ wakeMode = "next-heartbeat"
        → requestHeartbeatNow() 请求下次心跳时处理
```

#### 2. Isolated Session（`sessionTarget: "isolated"`）

在独立上下文中运行 Agent：

```
runIsolatedAgentJob({
  job,
  message: payload.message,
  abortSignal
})
  │
  ├─ 创建独立会话 "cron:<jobId>"
  ├─ 可覆盖 model / thinking 参数
  ├─ 执行完成后可选投递到消息通道
  └─ 返回 { status, summary, delivered, sessionId, ... }
```

### 执行超时保护

`src/cron/service/timer.ts:59-85`:

```typescript
export async function executeJobCoreWithTimeout(state, job) {
  const jobTimeoutMs = resolveCronJobTimeoutMs(job); // 默认 10 分钟
  const runAbortController = new AbortController();

  return await Promise.race([
    executeJobCore(state, job, runAbortController.signal),
    new Promise((_, reject) => {
      setTimeout(() => {
        runAbortController.abort("cron: job execution timed out");
        reject(new Error("cron: job execution timed out"));
      }, jobTimeoutMs);
    }),
  ]);
}
```

## Gateway 集成

### 启动流程

`src/cron/service/ops.ts:89-128` (`start` 函数):

```
Gateway 启动
  │
  ├─ 1. loadConfig() → 读取配置
  │
  ├─ 2. buildGatewayCronService() → 创建 CronService
  │     └─ 注入依赖：log, storePath, enqueueSystemEvent,
  │        requestHeartbeatNow, runIsolatedAgentJob 等
  │
  ├─ 3. cron.start()
  │     ├─ locked: ensureLoaded() 从 jobs.json 加载
  │     ├─ 清除上次中断的 runningAtMs 标记
  │     ├─ runMissedJobs() ← 执行停机期间错过的 Job
  │     ├─ locked: recomputeNextRuns() → persist()
  │     └─ armTimer() ← 启动定时器循环
  │
  └─ 4. 定时器开始滴答运行
```

### 配置项

`src/config/types.cron.ts`（通过 `src/cron/service/state.ts:37-87` 引用）:

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `cron.enabled` | `boolean` | 是否启用定时任务（默认 true） |
| `cron.store` | `string` | 自定义 store 路径 |
| `cron.maxConcurrentRuns` | `number` | Job 并发执行数（默认 1） |
| `cron.webhook` | `string` | 全局 Webhook URL（legacy） |
| `cron.webhookToken` | `string` | Webhook Bearer Token |
| `cron.sessionRetention` | `string \| false` | 隔离会话保留时间（如 `"24h"`） |
| `cron.runLog.maxBytes` | `number` | 运行日志最大字节数 |
| `cron.runLog.keepLines` | `number` | 运行日志保留行数 |

环境变量 `OPENCLAW_SKIP_CRON=1` 可强制禁用。

### 事件广播

所有 Job 事件通过 WebSocket 广播给前端 UI：

```typescript
onEvent: (evt) => {
  params.broadcast("cron", evt, { dropIfSlow: true });
  // 如果有 webhook 配置，还会 POST 结果到 webhook URL
}
```

## croner 库核心原理

### 概述

croner v10.0.1 是一个零依赖的纯 JavaScript cron 表达式解析和调度库。OpenClaw 仅使用其 `Cron` 类的 `nextRun()` 方法进行"下次触发时间"计算。

### 三大核心类

#### CronPattern — 表达式解析器

**职责**：将 cron 字符串解析为"位图数组"。

```
"0 7 * * 1-5"
  ↓ parse()
second[0]=1, minute[0]=1, hour[7]=1, day[*]=1, dayOfWeek[1..5]=1
```

**内部数据结构** — 每个时间维度用一个整数数组（值 0 或 1）标记哪些值被选中：

| 字段 | 数组长度 | 范围 |
|------|---------|------|
| `second` | 60 | 0-59 |
| `minute` | 60 | 0-59 |
| `hour` | 24 | 0-23 |
| `day` | 31 | 1-31（索引偏移 -1） |
| `month` | 12 | 1-12（索引偏移 -1） |
| `dayOfWeek` | 7 | 0-6（Sun-Sat） |
| `year` | 10000 | 1-9999 |

**解析流程**：

1. 别名替换：`@yearly` → `"0 0 1 1 *"`，`@daily` → `"0 0 * * *"` 等
2. 字段补齐：5 段补秒 `"0"` 和年 `"*"`；6 段补年
3. 特殊修饰符：`L`（最后一天）、`W`（最近工作日）、`#`（第 N 个星期几）
4. 字母替换：`MON`→`1`，`JAN`→`1`
5. 逐段解析：`*` → 全选，`3-23/5` → 范围步进，`*/14` → 通配步进

**dayOfWeek 的位掩码编码**：

```javascript
// 第 N 个星期几用位掩码 O = [1, 2, 4, 8, 16]
FRI#2 → dayOfWeek[5] |= 0b00010  // 第 2 个周五
FRI#L → dayOfWeek[5] |= 32        // 最后一个周五
```

#### CronDate — 时区感知的日期递增引擎

**核心算法** — `increment()` + `recurse()`：

```javascript
increment(pattern, options, hasPreviousRun) {
  this.second += 1;  // 至少前进 1 秒
  this.ms = 0;
  this.apply();      // 处理溢出
  return this.recurse(pattern, options, 0);  // 递归匹配
}
```

**递归查找**按 `month → day → hour → minute → second` 逐层匹配：

```
递归步骤: [month/year, day/month, hour/day, minute/hour, second/minute]

每层调用 findNext() 在位图数组上线性扫描：
  返回 1：当前值匹配    → 继续下一层
  返回 2：找到更大的值  → 下层全部重置为最小值
  返回 3：没找到        → 上层进位，从 step 0 重新递归
```

**防无限循环**：年份 >= 10000 时返回 null。

**时区处理**：通过 `Intl.DateTimeFormat.formatToParts()` 实现时区转换，不依赖 moment/luxon。

#### Cron — 调度主类

OpenClaw 使用的核心方法：

```typescript
const cron = new Cron("0 7 * * *", { timezone: "Asia/Shanghai" });
const nextDate = cron.nextRun(new Date());  // 返回 Date | null
```

croner 内部也有自己的 `setTimeout` 自调度机制（`MAX_DELAY = 30秒`），但 OpenClaw **没有使用**这部分功能，而是自行实现了更完善的调度引擎。

## 安全机制汇总

| 机制 | 位置 | 说明 |
|------|------|------|
| 60 秒心跳上限 | `timer.ts:22` | 防止 setTimeout 漂移和系统休眠 |
| 2 秒重触发间隔 | `timer.ts:31` | 防止同秒重复触发自旋循环 |
| 10 分钟执行超时 | `timer.ts:38` | 防止单个 Job 阻塞整个调度器 |
| 指数退避 | `timer.ts:108-119` | 错误后逐级延长重试间隔（30s → 60min） |
| 3 次计算错误自动禁用 | `jobs.ts:181` | 无效表达式不会无限重试 |
| 2 小时卡死检测 | `jobs.ts:28` | 清除僵死的 runningAtMs 标记 |
| 看门狗 timer | `timer.ts:294-303` | 执行期间保持 timer 存活，防止长时间 Job 导致调度器停摆 |
| 原子写入 | `store.ts:50-62` | tmp 文件 + rename，防止写入中断导致数据损坏 |
| 操作串行化 | `locked.ts` | Promise 链确保同一 store 的操作不竞态 |
| 启动补偿 | `ops.ts:112` | `runMissedJobs()` 执行停机期间错过的任务 |
| 惊群分散 | `stagger.ts` + `jobs.ts:30-64` | SHA256 确定性偏移，默认 5 分钟窗口 |

## 与系统级定时任务的对比

| 特性 | OpenClaw 进程内调度 | 系统级 cron |
|------|-------------------|------------|
| 调度引擎 | Node.js `setTimeout` 轮询 | 操作系统内核/守护进程 |
| 表达式解析 | croner 库 | 系统自带 |
| 进程依赖 | 依赖 Gateway 进程存活 | 系统级，独立于应用进程 |
| 持久化 | JSON 文件 | crontab 文件 |
| 时区支持 | `Intl.DateTimeFormat` | 系统时区 |
| 精度 | 秒级（受 60s 心跳限制） | 分钟级（系统 cron） |
| 动态管理 | API 实时增删改 | 需编辑 crontab |
| 状态追踪 | 完整（上次状态、错误、耗时） | 无（需额外实现） |
| 错误处理 | 内建退避、超时、自动禁用 | 无（需脚本实现） |
| 惊群防护 | SHA256 确定性分散 | 无 |
