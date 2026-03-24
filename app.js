const STORAGE_KEYS = {
  apiBaseUrl: 'aitmk.apiBaseUrl',
  replyFrom: 'aitmk.replyFrom',
};

const DEFAULTS = {
  apiBaseUrl: 'https://crm.wondermindedu.com:6153',
  replyFrom: '1019964791197772',
};

const MEDIA_RULES = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    exts: ['.jpg', '.jpeg', '.png'],
    mimes: ['image/jpeg', 'image/png'],
    hint: '支持 jpg/jpeg/png，最大 5MB',
  },
  audio: {
    maxBytes: 16 * 1024 * 1024,
    exts: ['.aac', '.amr', '.mp3', '.m4a', '.ogg'],
    mimes: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
    hint: '支持 aac/amr/mp3/m4a/ogg，最大 16MB',
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    exts: ['.3gp', '.mp4'],
    mimes: ['video/3gpp', 'video/mp4'],
    hint: '支持 3gp/mp4，最大 16MB',
  },
  document: {
    maxBytes: 100 * 1024 * 1024,
    exts: ['.txt', '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx', '.pdf'],
    mimes: [
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/pdf',
    ],
    hint: '支持 txt/xls/xlsx/doc/docx/ppt/pptx/pdf，最大 100MB',
  },
};

const customerListEl = document.getElementById('customer-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('messageInput');
const messageList = document.getElementById('message-list');
const chatTitle = document.getElementById('chat-title');
const windowText = document.getElementById('conversation-window');
const statusText = document.getElementById('connection-status');
const sendBtn = document.getElementById('send-btn');
const mediaForm = document.getElementById('media-form');
const mediaTypeInput = document.getElementById('mediaType');
const mediaFileInput = document.getElementById('mediaFile');
const mediaCaptionInput = document.getElementById('mediaCaption');
const sendMediaBtn = document.getElementById('send-media-btn');
const mediaRuleHint = document.getElementById('media-rule-hint');

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authStatusEl = document.getElementById('auth-status');

const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const replyFromInput = document.getElementById('replyFrom');
const openApiSettingsBtn = document.getElementById('open-api-settings');
const openFromSettingsBtn = document.getElementById('open-from-settings');
const openApiSettingsInlineBtn = document.getElementById('open-api-settings-inline');
const openFromSettingsInlineBtn = document.getElementById('open-from-settings-inline');
const logoutInlineBtn = document.getElementById('logout-inline');

const settingsModal = document.getElementById('settings-modal');
const modalTitle = document.getElementById('modal-title');
const modalLabel = document.getElementById('modal-label');
const modalInput = document.getElementById('modal-input');
const modalSaveBtn = document.getElementById('modal-save');
const modalCancelBtn = document.getElementById('modal-cancel');

const customerTemplate = document.getElementById('customer-item-template');
const messageTemplate = document.getElementById('message-template');

const state = {
  currentCustomerId: '',
  seenMessageIds: new Set(),
  lastCustomerSnapshot: [],
  customersCache: [],
  messagesCache: new Map(),
  wsUnreadCounts: new Map(),
  wsDedupSet: new Set(),
  auth: {
    loggedIn: false,
    username: '',
    agentRowId: '',
  },
  ws: {
    client: null,
    nativeSocket: null,
    reconnectTimer: null,
    connected: false,
  },
  modalKey: '',
};

init();

function init() {
  initSettings();

  if (window.location.protocol === 'file:') {
    setFileProtocolWarning();
    return;
  }

  bindEvents();
  syncMediaFileAcceptByType();
  setLoggedOutState('未登录');
}

function bindEvents() {
  loginForm.addEventListener('submit', onLogin);
  logoutBtn.addEventListener('click', onLogout);
  messageForm.addEventListener('submit', onSendMessage);
  mediaForm.addEventListener('submit', onSendMedia);
  mediaTypeInput.addEventListener('change', syncMediaFileAcceptByType);

  openApiSettingsBtn.addEventListener('click', () => openSettingsModal('apiBaseUrl'));
  openFromSettingsBtn.addEventListener('click', () => openSettingsModal('replyFrom'));
  openApiSettingsInlineBtn?.addEventListener('click', () => openSettingsModal('apiBaseUrl'));
  openFromSettingsInlineBtn?.addEventListener('click', () => openSettingsModal('replyFrom'));
  logoutInlineBtn?.addEventListener('click', onLogout);
  modalCancelBtn.addEventListener('click', closeSettingsModal);
  modalSaveBtn.addEventListener('click', saveSettingsModal);
  settingsModal.addEventListener('click', (event) => {
    if (event.target === settingsModal) closeSettingsModal();
  });
}

function initSettings() {
  apiBaseUrlInput.value = localStorage.getItem(STORAGE_KEYS.apiBaseUrl) || DEFAULTS.apiBaseUrl;
  replyFromInput.value = localStorage.getItem(STORAGE_KEYS.replyFrom) || DEFAULTS.replyFrom;
}

async function onLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '').trim();

  if (!username || !password) return;

  loginBtn.disabled = true;
  authStatusEl.textContent = '登录中...';

  try {
    const result = await login(username, password);
    const agentRowId = result.accountRowId || result.agentRowId || result.agentId || result.rowId || result.data?.accountRowId || result.data?.agentRowId;

    if (!agentRowId) {
      throw new Error('登录成功但未返回 agentRowId');
    }

    state.auth = { loggedIn: true, username, agentRowId: String(agentRowId) };
    authStatusEl.textContent = `已登录：${username}（${agentRowId}）`;
    logoutBtn.disabled = false;
    if (logoutInlineBtn) logoutInlineBtn.disabled = false;

    await syncAllHistory();
    connectWebSocket();
  } catch (error) {
    setLoggedOutState(`登录失败：${error.message}`);
  } finally {
    loginBtn.disabled = false;
  }
}

