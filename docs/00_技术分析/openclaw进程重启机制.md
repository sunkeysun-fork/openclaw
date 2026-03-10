# OpenClaw 进程重启机制

## 概述

OpenClaw gateway 实现了三种进程重启模式，根据运行环境自动选择最合适的策略。核心决策逻辑位于 `restartGatewayProcessWithFreshPid()` 函数中，通过检测环境变量和进程管理器来确定重启方式。

## 三种重启模式

### 模式一览

| 模式 | 控制层级 | 触发条件 | PID 是否变化 | 新代码是否生效 |
|---|---|---|---|---|
| `disabled` | 代码层 | `OPENCLAW_NO_RESPAWN=1` | 否 | 否 |
| `supervised` | 系统层 | 检测到 launchd/systemd | 是 | 是 |
| `spawned` | 混合 | 默认（无 supervisor、未禁用） | 是 | 是 |

### 1. `disabled` 模式 — 进程内重启（代码层级控制）

**触发条件：** 环境变量 `OPENCLAW_NO_RESPAWN=1`

**设计目的：** 测试和开发环境使用，避免管理子进程的复杂性。

**核心机制：** 在同一个 Node.js 进程内，通过 `while(true)` 循环销毁旧 server 实例、创建新 server 实例。进程本身从未退出，PID 始终不变。

**关键代码：** `src/cli/gateway-cli/run-loop.ts:185-191`

```typescript
while (true) {
  onIteration();                        // 非首次迭代时调用 resetAllLanes()
  server = await params.start();        // 创建新的 server 实例
  await new Promise<void>((resolve) => {
    restartResolver = resolve;          // 阻塞等待重启信号
  });
}
```

**完整流程：**

```
进程启动 (PID 1234)
└─ while(true) 第 1 次迭代
    ├─ onIteration()           → 首次，无操作
    ├─ server = params.start() → 创建 gateway server
    └─ await promise           → 阻塞等待信号

收到 SIGUSR1
└─ request("restart", "SIGUSR1")
    ├─ 等待活跃任务排空（最多 30 秒）
    ├─ server.close()          → 关闭旧 server
    ├─ restartGatewayProcessWithFreshPid()
    │   └─ 返回 { mode: "disabled" }
    ├─ reacquireLockForInProcessRestart()
    ├─ shuttingDown = false
    └─ restartResolver()       → resolve promise，循环继续

while(true) 第 2 次迭代
├─ onIteration()               → resetAllLanes() 清理残留状态
├─ server = params.start()     → 创建全新 server
└─ await promise               → 再次阻塞等待
```

**重要限制：** 由于 Node.js 模块在首次 `import` 时编译为字节码并永久缓存在内存中，进程内重启**不会加载新代码**。只有运行时状态（server 实例、任务队列、连接等）被重置。

### 2. `supervised` 模式 — 系统级重启

**触发条件：** 检测到以下环境变量之一存在（表明进程由系统级 supervisor 管理）：

```typescript
// src/infra/process-respawn.ts:11-17
const SUPERVISOR_HINT_ENV_VARS = [
  "LAUNCH_JOB_LABEL",   // macOS launchd
  "LAUNCH_JOB_NAME",    // macOS launchd
  "INVOCATION_ID",      // Linux systemd
  "SYSTEMD_EXEC_PID",   // Linux systemd
  "JOURNAL_STREAM",     // Linux systemd
];
```

**流程：**

```
旧进程 (PID 1234)
├─ 收到 SIGUSR1
├─ server.close()
├─ 释放 gateway lock
├─ restartGatewayProcessWithFreshPid() → { mode: "supervised" }
└─ exit(0)  ← 进程真正退出

Supervisor (launchd / systemd)
├─ 检测到进程退出
└─ 根据配置拉起新进程 (PID 5678)
    └─ 新进程走完整启动流程，加载最新代码
```

### 3. `spawned` 模式 — 混合控制

**触发条件：** 默认模式（未设置 `OPENCLAW_NO_RESPAWN`，且未检测到 supervisor）。

