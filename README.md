# AITMK 客服系统 Web 前端

## 项目文档

- [产品设计文档](docs/产品设计文档.md)
- [技术设计文档](docs/技术设计文档.md)
- [项目情况汇报](docs/项目情况汇报.md)
- [系统操作手册](docs/系统操作手册.md)

基于当前服务端实现，本前端已支持：

1. 坐席登录 / 登出（`/api/auth/login`、`/api/auth/logout`）
2. 登录后同步当前坐席服务客户列表与历史聊天记录
3. 登录后通过 WebSocket 实时更新（不再使用轮询同步）
4. 会话是否可回复由服务端字段判定（如 `canReply` / `within24h` / `serviceStatus`）
5. Spring Boot 地址弹窗设置（默认：`https://crm.wondermindedu.com:6153`）
6. 业务号码弹窗设置（默认：`1019964791197772`）
7. 客户列表置顶并按最新消息倒序显示
8. 支持本地附件上传并发送多媒体消息（image/video/audio/document）

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


> 前端不再自行计算 24 小时窗口；仅根据服务端返回的 `canReply` / `within24h` / `serviceStatus` 控制是否可回复。

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


### 上传媒体文件

`POST /api/chat/media/upload`（`multipart/form-data`）

字段：
- `from`：业务号码 ID
- `mediaType`：`image` / `video` / `audio` / `document`
- `file`：本地文件

成功示例：

```json
{
  "success": true,
  "mediaId": "1234567890",
  "filename": "brochure.pdf",
  "mediaType": "document"
}
```

### 人工发送媒体消息

`POST /api/chat/reply/media`

```json
{
  "from": "1019964791197772",
  "customerId": "628118189951",
  "mediaType": "document",
  "mediaId": "1234567890",
  "filename": "brochure.pdf",
  "caption": "课程资料请查收"
}
```

> 规则：后端会校验 24 小时窗口，且 `mediaId` 与 `mediaUrl` 至少提供一个。前端“上传并发送附件”采用先上传获取 `mediaId`，再调用 `/reply/media`。


### 前端上传格式限制（已内置校验）

发送附件前，前端会根据“附件类型”校验文件扩展名/MIME/大小：

- `image`：`.jpg/.jpeg/.png`，`image/jpeg`、`image/png`，最大 **5MB**。
- `audio`：`.aac/.amr/.mp3/.m4a/.ogg`，`audio/aac`、`audio/amr`、`audio/mpeg`、`audio/mp4`、`audio/ogg`，最大 **16MB**。
- `video`：`.3gp/.mp4`，`video/3gpp`、`video/mp4`，最大 **16MB**。
- `document`：`.txt/.xls/.xlsx/.doc/.docx/.ppt/.pptx/.pdf`，对应 Office/PDF/TXT MIME，最大 **100MB**。

> 说明：
> - `.webp` 贴图发送不在当前“附件发送”范围内（当前仅 image/video/audio/document 四类）。
> - 浏览器可能出现 `file.type` 为空的情况，前端会以扩展名作为兜底校验。

### WebSocket

- 握手端点：`/ws`
- 订阅主题：`/topic/agent/{agentRowId}`
- 消息类型：`history` / `new_message`

> 说明：前端优先尝试 `/ws`，失败后回退 `/ws/websocket`。连接成功后会自动订阅 `/topic/agent/{agentRowId}` 并调用 `/api/agent/ws/reconnected`。


### WebSocket 重连补发

`POST /api/agent/ws/reconnected`

```json
{
  "agentRowId": "abc123"
}
```

前端在 STOMP 连接成功并完成订阅后会自动调用该接口，拉取服务端失败缓存消息。

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

---

## 部署到服务器（生产建议）

本项目是静态前端（`index.html` + `app.js` + `styles.css`），推荐通过 **Nginx** 托管。

### 1）上传前端文件

将以下文件上传到服务器目录（示例：`/var/www/aitmk-customer`）：

- `index.html`
- `app.js`
- `styles.css`

### 2）Nginx 配置示例

新建站点配置（示例：`/etc/nginx/conf.d/aitmk-customer.conf`）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/aitmk-customer;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 可选：静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

访问：`http://your-domain.com`

> 如需 HTTPS，建议配合 Certbot 申请证书后启用 443。

---

## 启动服务说明

### 方式 A：使用 Nginx（推荐生产）

```bash
sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl status nginx
```

### 方式 B：使用 Node 静态服务（适合测试/小规模）

#### 前台启动

```bash
npx http-server -p 5173
```

#### 后台常驻（systemd）

创建 `/etc/systemd/system/aitmk-customer.service`：

```ini
[Unit]
Description=AITMK Customer Static Web
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/aitmk-customer
ExecStart=/usr/bin/npx http-server -p 5173
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

生效并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable aitmk-customer
sudo systemctl start aitmk-customer
sudo systemctl status aitmk-customer
```

---

## 部署后首次检查清单

1. 页面可访问（HTTP 200）。
2. 在页面“服务地址设置”中确认 Spring Boot 地址（默认：`https://crm.wondermindedu.com:6153`）。
3. 后端 CORS 已放行前端域名。
4. 登录后可看到客户列表，并能收到 WebSocket 实时消息。