async function onLogout() {
  try {
    await logout(state.auth.agentRowId);
  } catch (error) {
    console.warn('logout failed', error);
  }

  disconnectWebSocket();

  state.currentCustomerId = '';
  state.seenMessageIds = new Set();
  state.customersCache = [];
  state.messagesCache.clear();
  state.wsUnreadCounts.clear();
  state.wsDedupSet.clear();
  messageList.innerHTML = '';
  customerListEl.innerHTML = '';
  chatTitle.textContent = '未选择客户';
  windowText.textContent = '请先登录并选择客户';
  statusText.textContent = '等待连接';

  setLoggedOutState('已登出');
}

function setLoggedOutState(text) {
  state.auth = { loggedIn: false, username: '', agentRowId: '' };
  authStatusEl.textContent = text;
  logoutBtn.disabled = true;
  if (logoutInlineBtn) logoutInlineBtn.disabled = true;
  sendBtn.disabled = true;
  sendMediaBtn.disabled = true;
}

async function syncAllHistory() {
  statusText.textContent = '登录成功，正在同步全部会话...';
  await loadCustomers(true);

  const customers = state.customersCache;
  for (const customer of customers) {
    const customerId = customer.customerId || customer.from || customer.waId;
    if (!customerId) continue;

    try {
      const messages = await fetchMessages(customerId);
      state.messagesCache.set(customerId, normalizeMessages(messages));
    } catch (error) {
      console.warn(`prefetch messages failed for ${customerId}`, error);
    }
  }

  statusText.textContent = `同步完成：${customers.length} 个客户`;
}

