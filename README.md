# WhatsApp 客服聊天 Web 项目（客户列表版）

该前端用于对接你现有的 Spring Boot webhook 处理服务，重点支持：

- 左侧显示「有消息的客户列表」
- 点击客户后显示对应聊天记录（含 AI 自动回复）
- 展示 24 小时会话窗口状态
- 在窗口内发送人工回复

## 后端接口约定（建议）

> 你已经在 `WhatsAppWebhookServiceImpl` 里做了首次 AI 自动回复逻辑。前端只负责读取这些结果并展示。

### 1) 获取客户列表

`GET /api/chat/customers`

返回示例：

```json
[
  {
    "customerId": "8613800138000",
    "customerName": "张三",
    "lastMessage": "你好",
    "lastTimestamp": "2026-01-01T10:00:00Z",
    "unreadCount": 2,
    "within24h": true,
    "lastCustomerMessageTime": "2026-01-01T09:59:00Z"
  }
]
```

### 2) 获取某个客户聊天记录

`GET /api/chat/messages?customerId=8613800138000`

返回示例（可含 AI 自动回复）：

```json
[
  {
    "id": "m1",
    "direction": "inbound",
    "content": "你们营业时间？",
    "timestamp": "2026-01-01T10:00:00Z"
  },
  {
    "id": "m2",
    "direction": "outbound",
    "source": "ai",
    "content": "您好，我们是9:00-18:00",
    "timestamp": "2026-01-01T10:00:02Z"
  }
]
```

### 3) 人工回复

`POST /api/chat/reply`

```json
{
  "customerId": "8613800138000",
  "content": "您好，我来继续跟进您的问题"
}
```

### 4) 可选：已读标记

`POST /api/chat/read`

```json
{
  "customerId": "8613800138000"
}
```

## 在 VS Code 启动


> ⚠️ 请不要直接双击 `index.html`（`file://` 打开）。
> 浏览器会把页面视为 `null` origin，可能拦截脚本并报 CORS 错误。请使用本地 HTTP 服务访问。

```bash
python3 -m http.server 5173
```

浏览器访问：

```text
http://localhost:5173
```

## 与你当前 Spring Boot 的对接建议

- webhook 接收后，把 inbound 与 AI outbound 都持久化（同一会话维度）。
- `/api/chat/customers` 聚合每个客户最后一条消息与未读数。
- `within24h` 建议以后端为准（根据最后 inbound 时间计算）。
- 允许 `http://localhost:5173` 跨域访问。
