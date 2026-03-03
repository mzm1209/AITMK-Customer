const sessionForm = document.getElementById('session-form');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('messageInput');
const messageList = document.getElementById('message-list');
const chatTitle = document.getElementById('chat-title');
const statusText = document.getElementById('connection-status');
const sendBtn = document.getElementById('send-btn');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const messageTemplate = document.getElementById('message-template');

let currentCustomerId = '';
let pollTimer = null;
let seenIds = new Set();

sessionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(sessionForm);
  const customerId = String(formData.get('customerId') || '').trim();

  if (!customerId) {
    return;
  }

  currentCustomerId = customerId;
  chatTitle.textContent = `会话：${customerId}`;
  statusText.textContent = '正在同步消息...';
  sendBtn.disabled = false;
  resetMessages();
  await loadMessages();
  startPolling();
});

messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();

  if (!currentCustomerId || !text) {
    return;
  }

  sendBtn.disabled = true;
  statusText.textContent = '发送中...';

  try {
    await sendMessage(currentCustomerId, text);
    messageInput.value = '';
    await loadMessages();
    statusText.textContent = '已发送';
  } catch (error) {
    console.error(error);
    statusText.textContent = `发送失败：${error.message}`;
  } finally {
    sendBtn.disabled = false;
  }
});

function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }

  pollTimer = setInterval(loadMessages, 5000);
}

function resetMessages() {
  messageList.innerHTML = '';
  seenIds = new Set();
}

async function loadMessages() {
  if (!currentCustomerId) {
    return;
  }

  try {
    const messages = await fetchMessages(currentCustomerId);
    renderMessages(messages);
    statusText.textContent = `最后同步：${new Date().toLocaleTimeString()}`;
  } catch (error) {
    console.error(error);
    statusText.textContent = `同步失败：${error.message}`;
  }
}

function renderMessages(messages) {
  messages
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach((item) => {
      const id = item.id || `${item.direction}-${item.timestamp}-${item.content}`;
      if (seenIds.has(id)) {
        return;
      }

      seenIds.add(id);
      const li = messageTemplate.content.firstElementChild.cloneNode(true);
      li.classList.toggle('outbound', item.direction === 'outbound');
      li.querySelector('.meta').textContent = `${item.direction === 'outbound' ? '客服' : '客户'} · ${formatTime(item.timestamp)}`;
      li.querySelector('.content').textContent = item.content;
      messageList.appendChild(li);
    });

  messageList.scrollTop = messageList.scrollHeight;
}

function formatTime(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function getApiBaseUrl() {
  return apiBaseUrlInput.value.trim().replace(/\/$/, '');
}

async function fetchMessages(customerId) {
  const url = `${getApiBaseUrl()}/api/chat/messages?customerId=${encodeURIComponent(customerId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function sendMessage(customerId, content) {
  const url = `${getApiBaseUrl()}/api/chat/reply`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ customerId, content }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json().catch(() => ({}));
}