**关键代码：** `src/infra/process-respawn.ts:48-56`

```typescript
const child = spawn(process.execPath, args, {
  detached: true,     // 子进程成为独立进程组 leader
  stdio: "inherit",   // 继承标准输入输出
});
child.unref();        // 从父进程事件循环中解除引用
```

**流程：**

```
旧进程 (PID 1234)
├─ 收到 SIGUSR1
├─ server.close()
├─ 释放 gateway lock
├─ spawn(detached: true) + unref()
│   └─ 新进程 (PID 5678) 已创建，独立运行
└─ exit(0)  ← 旧进程退出

新进程 (PID 5678)
├─ PPID → 1 (init/launchd 接管)
└─ 走完整启动流程，获取 gateway lock，加载最新代码
```

**设计要点：**

- `detached: true` — 子进程不依赖父进程存活，父进程退出后子进程继续运行
- `child.unref()` — 父进程的事件循环不会因子进程句柄而保持存活
- 父进程在 spawn 之后立即退出，**完全放弃对子进程的控制权**
- 这是对 Unix `execv` 的模拟（Node.js 没有原生 `execv`），代价是 PID 会变
- 不会产生僵尸进程，因为父进程自身退出后，子进程被 init 接管

## Linux `execve` 对比章节

### `execve` 是什么

`execve` 是 Linux 内核提供的进程镜像替换系统调用：当前进程不退出、PID 不变，但内存映像会被新程序完全替换。调用成功后，原代码不会继续执行。

### 与 OpenClaw 三种模式对比

| 维度 | Linux `execve` | OpenClaw `disabled` | OpenClaw `supervised` | OpenClaw `spawned` |
|---|---|---|---|---|
| 控制层级 | 内核系统调用 | 应用代码循环 | 系统进程管理器 | 应用发起 + OS 执行 |
| PID | 不变 | 不变 | 变化 | 变化 |
| 新代码生效 | 是 | 否 | 是 | 是 |
| 内存状态 | 全部替换 | 局部重建（server/队列） | 全新进程 | 全新进程 |
| 触发后行为 | 直接进入新程序入口 | `server.close()` 后 `params.start()` | `exit(0)` 等待 supervisor 拉起 | `spawn(detached)+unref` 后 `exit(0)` |

### 为什么 OpenClaw 没直接用 `execve`

OpenClaw 当前实现需要在重启前完成“优雅排空任务、关闭连接、释放锁”等流程，并且在不同部署环境（supervisor/非 supervisor）下保持一致行为。

因此 OpenClaw 采用了两层策略：

1. **测试/开发场景**：`OPENCLAW_NO_RESPAWN=1`，走进程内重建 server（不换代码，快速恢复状态）。
2. **生产场景**：优先走 `supervised` 或 `spawned`，通过新进程获得新代码与干净内存。

### 实践建议

- 目标是“配置生效且不中断太久”时，进程内重启即可。
- 目标是“代码升级生效”时，必须走 `supervised` 或 `spawned`（即完整进程替换）。
- 在 Linux 上若使用 systemd，推荐 `supervised` 路径：职责更清晰，重启策略由系统统一托管。

## 重启触发机制

### SIGUSR1 信号

重启由 `SIGUSR1` 信号触发（`src/cli/gateway-cli/run-loop.ts:154-165`）：

```typescript
const onSigusr1 = () => {
  const authorized = consumeGatewaySigusr1RestartAuthorization();
  if (!authorized && !isGatewaySigusr1RestartExternallyAllowed()) {
    return;  // 未授权，忽略
  }
  markGatewaySigusr1RestartHandled();
  request("restart", "SIGUSR1");
};
```

**授权机制：** 不是所有 SIGUSR1 都会被处理。需要通过 `scheduleGatewaySigusr1Restart()`（`src/infra/restart.ts`）预先注册授权 token，或开启外部重启允许。

### 优雅关闭

重启前会等待活跃任务排空（`run-loop.ts:113-125`）：

