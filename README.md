# WhatsApp 客服聊天 Web 项目

这是一个可在 VS Code 中直接运行的轻量 Web 前端，用于对接你已完成的 Spring Boot WhatsApp webhook 服务，实现：

- 输入客户号码进入会话
- 拉取客户消息
- 发送回复消息给客户

## 1. 对接后端接口约定

前端默认调用 `http://localhost:8080`，你可以在页面上修改后端地址。

需要后端提供：

1. `GET /api/chat/messages?customerId=xxx`
   - 返回 JSON 数组，例如：
   ```json
   [
     {
       "id": "msg-1",
       "direction": "inbound",
       "content": "你好",
       "timestamp": "2026-01-01T10:00:00Z"
     },
     {
       "id": "msg-2",
       "direction": "outbound",
       "content": "您好，请问有什么可以帮您？",
       "timestamp": "2026-01-01T10:00:05Z"
     }
   ]
   ```

2. `POST /api/chat/reply`
   - 请求体：
   ```json
   {
     "customerId": "8613800138000",
     "content": "您好，我来为您处理"
   }
   ```

## 2. 在 VS Code 中启动

项目是纯静态页面，无需安装依赖。

```bash
python3 -m http.server 5173
```

浏览器打开：

```text
http://localhost:5173
```

## 3. 你可能要在 Spring Boot 里补充

- 开启 CORS（允许来自 `http://localhost:5173` 的跨域请求）
- 将 webhook 收到的消息落库（或缓存）并提供查询接口
- 将客服回复接口与 WhatsApp 发送消息 API 对接
