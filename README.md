# AITMK 客服系统 Web 前端

基于当前服务端实现，本前端已支持：

1. 坐席登录 / 登出（`/api/auth/login`、`/api/auth/logout`）
2. 登录后同步当前坐席服务客户列表与历史聊天记录
3. 登录后通过 WebSocket 实时更新（不再使用轮询同步）
4. 24 小时规则：超时会话列表灰色显示，可查看历史，但禁用人工回复
5. Spring Boot 地址弹窗设置（默认：`https://crm.wondermindedu.com:6153`）
6. 业务号码弹窗设置（默认：`1019964791197772`）
7. 客户列表置顶并按最新消息倒序显示

---

## 接口约定（与当前后端一致）

### 登录

`POST /api/auth/login`

```json
{
  "username": "agent1",
  "password": "123456"
}
```

### 登出

`POST /api/auth/logout`

```json
{
  "agentRowId": "A0001"
}
```

### 当前坐席服务客户列表

`GET /api/chat/customers/serving?agentRowId=...`

```json
[
  {
    "customerId": "628118189951",
    "lastMessage": "...",
    "lastMessageAt": "2026-03-04T07:59:52.733640637Z",
    "serviceStatus": "服务中",
    "canReply": true
  }
]
```


> 会话状态为 `已关闭` 或超出24小时时，前端展示只读样式，允许查看历史消息但禁用人工回复。

### 消息历史

`GET /api/chat/messages?customerId=...`

```json
[
  {
    "customerId": "628118189951",
    "sender": "customer",
    "message": "how much",
    "timestamp": "2026-03-04T07:58:46.688514086Z"
  },
  {
    "customerId": "628118189951",
    "sender": "ai",
    "message": "...",
    "timestamp": "2026-03-04T07:59:15.577327430Z"
  }
]
```

### 人工回复

`POST /api/chat/reply`

```json
{
  "from": "1019964791197772",
  "customerId": "628118189951",
  "message": "您好，我来继续跟进您的问题"
}
```

### WebSocket

- 握手端点：`/ws`
- 订阅主题：`/topic/agent/{agentRowId}`
- 消息类型：`history` / `new_message`

> 说明：前端内置了原生 WebSocket(STOMP) 直连能力（默认尝试 `/ws/websocket`），不再强依赖第三方 CDN 脚本。若页面额外注入 SockJS/STOMP，也会优先使用该方式连接。

---

## 本地运行

> ⚠️ 不要双击 `index.html` 用 `file://` 打开。

### Python3

```bash
python3 -m http.server 5173
```

### Node.js

```bash
npx http-server -p 5173
```

浏览器访问：`http://localhost:5173`

---

## CORS 配置建议

后端需放行前端来源，例如：

- `http://localhost:5173`
- `http://127.0.0.1:5500`
