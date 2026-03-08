const STORAGE_KEYS = {
  apiBaseUrl: 'aitmk.apiBaseUrl',
  replyFrom: 'aitmk.replyFrom',
};

const DEFAULTS = {
  apiBaseUrl: 'https://crm.wondermindedu.com:6153',
  replyFrom: '1019964791197772',
};

const customerListEl = document.getElementById('customer-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('messageInput');
const messageList = document.getElementById('message-list');
const chatTitle = document.getElementById('chat-title');
const windowText = document.getElementById('conversation-window');
const statusText = document.getElementById('connection-status');
const sendBtn = document.getElementById('send-btn');

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const authStatusEl = document.getElementById('auth-status');

const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const replyFromInput = document.getElementById('replyFrom');
const openApiSettingsBtn = document.getElementById('open-api-settings');
const openFromSettingsBtn = document.getElementById('open-from-settings');

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
  customersPollTimer: null,
  messagesPollTimer: null,
  lastCustomerSnapshot: [],
  customersCache: [],
  messagesCache: new Map(),
  auth: {
    loggedIn: false,
    username: '',
    agentRowId: '',
  },
  ws: {
    client: null,
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
  setLoggedOutState('未登录');
}

function bindEvents() {
  loginForm.addEventListener('submit', onLogin);
  logoutBtn.addEventListener('click', onLogout);
  messageForm.addEventListener('submit', onSendMessage);

  openApiSettingsBtn.addEventListener('click', () => openSettingsModal('apiBaseUrl'));
  openFromSettingsBtn.addEventListener('click', () => openSettingsModal('replyFrom'));
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
    const agentRowId = result.agentRowId || result.agentId || result.rowId || result.data?.agentRowId;

    if (!agentRowId) {
      throw new Error('登录成功但未返回 agentRowId');
    }

    state.auth = { loggedIn: true, username, agentRowId: String(agentRowId) };
    authStatusEl.textContent = `已登录：${username}（${agentRowId}）`;
    logoutBtn.disabled = false;

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
  stopPolling();

  state.currentCustomerId = '';
  state.seenMessageIds = new Set();
  state.customersCache = [];
  state.messagesCache.clear();
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
  sendBtn.disabled = true;
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

  startPolling();
  statusText.textContent = `同步完成：${customers.length} 个客户`;
}

function startPolling() {
  stopPolling();
  state.customersPollTimer = setInterval(loadCustomers, 5000);
  state.messagesPollTimer = setInterval(loadMessages, 4000);
}

function stopPolling() {
  if (state.customersPollTimer) clearInterval(state.customersPollTimer);
  if (state.messagesPollTimer) clearInterval(state.messagesPollTimer);
  state.customersPollTimer = null;
  state.messagesPollTimer = null;
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

function setFileProtocolWarning() {
  sendBtn.disabled = true;
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
    const customers = await fetchCustomers();
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
      const over24h = isOver24Hours(item);

      li.dataset.customerId = customerId;
      li.querySelector('.name').textContent = name;
      li.querySelector('.preview').textContent = preview;
      li.querySelector('.time').textContent = time;

      if (over24h) li.classList.add('over-24h');

      const badge = li.querySelector('.badge');
      if (unread > 0) {
        badge.classList.add('show');
        badge.textContent = unread > 99 ? '99+' : String(unread);
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
  const lastCustomerTime = customer.lastCustomerMessageTime || customer.lastMessageAt;
  const over24h = isOver24Hours(customer);

  if (over24h) {
    windowText.className = 'muted warning';
    windowText.textContent = `会话超过24小时（最后客户消息：${formatTime(lastCustomerTime)}）`; 
    return;
  }

  windowText.className = 'muted';
  windowText.textContent = '24小时会话窗口内，可发送人工消息';
}

function updateSendAvailability(customer) {
  if (!state.auth.loggedIn || !state.currentCustomerId || !customer) {
    sendBtn.disabled = true;
    return;
  }

  sendBtn.disabled = isOver24Hours(customer);
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

function isOver24Hours(customer) {
  if (customer.within24h === false) return true;
  if (customer.within24h === true) return false;

  const ts = customer.lastCustomerMessageTime || customer.lastMessageAt || customer.lastTimestamp;
  if (!ts) return false;

  const last = new Date(ts);
  if (Number.isNaN(last.getTime())) return false;

  return Date.now() - last.getTime() > 24 * 60 * 60 * 1000;
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

  if (!window.StompJs || !window.SockJS || !state.auth.agentRowId) {
    statusText.textContent = 'WebSocket 依赖加载失败，已使用轮询兜底';
    return;
  }

  const socketUrl = `${getApiBaseUrl()}/ws`;

  const client = new window.StompJs.Client({
    webSocketFactory: () => new window.SockJS(socketUrl),
    reconnectDelay: 5000,
    onConnect: () => {
      state.ws.connected = true;
      statusText.textContent = 'WebSocket 已连接';

      client.subscribe(`/topic/agent/${state.auth.agentRowId}`, (frame) => {
        handleWsMessage(frame.body);
      });
    },
    onStompError: () => {
      state.ws.connected = false;
      statusText.textContent = 'WebSocket 连接异常，已使用轮询';
    },
    onWebSocketClose: () => {
      state.ws.connected = false;
    },
  });

  state.ws.client = client;
  client.activate();
}

function disconnectWebSocket() {
  if (state.ws.client) {
    state.ws.client.deactivate();
  }
  state.ws = { client: null, connected: false };
}

function handleWsMessage(payload) {
  try {
    const data = JSON.parse(payload);
    const type = data.type;
    const customerId = data.customerPhone || data.customerId;

    if (type === 'history' && Array.isArray(data.messages)) {
      const normalized = normalizeMessages(data.messages);
      if (customerId) {
        state.messagesCache.set(customerId, normalized);
      }

      if (customerId === state.currentCustomerId) {
        state.seenMessageIds = new Set();
        messageList.innerHTML = '';
        renderMessages(normalized);
      }

      loadCustomers(true);
      return;
    }

    if (type === 'new_message') {
      loadCustomers();
      if (customerId === state.currentCustomerId) {
        loadMessages();
      }
    }
  } catch (error) {
    console.warn('invalid ws payload', error);
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

async function fetchCustomers() {
  const url = `${getApiBaseUrl()}/api/chat/customers`;
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