async function onSendMessage(event) {
  event.preventDefault();
  const content = messageInput.value.trim();
  const from = replyFromInput.value.trim();

  if (!state.auth.loggedIn) {
    statusText.textContent = '请先登录';
    return;
  }

  if (!state.currentCustomerId || !content || sendBtn.disabled) return;

  if (!from) {
    statusText.textContent = '请先设置业务号码';
    return;
  }

  sendBtn.disabled = true;
  statusText.textContent = '发送中...';

  try {
    await sendMessage(from, state.currentCustomerId, content);
    messageInput.value = '';
    await loadMessages();
    await loadCustomers();
    statusText.textContent = '发送成功';
  } catch (error) {
    statusText.textContent = buildNetworkError('发送失败', error);
  } finally {
    updateSendAvailability(getCustomerById(state.currentCustomerId));
  }
}

async function onSendMedia(event) {
  event.preventDefault();
  const from = replyFromInput.value.trim();
  const file = mediaFileInput.files?.[0];
  const mediaType = mediaTypeInput.value;
  const caption = mediaCaptionInput.value.trim();

  if (!state.auth.loggedIn) {
    statusText.textContent = '请先登录';
    return;
  }

  if (!state.currentCustomerId || sendMediaBtn.disabled) return;

  if (!from) {
    statusText.textContent = '请先设置业务号码';
    return;
  }

  if (!file) {
    statusText.textContent = '请先选择要发送的附件';
    return;
  }

  const mediaValidation = validateMediaFile(mediaType, file);
  if (!mediaValidation.ok) {
    statusText.textContent = mediaValidation.message;
    return;
  }

  sendMediaBtn.disabled = true;
  statusText.textContent = '附件上传中...';

  try {
    const uploadResult = await uploadMedia(from, mediaType, file);
    const mediaId = uploadResult.mediaId || uploadResult.data?.mediaId;

    if (!mediaId) {
      throw new Error('上传成功但未返回 mediaId');
    }

    statusText.textContent = '附件发送中...';
    await sendMediaMessage({
      from,
      customerId: state.currentCustomerId,
      mediaType,
      mediaId,
      filename: uploadResult.filename || file.name,
      caption,
    });

    mediaForm.reset();
    mediaTypeInput.value = mediaType;
    await loadMessages();
    await loadCustomers();
    statusText.textContent = '附件发送成功';
  } catch (error) {
    statusText.textContent = buildNetworkError('附件发送失败', error);
  } finally {
    updateSendAvailability(getCustomerById(state.currentCustomerId));
  }
}


function syncMediaFileAcceptByType() {
  const rule = MEDIA_RULES[mediaTypeInput.value] || MEDIA_RULES.image;
  mediaFileInput.accept = rule.exts.join(',');
  mediaRuleHint.textContent = `支持格式：${rule.hint}`;
}

