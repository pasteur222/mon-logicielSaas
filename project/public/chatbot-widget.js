/**
 * Web Chatbot Widget for External Sites
 * This file creates a floating chat widget that can be embedded on any website
 *
 * Usage:
 * <script
 *   src="https://your-domain.com/chatbot-widget.js"
 *   data-user-id="your-user-id"
 *   data-api-url="https://your-supabase-url.supabase.co/functions/v1"
 *   data-api-key="your-anon-key"
 *   data-title="Customer Support"
 *   data-color="#3B82F6"
 *   data-position="bottom-right"
 * ></script>
 */

(function() {
  'use strict';

  // Get the script tag and extract data attributes
  const scriptTag = document.currentScript || document.querySelector('script[src*="chatbot-widget"]');

  if (!scriptTag) {
    console.error('[CHATBOT-WIDGET] Script tag not found');
    return;
  }

  const config = {
    userId: scriptTag.getAttribute('data-user-id'),
    apiUrl: scriptTag.getAttribute('data-api-url'),
    apiKey: scriptTag.getAttribute('data-api-key'),
    title: scriptTag.getAttribute('data-title') || 'Chat Support',
    color: scriptTag.getAttribute('data-color') || '#3B82F6',
    position: scriptTag.getAttribute('data-position') || 'bottom-right',
    greeting: scriptTag.getAttribute('data-greeting') || 'Bonjour! Comment puis-je vous aider?',
    placeholder: scriptTag.getAttribute('data-placeholder') || 'Tapez votre message...',
    buttonText: scriptTag.getAttribute('data-button-text') || 'Envoyer',
    poweredByText: scriptTag.getAttribute('data-powered-by') || 'Powered by Airtel GPT'
  };

  // Validate required configuration
  if (!config.userId || !config.apiUrl || !config.apiKey) {
    console.error('[CHATBOT-WIDGET] Missing required configuration:', {
      hasUserId: !!config.userId,
      hasApiUrl: !!config.apiUrl,
      hasApiKey: !!config.apiKey
    });
    return;
  }

  // Generate unique session ID
  const sessionId = 'web_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const webUserId = 'guest_' + Math.random().toString(36).substr(2, 9);

  // Retry configuration
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;
  const REQUEST_TIMEOUT = 30000;

  // Message queue for offline support
  let messageQueue = [];
  let isOnline = navigator.onLine;

  // Chat state
  let isOpen = false;
  let isLoading = false;
  let conversationHistory = [];

  // Create shadow DOM for style isolation
  const shadowHost = document.createElement('div');
  shadowHost.id = 'chatbot-widget-host';
  document.body.appendChild(shadowHost);

  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // Inject styles
  const styles = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .chatbot-container {
      position: fixed;
      ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      ${config.position.includes('top') ? 'top: 20px;' : 'bottom: 20px;'}
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    .chatbot-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${config.color};
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      position: relative;
    }

    .chatbot-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .chatbot-button:active {
      transform: scale(0.95);
    }

    .chatbot-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    .chatbot-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #EF4444;
      color: white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      border: 2px solid white;
    }

    .chatbot-window {
      display: none;
      flex-direction: column;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 600px;
      max-height: calc(100vh - 100px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      overflow: hidden;
      margin-bottom: 10px;
    }

    .chatbot-window.open {
      display: flex;
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .chatbot-header {
      background: ${config.color};
      color: white;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .chatbot-header-title {
      font-size: 16px;
      font-weight: 600;
    }

    .chatbot-header-subtitle {
      font-size: 12px;
      opacity: 0.9;
      margin-top: 2px;
    }

    .chatbot-close {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .chatbot-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      background: #F9FAFB;
    }

    .chatbot-message {
      display: flex;
      margin-bottom: 16px;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .chatbot-message.user {
      justify-content: flex-end;
    }

    .chatbot-message-content {
      max-width: 75%;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .chatbot-message.bot .chatbot-message-content {
      background: white;
      color: #1F2937;
      border: 1px solid #E5E7EB;
    }

    .chatbot-message.user .chatbot-message-content {
      background: ${config.color};
      color: white;
    }

    .chatbot-message-time {
      font-size: 11px;
      opacity: 0.6;
      margin-top: 4px;
    }

    .chatbot-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      max-width: 70px;
    }

    .chatbot-typing-dot {
      width: 8px;
      height: 8px;
      background: #9CA3AF;
      border-radius: 50%;
      animation: typing 1.4s infinite;
    }

    .chatbot-typing-dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .chatbot-typing-dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing {
      0%, 60%, 100% {
        transform: translateY(0);
      }
      30% {
        transform: translateY(-8px);
      }
    }

    .chatbot-input-area {
      padding: 16px 20px;
      border-top: 1px solid #E5E7EB;
      background: white;
    }

    .chatbot-input-container {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .chatbot-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #E5E7EB;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .chatbot-input:focus {
      border-color: ${config.color};
    }

    .chatbot-input:disabled {
      background: #F3F4F6;
      cursor: not-allowed;
    }

    .chatbot-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: ${config.color};
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s, transform 0.1s;
    }

    .chatbot-send:hover:not(:disabled) {
      opacity: 0.9;
    }

    .chatbot-send:active:not(:disabled) {
      transform: scale(0.95);
    }

    .chatbot-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .chatbot-send svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .chatbot-powered {
      text-align: center;
      font-size: 11px;
      color: #9CA3AF;
      padding-top: 8px;
    }

    .chatbot-error {
      padding: 12px 16px;
      background: #FEE2E2;
      border: 1px solid #FECACA;
      border-radius: 8px;
      color: #991B1B;
      font-size: 13px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chatbot-retry {
      background: #EF4444;
      color: white;
      border: none;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      margin-left: auto;
    }

    @media (max-width: 480px) {
      .chatbot-window {
        width: calc(100vw - 20px);
        height: calc(100vh - 80px);
        border-radius: 12px;
      }
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  shadowRoot.appendChild(styleSheet);

  // Create HTML structure
  const container = document.createElement('div');
  container.className = 'chatbot-container';
  container.innerHTML = `
    <div class="chatbot-window" id="chatbot-window">
      <div class="chatbot-header">
        <div>
          <div class="chatbot-header-title">${escapeHtml(config.title)}</div>
          <div class="chatbot-header-subtitle">En ligne</div>
        </div>
        <button class="chatbot-close" id="chatbot-close">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="chatbot-messages" id="chatbot-messages">
        <div class="chatbot-message bot">
          <div class="chatbot-message-content">${escapeHtml(config.greeting)}</div>
        </div>
      </div>
      <div class="chatbot-input-area">
        <div class="chatbot-input-container">
          <input
            type="text"
            class="chatbot-input"
            id="chatbot-input"
            placeholder="${escapeHtml(config.placeholder)}"
            maxlength="1000"
          />
          <button class="chatbot-send" id="chatbot-send">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        <div class="chatbot-powered">${escapeHtml(config.poweredByText)}</div>
      </div>
    </div>
    <button class="chatbot-button" id="chatbot-button">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
      </svg>
      <span class="chatbot-badge" id="chatbot-badge" style="display: none;">1</span>
    </button>
  `;

  shadowRoot.appendChild(container);

  // Get elements
  const chatWindow = shadowRoot.getElementById('chatbot-window');
  const chatButton = shadowRoot.getElementById('chatbot-button');
  const closeButton = shadowRoot.getElementById('chatbot-close');
  const messagesContainer = shadowRoot.getElementById('chatbot-messages');
  const inputField = shadowRoot.getElementById('chatbot-input');
  const sendButton = shadowRoot.getElementById('chatbot-send');
  const badge = shadowRoot.getElementById('chatbot-badge');

  // Helper functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function addMessage(content, sender = 'bot') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chatbot-message ${sender}`;

    const time = formatTime(new Date());
    messageDiv.innerHTML = `
      <div class="chatbot-message-content">
        ${escapeHtml(content)}
        <div class="chatbot-message-time">${time}</div>
      </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    conversationHistory.push({ content, sender, timestamp: new Date().toISOString() });
  }

  function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chatbot-message bot';
    typingDiv.id = 'chatbot-typing-indicator';
    typingDiv.innerHTML = `
      <div class="chatbot-typing">
        <div class="chatbot-typing-dot"></div>
        <div class="chatbot-typing-dot"></div>
        <div class="chatbot-typing-dot"></div>
      </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function hideTyping() {
    const typingIndicator = messagesContainer.querySelector('#chatbot-typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  function showError(message, retry = null) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'chatbot-error';
    errorDiv.innerHTML = `
      <span>⚠️ ${escapeHtml(message)}</span>
      ${retry ? '<button class="chatbot-retry">Réessayer</button>' : ''}
    `;

    if (retry) {
      const retryBtn = errorDiv.querySelector('.chatbot-retry');
      retryBtn.addEventListener('click', retry);
    }

    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 5000);
  }

  async function sendMessageWithRetry(message, retries = 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(`${config.apiUrl}/api-chatbot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.apiKey,
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          text: message,
          source: 'web',
          webUserId: webUserId,
          sessionId: sessionId,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success || !data.response) {
        throw new Error(data.error || 'Invalid response from server');
      }

      return data.response;

    } catch (error) {
      console.error(`[CHATBOT-WIDGET] Error (attempt ${retries + 1}/${MAX_RETRIES}):`, error);

      if (retries < MAX_RETRIES - 1) {
        console.log(`[CHATBOT-WIDGET] Retrying in ${RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return sendMessageWithRetry(message, retries + 1);
      }

      throw error;
    }
  }

  async function handleSendMessage() {
    const message = inputField.value.trim();

    if (!message || isLoading) {
      return;
    }

    if (!isOnline) {
      showError('Pas de connexion internet. Le message sera envoyé lorsque vous serez en ligne.');
      messageQueue.push(message);
      return;
    }

    // Add user message
    addMessage(message, 'user');
    inputField.value = '';
    inputField.disabled = true;
    sendButton.disabled = true;
    isLoading = true;

    // Show typing indicator
    showTyping();

    try {
      const response = await sendMessageWithRetry(message);
      hideTyping();
      addMessage(response, 'bot');

    } catch (error) {
      hideTyping();
      console.error('[CHATBOT-WIDGET] Failed to send message:', error);

      let errorMessage = 'Désolé, je rencontre des difficultés techniques.';
      if (error.name === 'AbortError') {
        errorMessage = 'La requête a pris trop de temps. Veuillez réessayer.';
      }

      showError(errorMessage, () => {
        inputField.value = message;
        handleSendMessage();
      });

      addMessage('Désolé, je n\'ai pas pu traiter votre message. Veuillez réessayer ou contacter notre support.', 'bot');
    } finally {
      inputField.disabled = false;
      sendButton.disabled = false;
      isLoading = false;
      inputField.focus();
    }
  }

  async function processQueuedMessages() {
    if (!isOnline || messageQueue.length === 0 || isLoading) {
      return;
    }

    while (messageQueue.length > 0) {
      const message = messageQueue.shift();
      inputField.value = message;
      await handleSendMessage();
    }
  }

  // Event listeners
  chatButton.addEventListener('click', () => {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open');
    badge.style.display = 'none';

    if (isOpen) {
      inputField.focus();
    }
  });

  closeButton.addEventListener('click', () => {
    isOpen = false;
    chatWindow.classList.remove('open');
  });

  sendButton.addEventListener('click', handleSendMessage);

  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Online/offline handling
  window.addEventListener('online', () => {
    isOnline = true;
    console.log('[CHATBOT-WIDGET] Connection restored');
    processQueuedMessages();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    console.log('[CHATBOT-WIDGET] Connection lost');
    showError('Connexion internet perdue. Les messages seront envoyés une fois reconnecté.');
  });

  // Periodically save conversation to Supabase for later retrieval
  setInterval(async () => {
    if (conversationHistory.length > 0 && isOnline) {
      try {
        await fetch(`${config.apiUrl}/api-chatbot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey
          },
          body: JSON.stringify({
            action: 'save_conversation',
            webUserId: webUserId,
            sessionId: sessionId,
            history: conversationHistory
          })
        });
      } catch (error) {
        console.error('[CHATBOT-WIDGET] Failed to save conversation:', error);
      }
    }
  }, 30000); // Save every 30 seconds

  console.log('[CHATBOT-WIDGET] Initialized successfully', {
    sessionId,
    webUserId,
    position: config.position,
    color: config.color
  });

})();
