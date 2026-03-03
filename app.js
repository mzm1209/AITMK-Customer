const customerListEl = document.getElementById('customer-list');
const refreshCustomersBtn = document.getElementById('refreshCustomersBtn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('messageInput');
const messageList = document.getElementById('message-list');
const chatTitle = document.getElementById('chat-title');
const windowText = document.getElementById('conversation-window');
const statusText = document.getElementById('connection-status');
const sendBtn = document.getElementById('send-btn');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');

const customerTemplate = document.getElementById('customer-item-template');
const messageTemplate = document.getElementById('message-template');

let currentCustomerId = '';
let seenMessageIds = new Set();
let customersPollTimer = null;
let messagesPollTimer = null;
let lastCustomerSnapshot = [];

init();

function init() {
  refreshCustomersBtn.addEventListener('click', () => loadCustomers(true));

  messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = messageInput.value.trim();

    if (!currentCustomerId || !content || sendBtn.disabled) {
      return;
    }

    sendBtn.disabled = true;
    statusText.textContent = '发送中...';

    try {
      await sendMessage(currentCustomerId, content);
      messageInput.value = '';
      await loadMessages();
      await loadCustomers();
      statusText.textContent = '发送成功';
    } catch (error) {
      statusText.textContent = `发送失败：${error.message}`;
    } finally {
      if (currentCustomerId) {
        sendBtn.disabled = false;
      }
    }
  });

  loadCustomers(true);
  startCustomersPolling();
}

function getApiBaseUrl() {
  return apiBaseUrlInput.value.trim().replace(/\/$/, '');
}

function startCustomersPolling() {
  if (customersPollTimer) clearInterval(customersPollTimer);
  customersPollTimer = setInterval(loadCustomers, 5000);
}

function startMessagesPolling() {
  if (messagesPollTimer) clearInterval(messagesPollTimer);
  messagesPollTimer = setInterval(loadMessages, 4000);
}

async function loadCustomers(forceRender = false) {
  try {
    const customers = await fetchCustomers();
    const snapshot = JSON.stringify(customers);
    const changed = JSON.stringify(lastCustomerSnapshot) !== snapshot;

    if (changed || forceRender) {
      renderCustomers(customers);
      lastCustomerSnapshot = customers;
    }

    statusText.textContent = `客户列表同步：${new Date().toLocaleTimeString()}`;
  } catch (error) {
    statusText.textContent = `客户列表同步失败：${error.message}`;
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
    .sort((a, b) => new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0))
    .forEach((item) => {
      const li = customerTemplate.content.firstElementChild.cloneNode(true);
      const customerId = item.customerId || item.from || item.waId;
      const name = item.customerName || item.name || customerId;
      const preview = item.lastMessage || '（无最近消息）';
      const time = formatTime(item.lastTimestamp);
      const unread = Number(item.unreadCount || 0);

      li.dataset.customerId = customerId;
      li.querySelector('.name').textContent = name;
      li.querySelector('.preview').textContent = preview;
      li.querySelector('.time').textContent = time;

      const badge = li.querySelector('.badge');
      if (unread > 0) {
        badge.classList.add('show');
        badge.textContent = unread > 99 ? '99+' : String(unread);
      }

      if (customerId === currentCustomerId) {
        li.classList.add('active');
      }

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
  currentCustomerId = customerId;
  seenMessageIds = new Set();
  messageList.innerHTML = '';

  chatTitle.textContent = `客户：${customer.customerName || customer.name || customerId}`;
  updateWindowHint(customer.within24h, customer.lastCustomerMessageTime);

  sendBtn.disabled = customer.within24h === false;
  if (sendBtn.disabled) {
    statusText.textContent = '客户最后互动超过24小时，暂不支持自由回复';
  }

  await loadMessages();
  startMessagesPolling();
  await markRead(customerId);
  await loadCustomers();
}

function updateWindowHint(within24h, lastCustomerMessageTime) {
  if (within24h === false) {
    windowText.className = 'muted warning';
    windowText.textContent = `24小时窗口外（客户最后消息：${formatTime(lastCustomerMessageTime)}）`;
  } else if (within24h === true) {
    windowText.className = 'muted';
    windowText.textContent = '24小时会话窗口内，可发送人工消息';
  } else {
    windowText.className = 'muted';
    windowText.textContent = '会话窗口状态由后端判断';
  }
}

async function loadMessages() {
  if (!currentCustomerId) return;

  try {
    const messages = await fetchMessages(currentCustomerId);
    renderMessages(messages);
    statusText.textContent = `消息同步：${new Date().toLocaleTimeString()}`;
  } catch (error) {
    statusText.textContent = `消息同步失败：${error.message}`;
  }
}

function renderMessages(messages) {
  messages
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach((item) => {
      const id = item.id || `${item.direction}-${item.timestamp}-${item.content}`;
      if (seenMessageIds.has(id)) return;
      seenMessageIds.add(id);

      const li = messageTemplate.content.firstElementChild.cloneNode(true);
      const direction = normalizeDirection(item.direction, item.senderType);
      const source = item.source || (item.aiAutoReply ? 'ai' : 'manual');

      li.classList.toggle('outbound', direction === 'outbound');
      li.classList.toggle('auto-reply', source === 'ai');

      li.querySelector('.meta').textContent = `${labelByDirection(direction, source)} · ${formatTime(item.timestamp)}`;
      li.querySelector('.content').textContent = item.content || item.text || '';
      messageList.appendChild(li);
    });

  messageList.scrollTop = messageList.scrollHeight;
}

function labelByDirection(direction, source) {
  if (direction === 'inbound') return '客户';
  if (source === 'ai') return 'AI自动回复';
  return '人工客服';
}

function normalizeDirection(direction, senderType) {
  if (direction) return String(direction).toLowerCase();
  if (senderType && String(senderType).toLowerCase() === 'customer') return 'inbound';
  return 'outbound';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
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

async function sendMessage(customerId, content) {
  const url = `${getApiBaseUrl()}/api/chat/reply`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ customerId, content }),
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