function validateMediaFile(mediaType, file) {
  const rule = MEDIA_RULES[mediaType];
  if (!rule) {
    return { ok: false, message: '不支持的附件类型' };
  }

  const name = String(file.name || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const mime = String(file.type || '').toLowerCase();

  const extAllowed = rule.exts.includes(ext);
  const mimeAllowed = !mime || rule.mimes.includes(mime);

  if (!extAllowed || !mimeAllowed) {
    return { ok: false, message: `文件格式不支持：${rule.hint}` };
  }

  if (file.size > rule.maxBytes) {
    return { ok: false, message: `文件过大：${rule.hint}` };
  }

  return { ok: true };
}

function setFileProtocolWarning() {
  sendBtn.disabled = true;
  sendMediaBtn.disabled = true;
  statusText.textContent = '检测到 file:// 打开方式，请改用本地 HTTP 地址访问（如 http://localhost:5173）';
  windowText.className = 'muted warning';
  windowText.textContent = 'file:// 场景会触发浏览器同源限制，无法调用后端 API';

  const empty = document.createElement('li');
  empty.className = 'muted';
  empty.textContent = '请先启动本地 HTTP 服务（如 python3 / npx http-server / Live Server）';
  customerListEl.innerHTML = '';
  customerListEl.appendChild(empty);
}

function getApiBaseUrl() {
  return apiBaseUrlInput.value.trim().replace(/\/$/, '');
}

function openSettingsModal(key) {
  state.modalKey = key;
  settingsModal.classList.remove('hidden');

  if (key === 'apiBaseUrl') {
    modalTitle.textContent = 'Spring Boot 服务地址';
    modalLabel.textContent = '请输入服务地址';
    modalInput.value = apiBaseUrlInput.value;
    modalInput.placeholder = DEFAULTS.apiBaseUrl;
    return;
  }

  modalTitle.textContent = '业务号码设置';
  modalLabel.textContent = '请输入业务号码ID（from）';
  modalInput.value = replyFromInput.value;
  modalInput.placeholder = DEFAULTS.replyFrom;
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
  state.modalKey = '';
}

function saveSettingsModal() {
  const value = modalInput.value.trim();
  if (!state.modalKey || !value) return;

  if (state.modalKey === 'apiBaseUrl') {
    apiBaseUrlInput.value = value;
    localStorage.setItem(STORAGE_KEYS.apiBaseUrl, value);
  } else {
    replyFromInput.value = value;
    localStorage.setItem(STORAGE_KEYS.replyFrom, value);
  }

  closeSettingsModal();
}

async function loadCustomers(forceRender = false) {
  if (!state.auth.loggedIn) return;

  try {
    const customers = await fetchServingCustomers(state.auth.agentRowId);
    state.customersCache = customers;

    const snapshot = JSON.stringify(customers);
    const changed = JSON.stringify(state.lastCustomerSnapshot) !== snapshot;

    if (changed || forceRender) {
      renderCustomers(customers);
      state.lastCustomerSnapshot = customers;
    }

    statusText.textContent = `客户列表同步：${new Date().toLocaleTimeString()}`;
  } catch (error) {
    statusText.textContent = buildNetworkError('客户列表同步失败', error);
  }
}

function renderCustomers(customers) {
  customerListEl.innerHTML = '';

  if (!Array.isArray(customers) || customers.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = '暂无客户消息';
    customerListEl.appendChild(empty);
    return;
  }

  customers
    .sort((a, b) => new Date(b.lastMessageAt || b.lastTimestamp || 0) - new Date(a.lastMessageAt || a.lastTimestamp || 0))
    .forEach((item) => {
      const li = customerTemplate.content.firstElementChild.cloneNode(true);
      const customerId = item.customerId || item.from || item.waId;
      const name = item.customerName || item.name || customerId;
      const preview = item.lastMessage || item.message || '（无最近消息）';
      const time = formatTime(item.lastMessageAt || item.lastTimestamp || item.timestamp);
      const unread = Number(item.unreadCount || 0);
      const wsUnread = Number(state.wsUnreadCounts.get(customerId) || 0);
      const unreadTotal = wsUnread > 0 ? wsUnread : unread;
      const over24h = isOver24Hours(item);

      li.dataset.customerId = customerId;
      li.querySelector('.name').textContent = name;
      li.querySelector('.preview').textContent = preview;
      li.querySelector('.time').textContent = time;

      if (over24h) li.classList.add('over-24h');
      if (!canCustomerReply(item)) li.classList.add('readonly');

      const badge = li.querySelector('.badge');
      if (unreadTotal > 0) {
        badge.classList.add('show');
        badge.classList.toggle('ws-unread', wsUnread > 0);
        badge.textContent = wsUnread > 0 ? '' : (unreadTotal > 99 ? '99+' : String(unreadTotal));
      }

      if (customerId === state.currentCustomerId) li.classList.add('active');

      li.addEventListener('click', () => selectCustomer(item));
      li.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCustomer(item);
        }
      });

      customerListEl.appendChild(li);
    });
}

