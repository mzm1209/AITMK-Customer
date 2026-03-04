# WhatsApp 客服聊天 Web 项目（客户列表版）

该前端用于对接你现有的 Spring Boot webhook 服务，支持：

- 左侧显示客户列表
- 点击客户查看消息记录
- 识别 `sender=customer / ai / agent` 并按客户、AI、人工客服展示
- 发送人工回复

## 当前默认后端地址

页面默认值已设置为：`https://crm.wondermindedu.com:6153`。

你也可以在页面左侧输入框手动改成其它地址。

## 后端接口返回结构（按你提供的数据）

### 1) 客户列表

`GET /api/chat/customers`

```json
[
  {
    "customerId": "628118189951",
    "lastMessage": "I understand you're looking for our school locations...",
    "lastMessageAt": "2026-03-04T07:59:52.733640637Z"
  }
]
```

前端已按 `lastMessageAt` 排序和显示时间。

### 2) 消息记录

`GET /api/chat/messages?customerId=628118189951`

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

前端已按 `message` 字段显示内容，并根据 `sender` 自动标记：

- `customer` -> 客户
- `ai` -> AI自动回复
- 其它（如 `agent`）-> 人工客服

### 3) 发送回复

`POST /api/chat/reply`

```json
{
  "customerId": "628118189951",
  "content": "您好，我来继续跟进您的问题"
}
```

> `POST /api/chat/read` 仍为可选接口，若后端没有该接口，前端会忽略失败。

## 在 VS Code 启动

> ⚠️ 不要双击 `index.html` 用 `file://` 打开，否则会触发 CORS/同源限制。

### 方案 A：Python3

```bash
python3 -m http.server 5173
```

### 方案 B：没有 Python3，用 Node.js

```bash
npx http-server -p 5173
```

或：

```bash
npx serve -l 5173
```

### 方案 C：VS Code Live Server

- 安装扩展 **Live Server**
- 右键 `index.html` -> **Open with Live Server**

浏览器访问（示例）：

- `http://localhost:5173`
- 或 Live Server 的地址（如 `http://127.0.0.1:5500`）

## CORS 建议

后端需允许前端实际来源，例如：

- `http://localhost:5173`
- `http://127.0.0.1:5500`
