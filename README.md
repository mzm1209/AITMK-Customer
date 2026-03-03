# WhatsApp 客服聊天 Web 项目（客户列表版）

该前端用于对接你现有的 Spring Boot webhook 处理服务，重点支持：

- 左侧显示「有消息的客户列表」
- 点击客户后显示对应聊天记录（含 AI 自动回复）
- 展示 24 小时会话窗口状态
- 在窗口内发送人工回复

## 后端接口约定（建议）

默认后端地址：`http://localhost:6153`。

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

### 方案 A：有 Python3（推荐）

```bash
python3 -m http.server 5173
```

### 方案 B：没有 Python3，用 Node.js

如果你本地有 Node.js，可以使用：

```bash
npx http-server -p 5173
```

或：

```bash
npx serve -l 5173
```

### 方案 C：VS Code Live Server 插件

- 安装扩展：**Live Server**
- 在 `index.html` 右键选择 **Open with Live Server**
- 确认访问地址是 `http://127.0.0.1:5500` 或 `http://localhost:5500`

浏览器访问：

```text
http://localhost:5173
```


### 常见报错排查

1. 浏览器控制台出现 `origin 'null'` 或 `file://...app.js` / `fetch` 报错
   - 原因：你是双击 `index.html` 打开的（`file://`）。
   - 解决：必须改为 `http://localhost:5173`（或 Live Server 提供的 `http://127.0.0.1:5500`）访问。

2. 浏览器提示 `No 'Access-Control-Allow-Origin' header`
   - 原因：Spring Boot 未放行前端来源。
   - 解决：在后端 CORS 中允许你的前端地址（例如 `http://localhost:5173`、`http://127.0.0.1:5500`）。

## 与你当前 Spring Boot 的对接建议

- webhook 接收后，把 inbound 与 AI outbound 都持久化（同一会话维度）。
- `/api/chat/customers` 聚合每个客户最后一条消息与未读数。
- `within24h` 建议以后端为准（根据最后 inbound 时间计算）。
- 允许前端实际来源跨域访问（例如 `http://localhost:5173`、`http://127.0.0.1:5500`，后端服务端口可为 `6153`）。