async function selectCustomer(customer) {
  const customerId = customer.customerId || customer.from || customer.waId;
  state.currentCustomerId = customerId;
  state.wsUnreadCounts.delete(customerId);
  renderCustomers(state.customersCache);
  state.seenMessageIds = new Set();
  messageList.innerHTML = '';

  chatTitle.textContent = `客户：${customer.customerName || customer.name || customerId}`;
  updateWindowHint(customer);
  updateSendAvailability(customer);

  await loadMessages();
  await markRead(customerId);
  await loadCustomers();
}

function updateWindowHint(customer) {
  const serviceStatus = customer.serviceStatus || '未知状态';

  if (!canCustomerReply(customer)) {
    windowText.className = 'muted warning';
    if (serviceStatus === '已关闭') {
      windowText.textContent = '当前会话状态：已关闭（可查看历史，不可人工回复）';
      return;
    }

    windowText.textContent = `当前会话状态：${serviceStatus}（由服务端规则判定为不可回复）`;
    return;
  }

  windowText.className = 'muted';
  windowText.textContent = `当前会话状态：${serviceStatus}（可人工回复）`;
}

function updateSendAvailability(customer) {
  if (!state.auth.loggedIn || !state.currentCustomerId || !customer) {
    sendBtn.disabled = true;
    sendMediaBtn.disabled = true;
    return;
  }

  const disabled = !canCustomerReply(customer);
  sendBtn.disabled = disabled;
  sendMediaBtn.disabled = disabled;
}

async function loadMessages() {
  if (!state.auth.loggedIn || !state.currentCustomerId) return;

  try {
    const messages = await fetchMessages(state.currentCustomerId);
    const normalized = normalizeMessages(messages);
    state.messagesCache.set(state.currentCustomerId, normalized);
    renderMessages(normalized);
    statusText.textContent = `消息同步：${new Date().toLocaleTimeString()}`;
  } catch (error) {
    statusText.textContent = buildNetworkError('消息同步失败', error);
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages.map((item) => {
    const sender = String(item.sender || '').toLowerCase();
    return {
      id: item.id,
      sender,
      direction: sender === 'customer' ? 'inbound' : 'outbound',
      source: sender === 'ai' ? 'ai' : 'manual',
      content: item.message || item.content || item.text || '',
      timestamp: item.timestamp,
    };
  });
}

function renderMessages(messages) {
  if (!Array.isArray(messages)) return;

  messages
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))
    .forEach((item) => {
      const id = item.id || `${item.sender}-${item.timestamp}-${item.content}`;
      if (state.seenMessageIds.has(id)) return;
      state.seenMessageIds.add(id);

      const li = messageTemplate.content.firstElementChild.cloneNode(true);
      li.classList.toggle('outbound', item.direction === 'outbound');
      li.classList.toggle('auto-reply', item.source === 'ai');

      li.querySelector('.meta').textContent = `${labelByMessage(item)} · ${formatTime(item.timestamp)}`;
      li.querySelector('.content').textContent = item.content || '';
      messageList.appendChild(li);
    });

  messageList.scrollTop = messageList.scrollHeight;
}

function labelByMessage(item) {
  if (item.sender === 'customer') return '客户';
  if (item.sender === 'ai') return 'AI自动回复';
  return '人工客服';
}

function canCustomerReply(customer) {
  if (customer?.canReply === false) return false;
  if (customer?.serviceStatus === '已关闭') return false;
  if (customer?.within24h === false) return false;
  return true;
}

function isOver24Hours(customer) {
  return customer?.within24h === false;
}