```typescript
if (isRestart) {
  const activeTasks = getActiveTaskCount();
  if (activeTasks > 0) {
    const { drained } = await waitForActiveTasks(DRAIN_TIMEOUT_MS); // 30s
    if (!drained) {
      // 超时，强制继续重启
    }
  }
}
await server?.close({ reason: "gateway restarting" });
```

## 配置热加载与重启的关系

修改 `openclaw.json` 配置文件**不需要手动重启**即可生效，因为 OpenClaw 实现了独立的配置热加载机制。

### 配置读取方式

配置通过 `loadConfig()`（`src/config/io.ts:1303-1325`）按需从磁盘读取，使用 200ms 短缓存：

```typescript
export function loadConfig(): OpenClawConfig {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;              // 200ms 内返回缓存
  }
  const config = io.loadConfig();      // 过期后重新读磁盘
  configCache = { configPath, expiresAt: now + 200, config };
  return config;
}
```

### 文件监听

使用 `chokidar` 监听配置文件变更（`src/gateway/config-reload.ts:390-407`），检测到变更后根据改动内容决定处理方式：

| 配置项变更 | 处理方式 |
|---|---|
| `hooks`、`cron`、`browser` | 热重载（进程内直接替换） |
| `plugins`、`gateway`、`discovery` | 触发完整重启（SIGUSR1） |

默认 reload mode 为 `hybrid`——能热重载就热重载，不能就触发重启。

### 代码 vs 配置的区别

| | JS 代码模块 | JSON 配置文件 |
|---|---|---|
| 加载方式 | `import` → V8 编译字节码 → 模块 registry 永久缓存 | `fs.readFileSync` → `JSON.parse` → 200ms TTL 缓存 |
| 更新方式 | 必须新进程才能加载新代码 | 随时从磁盘读取最新值 |
| 进程内重启后 | 仍然执行旧代码 | 自动读取新配置 |

## entry.ts 的初始 spawn

`src/entry.ts:72-79` 中还有一个独立的 spawn 逻辑，用于压制 Node.js 的 `ExperimentalWarning`。这与 gateway 重启是完全不同的机制：

| | entry.ts 的 spawn | process-respawn.ts 的 spawn |
|---|---|---|
| 目的 | 添加 `--disable-warning` Node 参数 | gateway 进程替换 |
| `detached` | `false` | `true` |
| `unref` | 否 | 是 |
| 父进程行为 | 等待子进程退出，转发信号 | 立即退出 |
| 信号转发 | 通过 `attachChildProcessBridge` 转发 | 无 |

当 `OPENCLAW_NO_RESPAWN=1` 时，`entry.ts` 的 spawn 也会被跳过（`entry.ts:59-61`），整个运行过程中**不会创建任何子进程**。

## 僵尸进程分析

三种模式均不会产生僵尸进程：

- **`disabled`** — 不创建任何子进程，不可能有僵尸进程
- **`supervised`** — 进程自身退出，由 supervisor 管理，不存在父进程未 wait 的情况
- **`spawned`** — 子进程 `detached + unref`，父进程随即退出。子进程被 init 接管（PPID=1），由 init 负责回收

## 涉及源文件

| 文件 | 职责 |
|---|---|
| `src/infra/process-respawn.ts` | 重启模式决策（disabled/supervised/spawned） |
| `src/cli/gateway-cli/run-loop.ts` | while(true) 主循环、信号处理、优雅关闭 |
| `src/infra/restart.ts` | SIGUSR1 调度、授权、deferral 机制 |
| `src/process/restart-recovery.ts` | 重启迭代钩子（resetAllLanes） |
| `src/process/child-process-bridge.ts` | entry.ts spawn 的信号转发桥接 |
| `src/entry.ts` | 初始 spawn（ExperimentalWarning 压制） |
| `src/config/io.ts` | 配置加载与 200ms 缓存 |
| `src/gateway/config-reload.ts` | chokidar 文件监听与热加载/重启决策 |
