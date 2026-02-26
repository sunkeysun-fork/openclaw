# WebSocket 可靠性保障技术方案

## 目录

1. [背景](#背景)
2. [开源库方案](#开源库方案)
3. [实施建议](#实施建议)

---

## 背景

WebSocket 连接在不可靠网络环境下面临的主要挑战：

| 问题         | 影响          | 典型现象                    |
| ------------ | ------------- | --------------------------- |
| **断开**     | 消息丢失      | 50% 消息可能因网络抖动断开  |
| **超时**     | 服务端断开    | 防火墙/NAT 超时断开空闲连接 |
| **网络抖动** | 丢包/延迟激增 | 临时网络质量波动            |
| **并发控制** | 服务器拒绝    | 大量并发导致限流            |
| **重连风暴** | 服务拒绝      | 断开后同时重连，雪崩服务器  |

---

## 开源库方案

### 1. reconnecting-websocket

**GitHub**: [pladaria/reconnecting-websocket](https://github.com/pladaria/reconnecting-websocket)

**特点:**

- ✅ 极其轻量（< 600 bytes gzipped）
- ✅ 完整的原生 WebSocket 支持
- ✅ 内置指数退避重连
- ✅ 可配置的最大重连次数和延迟

**配置示例:**

```typescript
import ReconnectingWebSocket from "reconnecting-websocket";

const ws = new ReconnectingWebSocket("ws://your-server.com/ws", {
  connectionTimeout: 4000,
  maxReconnectionDelay: 30000, // 30秒最大延迟
  maxRetries: 10, // 最多重连10次
});

ws.addEventListener("open", () => console.log("Connected"));
ws.addEventListener("message", (data) => console.log("Received:", data));
```

**适用场景:**

- 小规模应用，轻量级需求
- 对 WebSocket-only 场景
- 需要简单重连即可的场景

---

### 2. websocket-heartbeat-js

**GitHub**: [Nebulous/websocket-heartbeat-js](https://github.com/Nebulous/websocket-heartbeat-js)

**特点:**

- ✅ 内置心跳检测机制
- ✅ 支持 Ping/Pong 模式
- ✅ 超时检测连接健康
- ✅ 自动重连支持
- ✅ 配置化的超时和间隔

**配置示例:**

```typescript
import WebSocketHeartbeat from "websocket-heartbeat-js";

const ws = WebSocketHeartbeat("ws://your-server.com/ws", {
  heartbeatMessage: "heartbeat",
  heartbeatTimeout: 15000, // 15秒无响应则断开
  reconnectInterval: 30000, // 30秒检查间隔
  reconnectIfNotOpen: true, // 连接关闭时重连
});

ws.addEventListener("message", (data) => {
  console.log("Message received:", data);
  ws.sendPong(); // 自动响应 pong
});
```

**适用场景:**

- 需要心跳检测的通道
- 需要自动重连的场景
- 对服务器 Ping 有响应的要求

---

### 3. best-websocket

**GitHub**: [mroderikbest/websocket](https://github.com/mroderikbest/websocket)

**特点:**

- ✅ 原生 WebSocket 封装
- ✅ 自动重连机制（指数退避）
- ✅ 内置心跳支持
- ✅ 事件监听完整
- ✅ 简单易用的 API

**配置示例:**

```typescript
import BestWebSocket from "best-websocket";

const ws = BestWebSocket("ws://your-server.com/ws", {
  maxReconnectionDelay: 1000, // 1秒初始延迟
  maxReconnectAttempts: 10, // 最大重连次数
});

ws.addEventListener("open", () => console.log("Connected"));
ws.addEventListener("message", (data) => console.log("Received:", data));
```

**适用场景:**

- React 应用
- 需要完整 WebSocket 的事件支持
- 需要自动重连的场景

---

### 4. easy-websocket-client

**GitHub**: [easy-websocket-client](https://github.com/easy-websocket-client)

**特点:**

- ✅ Auto-reconnection mechanism
- ✅ Full lifecycle event callbacks (onOpen, onClose, onMessage, onError)
- ✅ Message queue for offline buffering
- ✅ Simple and easy to use

**配置示例:**

```typescript
import EasyWebSocket from "easy-websocket-client";

const ws = new EasyWebSocket("ws://your-server.com/ws");

ws.on("open", () => {
  console.log("Connected");
});
ws.on("message", (data) => {
  console.log("Message:", data);
});
ws.on("close", () => {
  console.log("Disconnected");
});
```

**适用场景:**

- 简单场景，需要基本的连接管理
- 不需要复杂的状态机

---

### 5. react-use-websocket

**GitHub**: [david-chen/react-use-websocket](https://github.com/david-chen/react-use-websocket)

**特点:**

- ✅ React Hooks 集成
- ✅ 自动重连机制
- ✅ 内置心跳支持
- ✅ 连接状态管理
- ✅ 消息缓存队列

**适用场景:**

- React 应用
- 需要生命周期管理的大型应用
- 需要状态持久化

---

### 6. opossum (Circuit Breaker Library)

**GitHub**: [nodeshift/opossum](https://github.com/nodeshift/opossum)

**特点:**

- ✅ JavaScript/Node.js Circuit Breaker
- ✅ 事件驱动架构
- ✅ 可配置的超时和阈值
- ✅ 降级到半开的自动恢复
- ✅ 完整的状态追踪

**配置示例:**

```typescript
import { CircuitBreaker } from "opossum";

const breaker = new CircuitBreaker(webSocketFunction, {
  timeout: 5000, // 5秒超时
  errorThresholdPercentage: 50, // 50% 失败率触发
});

// 发送消息
breaker.execute(async () => {
  await ws.send(JSON.stringify(data));
});
```

**适用场景:**

- 高并发场景
- 需要熔断保护的服务
- 需要防止雪崩

---

### 7. 实施建议

#### 1. 渐进式实现路径

```
阶段 1: 基础重连 (指数退避)
    → 增加心跳检测
    → 优化重连参数

阶段 2: 引入状态管理
    → 实现 ConnectionState 枚举
    → 添加重连计数追踪

阶段 3: 错误分类处理
    → 根据错误类型采用不同策略

阶段 4: 监控和告警
    → 记录重连成功率
    → 设置重连阈值告警
```

#### 2. 推荐配置值

```typescript
// 基础配置
{
  // 重连参数
  baseDelay: 1000,              // 初始延迟 1秒
  maxDelay: 30000,              // 最大延迟 30 秒
  maxRetries: 10,                 // 最大重连 10 次

  // 心跳参数
  heartbeatInterval: 30000,        // 心跳间隔 30 秒
  heartbeatTimeout: 15000,          // 心跳超时 15 秒

  // 熔断参数
  circuitThreshold: 5,               // 熔断阈值 5 次
  resetTimeout: 30000,             // 恢复时间 30 秒
}
```

#### 3. 简单实现示例

```typescript
// 基础重连 + 心跳
class SimpleReliableWS {
  private reconnectAttempts = 0;
  private isConnected = false;

  async connect() {
    const ws = new WebSocket("ws://server.com/ws");

    ws.on("open", () => {
      this.isConnected = true;
      this.startHeartbeat();
    });

    ws.on("message", (data) => {
      this.handleMessage(data);
    });

    ws.on("close", () => {
      this.isConnected = false;
      this.scheduleReconnect();
    });
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.ws.send("ping");
    }, 30000);
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= 10) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;

    setTimeout(() => this.connect(), delay);
  }
}
```

---

### 8. 对比总结

| 库                         | 复杂度 | 轻量 | 易用性   | 维护活跃度 |
| -------------------------- | ------ | ---- | -------- | ---------- | ---- | -------- | -------- | -------- | ---- |
| **reconnecting-websocket** | ⭐⭐   | ⭐⭐ | ⭐       | ⭐⭐⭐⭐   | 小   | 中等     | 非常活跃 |
| **websocket-heartbeat-js** | ⭐⭐   | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐       | 中等 | 生产就绪 |
| **best-websocket**         | ⭐⭐   | ⭐⭐ | ⭐⭐⭐   | 高         | 低   | 活跃     |
| **easy-websocket-client**  | ⭐⭐   | ⭐⭐ | ⭐⭐     | ⭐⭐       | 高   | 简单     | 基础功能 |
| **react-use-websocket**    | ⭐⭐   | ⭐⭐ | ⭐⭐⭐   | 依赖 React | 中等 | 活跃     |
| **oposum**                 | ⭐⭐   | ⭐⭐ | ⭐⭐     | ⭐⭐⭐     | ⭐⭐ | 复杂     | 高       | 事件驱动 | 活跃 |

---

### 9. 选择指南

| 场景                      | 推荐库                                       |
| ------------------------- | -------------------------------------------- |
| **小规模 WebSocket-only** | `reconnecting-websocket`                     |
| **需要心跳检测**          | `websocket-heartbeat-js` 或 `best-websocket` |
| **React 应用**            | `react-use-websocket`                        |
| **需要状态管理**          | `easy-websocket-client` 或自建               |
| **需要完整事件**          | `best-websocket`                             |
| **高并发**                | `opossum`                                    |

---

### 10. 资源链接

- **reconnecting-websocket**: https://github.com/pladaria/reconnecting-websocket
- **websocket-heartbeat-js**: https://github.com/Nebulous/websocket-heartbeat-js
- **best-websocket**: https://github.com/mroderikbest/websocket
- **easy-websocket-client**: https://github.com/easy-websocket-client
- **react-use-websocket**: https://github.com/david-chen/react-use-websocket
- **oposum**: https://github.com/nodeshift/opossum
- **WebSocket RFC 6455**: https://datatracker.ietf.org/doc/html/rfc6455.html

---

## 相关文档

- [架构文档](./架构文档.md) - OpenClaw 整体架构
- [安全配置详解](./安全配置详解.md) - OpenClaw 安全机制
- [环境变量参考](./环境变量参考.md) - 配置项说明