function getCustomerById(customerId) {
  return state.customersCache.find((item) => {
    const id = item.customerId || item.from || item.waId;
    return id === customerId;
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

function buildNetworkError(prefix, error) {
  if (window.location.protocol === 'file:') {
    return `${prefix}：请使用 http://localhost:5173 访问前端，不要用 file://`;
  }

  if (error instanceof TypeError) {
    return `${prefix}：网络/CORS 异常，请检查后端是否配置 Access-Control-Allow-Origin（例如 http://localhost:5173）`;
  }

  return `${prefix}：${error.message}`;
}

function connectWebSocket() {
  disconnectWebSocket();
  statusText.textContent = 'WebSocket 连接中...';

  if (!state.auth.agentRowId) {
    statusText.textContent = '缺少 agentRowId，无法建立 WebSocket';
    return;
  }

  // 优先使用全局 StompJs + SockJS（若页面自行注入）
  if (window.StompJs && window.SockJS) {
    connectWithExternalLibraries();
    return;
  }

  // 无外部依赖时，使用内置 WebSocket + STOMP 直连
  connectWithNativeWebSocket();
}

function connectWithExternalLibraries() {
  const socketUrl = `${getApiBaseUrl()}/ws`;
  const client = new window.StompJs.Client({
    webSocketFactory: () => new window.SockJS(socketUrl),
    reconnectDelay: 5000,
    onConnect: () => {
      state.ws.connected = true;
      statusText.textContent = 'WebSocket 已连接';
      client.subscribe(`/topic/agent/${state.auth.agentRowId}`, (frame) => handleWsMessage(frame.body));
      notifyWsReconnected();
    },
    onStompError: () => {
      state.ws.connected = false;
      statusText.textContent = 'WebSocket 连接异常，请检查服务';
    },
    onWebSocketClose: () => {
      state.ws.connected = false;
      scheduleWsReconnect();
    },
  });

  state.ws.client = client;
  client.activate();
}

function connectWithNativeWebSocket() {
  const endpoints = [buildWsUrl('/ws'), buildWsUrl('/ws/websocket')];
  tryNativeEndpoints(endpoints, 0);
}

function tryNativeEndpoints(endpoints, index) {
  if (index >= endpoints.length) {
    state.ws.connected = false;
    statusText.textContent = 'WebSocket 连接失败，请检查 /ws 端点';
    scheduleWsReconnect();
    return;
  }

  const wsUrl = endpoints[index];
  let opened = false;
  const socket = new WebSocket(wsUrl);
  state.ws.nativeSocket = socket;

  socket.onopen = () => {
    opened = true;
    const connectFrame = `CONNECT
accept-version:1.2
host:${window.location.host}
heart-beat:0,0

\u0000`;
    socket.send(connectFrame);
  };

  socket.onmessage = (event) => {
    const frame = parseStompFrame(event.data);
    if (!frame) return;

    if (frame.command === 'CONNECTED') {
      state.ws.connected = true;
      statusText.textContent = 'WebSocket 已连接';
      const subscribeFrame = `SUBSCRIBE
id:sub-0
destination:/topic/agent/${state.auth.agentRowId}

\u0000`;
      socket.send(subscribeFrame);
      notifyWsReconnected();
      return;
    }

    if (frame.command === 'MESSAGE') {
      handleWsMessage(frame.body || '');
      return;
    }

    if (frame.command === 'ERROR') {
      console.warn('STOMP error frame', frame.body);
      statusText.textContent = 'WebSocket STOMP 错误，正在重连';
      socket.close();
    }
  };

  socket.onclose = () => {
    state.ws.connected = false;
    if (!opened) {
      tryNativeEndpoints(endpoints, index + 1);
      return;
    }
    scheduleWsReconnect();
  };

  socket.onerror = () => {
    if (!opened) return;
    statusText.textContent = 'WebSocket 连接异常，正在重连';
  };
}

function scheduleWsReconnect() {
  if (!state.auth.loggedIn) return;
  clearTimeout(state.ws.reconnectTimer);
  state.ws.reconnectTimer = setTimeout(() => connectWebSocket(), 2000);
}

function buildWsUrl(path) {
  const baseUrl = getApiBaseUrl();
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = path;
  url.search = '';
  return url.toString();
}

function parseStompFrame(rawData) {
  const text = String(rawData || '').replace(/\u0000+$/g, '');
  if (!text.trim()) return null;

  const [head, ...bodyParts] = text.split('\n\n');
  const lines = head.split('\n');
  const command = lines.shift();
  const headers = {};

  lines.forEach((line) => {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx)] = line.slice(idx + 1);
  });

  return { command, headers, body: bodyParts.join('\n\n') };
}


function disconnectWebSocket() {
  clearTimeout(state.ws.reconnectTimer);

  if (state.ws.client) {
    state.ws.client.deactivate();
  }

  if (state.ws.nativeSocket) {
    try {
      state.ws.nativeSocket.close();
    } catch (error) {
      console.warn('native ws close failed', error);
    }
  }

  state.ws = { client: null, nativeSocket: null, reconnectTimer: null, connected: false };
}

function handleWsMessage(payload) {
  try {
    const data = JSON.parse(payload);
    const type = data.type;
    const customerId = data.customerPhone || data.customerId;

    if (!customerId) return;

    if (type === 'history' && Array.isArray(data.messages)) {
      const normalized = normalizeMessages(data.messages);
      state.messagesCache.set(customerId, dedupeMessages(normalized));

      if (customerId === state.currentCustomerId) {
        state.seenMessageIds = new Set();
        messageList.innerHTML = '';
        renderMessages(state.messagesCache.get(customerId));
      } else {
        markCustomerWsUnread(customerId);
      }

      loadCustomers(true);
      return;
    }

    if (type === 'new_message' && Array.isArray(data.messages)) {
      const incoming = normalizeMessages(data.messages);
      const merged = mergeIncomingMessages(customerId, incoming);
      state.messagesCache.set(customerId, merged);

      if (customerId === state.currentCustomerId) {
        renderMessages(incoming);
      } else {
        markCustomerWsUnread(customerId);
      }

      loadCustomers();
    }
  } catch (error) {
    console.warn('invalid ws payload', error);
  }
}

function markCustomerWsUnread(customerId) {
  const current = Number(state.wsUnreadCounts.get(customerId) || 0);
  state.wsUnreadCounts.set(customerId, current + 1);
}

function mergeIncomingMessages(customerId, incomingMessages) {
  const existing = state.messagesCache.get(customerId) || [];
  return dedupeMessages([...existing, ...incomingMessages]);
}

function dedupeMessages(messages) {
  const seen = new Set();
  return messages.filter((item) => {
    const key = `${item.sender}-${item.timestamp}-${item.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function notifyWsReconnected() {
  try {
    await fetch(`${getApiBaseUrl()}/api/agent/ws/reconnected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ agentRowId: state.auth.agentRowId }),
    });
  } catch (error) {
    console.warn('ws reconnected notify failed', error);
  }
}

async function login(username, password) {
  const url = `${getApiBaseUrl()}/api/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function logout(agentRowId) {
  if (!agentRowId) return;
  const url = `${getApiBaseUrl()}/api/auth/logout`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ agentRowId }),
  });
}

async function fetchServingCustomers(agentRowId) {
  const url = `${getApiBaseUrl()}/api/chat/customers/serving?agentRowId=${encodeURIComponent(agentRowId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchMessages(customerId) {
  const url = `${getApiBaseUrl()}/api/chat/messages?customerId=${encodeURIComponent(customerId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function sendMessage(from, customerId, content) {
  const url = `${getApiBaseUrl()}/api/chat/reply`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ from, customerId, message: content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

async function uploadMedia(from, mediaType, file) {
  const url = `${getApiBaseUrl()}/api/chat/media/upload`;
  const formData = new FormData();
  formData.append('from', from);
  formData.append('mediaType', mediaType);
  formData.append('file', file);

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return body;
}

async function sendMediaMessage(payload) {
  const url = `${getApiBaseUrl()}/api/chat/reply/media`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return body;
}

async function markRead(customerId) {
  const url = `${getApiBaseUrl()}/api/chat/read`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    });
  } catch (error) {
    console.warn('markRead failed', error);
  }
}
