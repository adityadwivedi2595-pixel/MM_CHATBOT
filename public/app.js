/**
 * ZENITH ASSISTANT — Client-Side Application Logic
 * Full Multimodal AI Interface (Text, Vision, Voice, Documents)
 */

(function () {
  'use strict';

  // Storage Keys
  const STORAGE_KEYS = {
    CONVERSATIONS: 'mm_chatbot_conversations_v1',
    ACTIVE_CHAT_ID: 'mm_chatbot_active_id_v1',
    SETTINGS: 'mm_chatbot_settings_v1',
    THEME: 'mm_chatbot_theme_v1'
  };
  const GENERATED_IMAGE_DB = 'mm_chatbot_generated_images_v1';
  const GENERATED_IMAGE_STORE = 'images';

  // Base API URL: when launched directly via file:/// protocol, proxy to localhost:3000
  const API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';

  // State
  let conversations = [];
  let currentChatId = null;
  let pendingAttachments = []; // Array of { name, mimeType, size, data (base64) }
  let isGenerating = false;
  let imageGenerationMode = false;
  let serverHasApiKey = null;
  let abortController = null;
  let activeAudioUtterance = null;
  let availableVoices = [];

  // Audio recording state
  let audioStream = null;
  let audioContext = null;
  let audioAnalyser = null;
  let speechRecognition = null;
  let isRecordingVoice = false;
  let waveformAnimId = null;
  let recordingStartTime = 0;
  let recordingTimerInterval = null;
  let silenceAutoSendTimer = null;
  const SILENCE_AUTO_SEND_DELAY = 1600; // 1.6s pause after speaking triggers automatic send
  let hasDetectedSpeechInSession = false;

  // Camera state
  let cameraStream = null;

  // Default Settings
  const defaultSettings = {
    apiKey: '',
    model: 'gemini-3.6-flash',
    systemPromptPreset: 'general',
    customSystemPrompt: '',
    temperature: 0.7,
    autoTTS: false,
    ttsVoice: '',
    ttsPitch: 1.0,
    ttsRate: 1.0
  };

  let settings = { ...defaultSettings };

  // System Persona Prompts
  const SYSTEM_PERSONAS = {
    general: 'You are Zenith Assistant, a world-class multimodal AI assistant. You perceive images, understand documents, listen to spoken queries, and write pristine code. Be articulate, helpful, and concise.',
    coder: 'You are an elite Senior Staff Software Engineer and Full-Stack Architect. Analyze code snippets, UI screenshots, and diagrams with strict technical rigor. Provide clear explanations and clean, modular code.',
    analyst: 'You are a Senior Multimodal Data & Research Analyst. When examining documents or visuals, extract key figures, format them into neat markdown tables, and highlight actionable insights.',
    creative: 'You are an imaginative Creative Director and Visual Storyteller. Provide rich, vibrant descriptions of images, concepts, and ideas with poetic yet sharp narrative craft.',
    concise: 'You are an ultra-fast Executive Assistant. Deliver bulleted, high-signal answers with zero fluff. Direct and immediately actionable.',
    custom: ''
  };

  // DOM Elements
  const elements = {
    // Layout & Navigation
    sidebar: document.getElementById('sidebar'),
    openSidebarBtn: document.getElementById('openSidebarBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatHistoryList: document.getElementById('chatHistoryList'),
    clearAllChatsBtn: document.getElementById('clearAllChatsBtn'),
    currentChatTitle: document.getElementById('currentChatTitle'),
    activeModelBadge: document.getElementById('activeModelBadge'),
    modelSelect: document.getElementById('modelSelect'),
    ttsToggleBtn: document.getElementById('ttsToggleBtn'),
    ttsIcon: document.getElementById('ttsIcon'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeMenu: document.getElementById('themeMenu'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    exportChatBtn: document.getElementById('exportChatBtn'),
    capabilitiesBar: document.getElementById('capabilitiesBar'),
    apiKeyStatusCard: document.getElementById('apiKeyStatusCard'),
    apiKeyStatusLabel: document.getElementById('apiKeyStatusLabel'),
    apiKeySubText: document.getElementById('apiKeySubText'),
    quickKeyBtn: document.getElementById('quickKeyBtn'),

    // Chat Feed
    messagesContainer: document.getElementById('messagesContainer'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    messagesList: document.getElementById('messagesList'),
    scrollToBottomBtn: document.getElementById('scrollToBottomBtn'),

    // Voice Waveform
    voiceWaveformContainer: document.getElementById('voiceWaveformContainer'),
    waveformCanvas: document.getElementById('waveformCanvas'),
    recordingTimer: document.getElementById('recordingTimer'),
    recordingStatusText: document.getElementById('recordingStatusText'),
    cancelVoiceBtn: document.getElementById('cancelVoiceBtn'),
    stopVoiceBtn: document.getElementById('stopVoiceBtn'),

    // Attachments & Input
    attachmentRibbon: document.getElementById('attachmentRibbon'),
    attachmentChipsContainer: document.getElementById('attachmentChipsContainer'),
    clearAllAttachmentsBtn: document.getElementById('clearAllAttachmentsBtn'),
    fileInput: document.getElementById('fileInput'),
    imageOnlyInput: document.getElementById('imageOnlyInput'),
    attachFileBtn: document.getElementById('attachFileBtn'),
    attachMenuWrapper: document.getElementById('attachMenuWrapper'),
    attachMenuDropdown: document.getElementById('attachMenuDropdown'),
    menuTakePhotoBtn: document.getElementById('menuTakePhotoBtn'),
    menuUploadImageBtn: document.getElementById('menuUploadImageBtn'),
    menuAttachFileBtn: document.getElementById('menuAttachFileBtn'),
    cameraBtn: document.getElementById('cameraBtn'),
    micBtn: document.getElementById('micBtn'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    stopGenerationBtn: document.getElementById('stopGenerationBtn'),
    floatingStopBtn: document.getElementById('floatingStopBtn'),
    stopControlWrapper: document.getElementById('stopControlWrapper'),
    dragDropOverlay: document.getElementById('dragDropOverlay'),

    // Camera Modal (Universal Device & Mobile Compatible)
    cameraModal: document.getElementById('cameraModal'),
    cameraVideo: document.getElementById('cameraVideo'),
    cameraCanvas: document.getElementById('cameraCanvas'),
    cameraSnapshotPreview: document.getElementById('cameraSnapshotPreview'),
    cameraFallbackBanner: document.getElementById('cameraFallbackBanner'),
    cameraFallbackText: document.getElementById('cameraFallbackText'),
    cameraUploadFallbackBtn: document.getElementById('cameraUploadFallbackBtn'),
    cameraLiveControls: document.getElementById('cameraLiveControls'),
    cameraPreviewControls: document.getElementById('cameraPreviewControls'),
    captureSnapshotBtn: document.getElementById('captureSnapshotBtn'),
    flipCameraBtn: document.getElementById('flipCameraBtn'),
    flipCameraBtnMobile: document.getElementById('flipCameraBtnMobile'),
    confirmSnapshotBtn: document.getElementById('confirmSnapshotBtn'),
    retakeSnapshotBtn: document.getElementById('retakeSnapshotBtn'),
    discardSnapshotBtn: document.getElementById('discardSnapshotBtn'),
    cancelCameraBtn: document.getElementById('cancelCameraBtn'),
    closeCameraModalBtn: document.getElementById('closeCameraModalBtn'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    testApiKeyBtn: document.getElementById('testApiKeyBtn'),
    apiKeyTestFeedback: document.getElementById('apiKeyTestFeedback'),
    systemPromptSelect: document.getElementById('systemPromptSelect'),
    customSystemPrompt: document.getElementById('customSystemPrompt'),
    temperatureSlider: document.getElementById('temperatureSlider'),
    tempValueDisplay: document.getElementById('tempValueDisplay'),
    ttsVoiceSelect: document.getElementById('ttsVoiceSelect'),
    pitchSlider: document.getElementById('pitchSlider'),
    pitchDisplay: document.getElementById('pitchDisplay'),
    rateSlider: document.getElementById('rateSlider'),
    rateDisplay: document.getElementById('rateDisplay'),
    testVoiceBtn: document.getElementById('testVoiceBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),

    // Lightbox
    imageLightboxModal: document.getElementById('imageLightboxModal'),
    lightboxImage: document.getElementById('lightboxImage'),
    closeLightboxBtn: document.getElementById('closeLightboxBtn')
  };

  /* ==========================================================================
     Initialization
     ========================================================================== */
  function init() {
    loadSettings();
    loadTheme();
    loadConversations();
    setupMarkdown();
    setupSpeechRecognition();
    populateVoiceList();
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populateVoiceList;
    }
    bindEvents();
    checkServerConfig();
  }

  // Configure marked with highlight.js
  function setupMarkdown() {
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        breaks: true,
        gfm: true,
        highlight: function (code, lang) {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(code, { language: lang }).value;
            } catch (__) {}
          }
          if (typeof hljs !== 'undefined') {
            try {
              return hljs.highlightAuto(code).value;
            } catch (__) {}
          }
          return code;
        }
      });
    }
  }

  // Load Settings from LocalStorage
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        settings = { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      settings = { ...defaultSettings };
    }

    // Restore Gemini model choices after the temporary OpenAI provider change.
    let migratedSettings = false;
    if (!['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'].includes(settings.model)) {
      settings.model = 'gemini-3.6-flash';
      migratedSettings = true;
    }
    if (/^sk-/i.test(settings.apiKey || '')) {
      settings.apiKey = '';
      migratedSettings = true;
    }
    if (migratedSettings) {
      try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); } catch (e) {}
    }

    // Apply to UI controls
    elements.modelSelect.value = settings.model || 'gemini-3.6-flash';
    elements.activeModelBadge.textContent = elements.modelSelect.options[elements.modelSelect.selectedIndex]?.text || settings.model;
    elements.apiKeyInput.value = settings.apiKey || '';
    elements.systemPromptSelect.value = settings.systemPromptPreset || 'general';
    elements.customSystemPrompt.value = settings.customSystemPrompt || '';
    elements.customSystemPrompt.style.display = settings.systemPromptPreset === 'custom' ? 'block' : 'none';
    elements.temperatureSlider.value = settings.temperature;
    elements.tempValueDisplay.textContent = settings.temperature;
    elements.pitchSlider.value = settings.ttsPitch;
    elements.pitchDisplay.textContent = settings.ttsPitch;
    elements.rateSlider.value = settings.ttsRate;
    elements.rateDisplay.textContent = settings.ttsRate;

    updateTTSButtonState();
    updateApiKeyStatusBadge();
  }

  function saveSettings() {
    settings.apiKey = elements.apiKeyInput.value.trim();
    settings.model = elements.modelSelect.value;
    settings.systemPromptPreset = elements.systemPromptSelect.value;
    settings.customSystemPrompt = elements.customSystemPrompt.value.trim();
    settings.temperature = parseFloat(elements.temperatureSlider.value) || 0.7;
    settings.ttsVoice = elements.ttsVoiceSelect.value;
    settings.ttsPitch = parseFloat(elements.pitchSlider.value) || 1.0;
    settings.ttsRate = parseFloat(elements.rateSlider.value) || 1.0;

    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    elements.activeModelBadge.textContent = elements.modelSelect.options[elements.modelSelect.selectedIndex]?.text || settings.model;
    updateApiKeyStatusBadge();
    closeModal(elements.settingsModal);
  }

  function loadTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'theme-obsidian';
    applyTheme(savedTheme);
  }

  function applyTheme(themeClass) {
    document.body.className = themeClass;
    localStorage.setItem(STORAGE_KEYS.THEME, themeClass);
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === themeClass);
    });
  }

  // Verify server configuration
  async function checkServerConfig() {
    try {
      const res = await fetch(API_BASE + '/api/config');
      if (res.ok) {
        const data = await res.json();
        serverHasApiKey = Boolean(data.hasServerKey);
        if (data.models && Array.isArray(data.models) && data.models.length > 0) {
          const currentVal = elements.modelSelect.value || settings.model;
          elements.modelSelect.innerHTML = '';
          data.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (m.id === currentVal || (!elements.modelSelect.querySelector('option[selected]') && m.isDefault)) {
              opt.selected = true;
            }
            elements.modelSelect.appendChild(opt);
          });
          if (elements.modelSelect.selectedIndex >= 0) {
            elements.activeModelBadge.textContent = elements.modelSelect.options[elements.modelSelect.selectedIndex]?.text || elements.modelSelect.value;
          }
        }
        if (data.hasServerKey && !settings.apiKey) {
          elements.apiKeyStatusCard.classList.remove('demo-mode');
          elements.apiKeyStatusLabel.textContent = 'Server API Key';
          elements.apiKeySubText.textContent = 'Gemini API key configured';
        }
      }
    } catch (e) {
      // server offline / running client standalone
    }
  }

  function updateApiKeyStatusBadge() {
    if (settings.apiKey && settings.apiKey.trim()) {
      elements.apiKeyStatusCard.classList.remove('demo-mode');
      elements.apiKeyStatusLabel.textContent = 'Custom API Key';
      elements.apiKeySubText.textContent = 'Gemini API key detected';
    } else {
      elements.apiKeyStatusCard.classList.add('demo-mode');
      elements.apiKeyStatusLabel.textContent = 'API Key Required';
      elements.apiKeySubText.textContent = 'Add your Gemini API key';
    }
  }

  /* ==========================================================================
     Conversations Management
     ========================================================================== */
  async function loadConversations() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      conversations = saved ? JSON.parse(saved) : [];
    } catch (e) {
      conversations = [];
    }

    try {
      await Promise.all(conversations.flatMap(chat => (chat.messages || []).flatMap(message =>
        (message.generatedImages || []).map(async image => {
          if (image.id && !image.dataUrl) {
            image.dataUrl = await readGeneratedImage(image.id);
          }
        })
      )));
    } catch (error) {
      console.warn('Could not restore generated images from browser storage:', error);
    }

    currentChatId = localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT_ID);

    if (!conversations || conversations.length === 0) {
      createNewConversation(false);
    } else {
      const activeExists = conversations.some(c => c.id === currentChatId);
      if (!activeExists) {
        currentChatId = conversations[0].id;
      }
      renderConversationsList();
      renderActiveChat();
    }
  }

  function saveConversations() {
    const savedConversations = JSON.stringify(conversations, (key, value) => {
      if (key === 'dataUrl' && typeof value === 'string' && value.startsWith('data:image/')) {
        return undefined;
      }
      return value;
    });
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, savedConversations);
    } catch (storageError) {
      const lightweightConversations = JSON.stringify(conversations, (key, value) => {
        if (
          (key === 'dataUrl' || key === 'data')
          && typeof value === 'string'
          && value.startsWith('data:image/')
        ) {
          return undefined;
        }
        return value;
      });
      try {
        localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, lightweightConversations);
      } catch (retryError) {
        console.error('Could not save chat history in browser storage:', retryError);
        throw retryError;
      }
    }
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT_ID, currentChatId);
  }

  function openGeneratedImageDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('Browser image storage is unavailable.'));
        return;
      }
      const request = window.indexedDB.open(GENERATED_IMAGE_DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(GENERATED_IMAGE_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open browser image storage.'));
    });
  }

  async function storeGeneratedImage(id, dataUrl) {
    const database = await openGeneratedImageDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(GENERATED_IMAGE_STORE, 'readwrite');
      transaction.objectStore(GENERATED_IMAGE_STORE).put({ id, dataUrl });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save generated image.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving the generated image was aborted.'));
    });
  }

  async function readGeneratedImage(id) {
    const database = await openGeneratedImageDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(GENERATED_IMAGE_STORE, 'readonly')
        .objectStore(GENERATED_IMAGE_STORE)
        .get(id);
      request.onsuccess = () => resolve(request.result?.dataUrl || '');
      request.onerror = () => reject(request.error || new Error('Could not restore generated image.'));
    });
  }

  function createNewConversation(shouldSave = true) {
    const newChat = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      messages: []
    };
    conversations.unshift(newChat);
    currentChatId = newChat.id;

    if (shouldSave) {
      saveConversations();
    }
    renderConversationsList();
    renderActiveChat();

    // Close mobile sidebar if open
    if (window.innerWidth <= 768) {
      elements.sidebar.classList.remove('open');
    }
  }

  function getActiveConversation() {
    return conversations.find(c => c.id === currentChatId);
  }

  function renderConversationsList() {
    elements.chatHistoryList.innerHTML = '';
    conversations.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'history-item' + (chat.id === currentChatId ? ' active' : '');
      item.innerHTML = `
        <span class="history-item-title">${escapeHtml(chat.title)}</span>
        <button class="history-item-delete" title="Delete conversation" data-id="${chat.id}">✕</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('history-item-delete')) return;
        currentChatId = chat.id;
        saveConversations();
        renderConversationsList();
        renderActiveChat();
        if (window.innerWidth <= 768) elements.sidebar.classList.remove('open');
      });

      const delBtn = item.querySelector('.history-item-delete');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(chat.id);
      });

      elements.chatHistoryList.appendChild(item);
    });
  }

  function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    if (conversations.length === 0) {
      createNewConversation();
    } else {
      if (currentChatId === id) {
        currentChatId = conversations[0].id;
      }
      saveConversations();
      renderConversationsList();
      renderActiveChat();
    }
  }

  function clearAllConversations() {
    if (confirm('Are you sure you want to delete all conversation history?')) {
      conversations = [];
      createNewConversation();
    }
  }

  function renderActiveChat() {
    const chat = getActiveConversation();
    if (!chat) return;

    elements.currentChatTitle.textContent = chat.title;

    if (!chat.messages || chat.messages.length === 0) {
      elements.welcomeScreen.classList.remove('hidden');
      elements.messagesList.innerHTML = '';
    } else {
      elements.welcomeScreen.classList.add('hidden');
      elements.messagesList.innerHTML = '';
      chat.messages.forEach((msg, idx) => {
        appendMessageToDOM(msg, idx);
      });
      scrollToBottom();
    }
  }

  /* ==========================================================================
     Message Rendering & DOM Helpers
     ========================================================================== */
  function appendMessageToDOM(msg, index) {
    const isUser = msg.role === 'user';
    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user-row' : 'assistant-row'}`;
    row.dataset.index = index;

    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
      attachmentsHtml = '<div class="msg-attachments-grid">';
      msg.attachments.forEach(att => {
        if (att.mimeType && att.mimeType.startsWith('image/')) {
          attachmentsHtml += `<img src="${att.data}" alt="${escapeHtml(att.name)}" class="msg-attachment-img" title="Click to expand">`;
        } else {
          attachmentsHtml += `
            <div class="msg-attachment-doc">
              <span>📄</span>
              <span>${escapeHtml(att.name)}</span>
            </div>
          `;
        }
      });
      attachmentsHtml += '</div>';
    }

    let bubbleContent = '';
    if (isUser) {
      bubbleContent = `
        <div class="message-bubble-user">
          ${attachmentsHtml}
          <div>${escapeHtml(msg.content)}</div>
        </div>
      `;
    } else {
      const parsedMarkdown = renderMarkdown(msg.content || '');
      const availableImages = Array.isArray(msg.generatedImages)
        ? msg.generatedImages.filter(image => image.dataUrl)
        : [];
      const generatedImagesHtml = availableImages.length > 0
        ? `<div class="generated-image-gallery">${availableImages.map((image, imageIndex) => {
          const extension = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
          return `
            <div class="generated-image-item">
              <img src="${escapeHtml(image.dataUrl)}" alt="Generated image ${imageIndex + 1}" class="generated-image-preview" title="Click to expand">
              <a class="generated-image-download" href="${escapeHtml(image.dataUrl)}" download="zenith-assistant-image-${imageIndex + 1}.${extension}">Download image</a>
            </div>
          `;
        }).join('')}</div>`
        : '';
      bubbleContent = `
        <div class="message-bubble-assistant">
          <div class="bubble-markdown-body">${parsedMarkdown}</div>
          ${generatedImagesHtml}
        </div>
        <div class="message-actions-row">
          <button class="msg-action-btn speak-btn" title="Read Aloud" data-content="${escapeHtml(msg.content)}">
            <span>🔊</span> Speak
          </button>
          <button class="msg-action-btn copy-msg-btn" title="Copy response">
            <span>📋</span> Copy
          </button>
          <button class="msg-action-btn regenerate-btn" title="Regenerate from here">
            <span>🔄</span> Retry
          </button>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="message-avatar-wrap">
        ${isUser ? '<div class="user-avatar-placeholder">U</div>' : '<img src="assets/avatar.jpg" class="msg-avatar" alt="MM Bot">'}
      </div>
      <div class="message-content-wrap">
        <div class="message-author-header">
          <span class="message-author-name">${isUser ? 'You' : 'Zenith Assistant'}</span>
          <span class="message-timestamp">${formatTime(msg.timestamp || new Date().toISOString())}</span>
        </div>
        ${bubbleContent}
      </div>
    `;

    // Attach Lightbox click on user image attachments
    row.querySelectorAll('.msg-attachment-img').forEach(img => {
      img.addEventListener('click', () => openLightbox(img.src));
    });
    row.querySelectorAll('.generated-image-preview').forEach(img => {
      img.addEventListener('click', () => openLightbox(img.src));
    });

    // Code copy buttons inside assistant markdown
    row.querySelectorAll('.code-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const codeText = btn.closest('.code-block-wrapper').querySelector('code')?.innerText || '';
        navigator.clipboard.writeText(codeText);
        btn.innerHTML = '<span>✓</span> Copied!';
        setTimeout(() => { btn.innerHTML = '<span>📋</span> Copy'; }, 2000);
      });
    });

    // Assistant message action buttons
    const speakBtn = row.querySelector('.speak-btn');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => {
        toggleSpeechSynthesis(msg.content, speakBtn);
      });
    }

    const copyMsgBtn = row.querySelector('.copy-msg-btn');
    if (copyMsgBtn) {
      copyMsgBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(msg.content || '');
        copyMsgBtn.innerHTML = '<span>✓</span> Copied';
        setTimeout(() => { copyMsgBtn.innerHTML = '<span>📋</span> Copy'; }, 2000);
      });
    }

    const regenBtn = row.querySelector('.regenerate-btn');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        regenerateFromIndex(index);
      });
    }

    elements.messagesList.appendChild(row);
  }

  function renderMarkdown(rawText) {
    if (typeof marked !== 'undefined') {
      try {
        let html = marked.parse(rawText);
        // Wrap <pre><code> with .code-block-wrapper
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('pre').forEach(pre => {
          const wrapper = document.createElement('div');
          wrapper.className = 'code-block-wrapper';
          const codeEl = pre.querySelector('code');
          let langName = 'code';
          if (codeEl) {
            const match = codeEl.className.match(/language-(\w+)/);
            if (match) langName = match[1];
          }
          wrapper.innerHTML = `
            <div class="code-block-header">
              <span>${langName}</span>
              <button class="code-copy-btn"><span>📋</span> Copy</button>
            </div>
          `;
          pre.parentNode.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);
        });
        return tempDiv.innerHTML;
      } catch (e) {
        return escapeHtml(rawText);
      }
    }
    return escapeHtml(rawText).replace(/\n/g, '<br>');
  }

  /* ==========================================================================
     Multimodal Sending & Streaming Logic
     ========================================================================== */
  async function sendMessage() {
    if (isGenerating) return;

    const text = elements.messageInput.value.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!settings.apiKey && serverHasApiKey === false) {
      openModal(elements.settingsModal);
      elements.apiKeyTestFeedback.textContent = 'Add your Gemini API key, then save Settings to start chatting.';
      elements.apiKeyTestFeedback.classList.remove('hidden', 'success');
      elements.apiKeyTestFeedback.classList.add('error');
      elements.apiKeyInput.focus();
      return;
    }
    if (imageGenerationMode || isImageGenerationRequest(text)) {
      imageGenerationMode = false;
      await generateImage(text);
      return;
    }

    let chat = getActiveConversation();
    if (!chat) {
      createNewConversation();
      chat = getActiveConversation();
    }
    if (!chat) return;

    // Build user message
    const userMessage = {
      role: 'user',
      content: text,
      attachments: [...pendingAttachments],
      timestamp: new Date().toISOString()
    };

    // If chat title is still "New Conversation", auto-title from first message
    if (chat.title === 'New Conversation' && (text || pendingAttachments[0]?.name)) {
      chat.title = (text.slice(0, 32) || pendingAttachments[0]?.name || 'Multimodal Chat');
      elements.currentChatTitle.textContent = chat.title;
      renderConversationsList();
    }

    // Add to chat state
    chat.messages.push(userMessage);
    saveConversations();

    // Render user message to DOM
    elements.welcomeScreen.classList.add('hidden');
    appendMessageToDOM(userMessage, chat.messages.length - 1);
    scrollToBottom();

    // Reset input & attachments
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    const sentAttachments = [...pendingAttachments];
    clearPendingAttachments();

    // Prepare assistant response placeholder
    const assistantIndex = chat.messages.length;
    const assistantMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };
    chat.messages.push(assistantMessage);

    // Create live streaming row
    const streamRow = createStreamRowDOM(assistantIndex);
    const streamBody = streamRow.querySelector('.bubble-markdown-body');
    if (streamBody) {
      streamBody.innerHTML = `<em>Zenith Assistant is preparing an answer...</em>`;
    }
    elements.messagesList.appendChild(streamRow);
    scrollToBottom();

    // Toggle UI generating state
    setGeneratingState(true);

    // Call API
    abortController = new AbortController();

    try {
      const activeSystemInstruction = settings.systemPromptPreset === 'custom'
        ? settings.customSystemPrompt
        : (SYSTEM_PERSONAS[settings.systemPromptPreset] || SYSTEM_PERSONAS.general);

      // High-speed history trimming: Keep last 10 turns and omit heavy base64 data from older messages
      // This reduces payload from megabytes to kilobytes, cutting latency dramatically!
      const recentMessages = chat.messages.slice(0, -1).slice(-10);
      const cleanHistory = recentMessages
        .filter(m => {
          if (!m || !m.content) return false;
          if (m.content.includes('> ⚠️ **Request Failed:') || m.content.includes('> ⚠️ **Error:')) return false;
          return true;
        })
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      const response = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          messages: cleanHistory,
          model: elements.modelSelect.value || settings.model,
          temperature: settings.temperature,
          systemInstruction: activeSystemInstruction,
          apiKey: settings.apiKey,
          attachments: sentAttachments
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      // Stream SSE with ultra-fluid frame scheduling
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullContent = '';

      const markdownBody = streamRow.querySelector('.bubble-markdown-body');
      const cursor = streamRow.querySelector('.streaming-cursor');

      let renderScheduled = false;
      function scheduleStreamRender() {
        if (!renderScheduled) {
          renderScheduled = true;
          requestAnimationFrame(() => {
            markdownBody.innerHTML = renderMarkdown(fullContent);
            scrollToBottom();
            renderScheduled = false;
          });
        }
      }

      while (true) {
        if (!isGenerating) {
          try { await reader.cancel(); } catch (e) {}
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // save remainder

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              if (data.type === 'chunk' && data.text) {
                fullContent += data.text;
                assistantMessage.content = fullContent;
                scheduleStreamRender();
              } else if (data.type === 'error') {
                fullContent += `\n\n> ⚠️ **Error:** ${data.error}`;
                assistantMessage.content = fullContent;
                markdownBody.innerHTML = renderMarkdown(fullContent);
                scrollToBottom();
              }
            } catch (err) {
              // ignore parse errors
            }
          }
        }
      }

      // Generation finished
      if (cursor) cursor.remove();
      saveConversations();

      // Replace stream row with full final message row
      streamRow.remove();
      appendMessageToDOM(assistantMessage, assistantIndex);
      scrollToBottom();

      // Trigger Auto-TTS if enabled
      if (settings.autoTTS && fullContent) {
        speakText(fullContent);
      }

    } catch (err) {
      if (err.name === 'AbortError' || !isGenerating) {
        assistantMessage.content = (fullContent || assistantMessage.content) + ' *(Generation stopped by user)*';
      } else {
        assistantMessage.content += `\n\n> ⚠️ **Request Failed:** ${err.message}`;
      }
      saveConversations();
      streamRow.remove();
      appendMessageToDOM(assistantMessage, assistantIndex);
    } finally {
      setGeneratingState(false);
      abortController = null;
    }
  }

  function isImageGenerationRequest(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.toLowerCase().trim();

    // If asking for definition or identity without photo/image keywords, skip
    if (/^(?:who is|what is|why is|how to|where is|koun hai|kya hai|kaun hai)\b/i.test(t) && !/\b(?:photo|image|picture|pic|tasveer)\b/i.test(t)) {
      return false;
    }

    if (/^(?:draw|paint|sketch)\s+(?:a|an|me|the)?\s+/i.test(t)) return true;

    const imageNouns = '(?:image|picture|photo|photograph|illustration|artwork|wallpaper|poster|logo|thumbnail|icon|tasveer|tasvir|pic|pics|chitra|तस्वीर|तसवीर|फोटो|चित्र|छवि|इमेज)';
    const imageVerbs = '(?:generate|create|make|draw|design|paint|illustrate|render|bana(?:o|do|na|ye|de)?|bna(?:o|do|de)?|karo|kar\\s*(?:do|de)|want|need|show(?:\\s+me)?|dikha(?:o|na|ye|do|de)?|bhej(?:o|na|do|de)?|send|give|do|de(?:\\s*(?:do|de))?|chahiye|mangta|बनाओ|बना\\s*दो|बनादो|दिखाओ|भेजो|दीजिए|चाहिए)';

    if (new RegExp('^' + imageVerbs + '\\s+(?:an?\\s+)?' + imageNouns, 'i').test(t)) return true;
    if (new RegExp(imageNouns + '\\s+' + imageVerbs, 'i').test(t)) return true;
    if (new RegExp(imageVerbs + '.*' + imageNouns, 'i').test(t)) return true;
    if (new RegExp(imageNouns + '.*' + imageVerbs, 'i').test(t)) return true;
    if (new RegExp('\\bki\\s+' + imageNouns + '\\b', 'i').test(t)) return true;
    if (new RegExp('\\bka\\s+' + imageNouns + '\\b', 'i').test(t)) return true;
    if (new RegExp('\\b' + imageNouns + '\\s+(?:of|for|ki|ka)\\b', 'i').test(t)) return true;
    if (new RegExp('\\b' + imageNouns + '$', 'i').test(t)) return true;
    if (/\b(?:asli\s*(?:log(?:o|on)?|aadmi|insaan|aurat|ladki|ladka)|real\s*(?:people|person|human))\b/i.test(t)) return true;

    // Catch common typing errors such as "gemnerate the imag of ..."
    const words = t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const fuzzyCandidates = [...words];
    for (let i = 0; i < words.length - 1; i++) fuzzyCandidates.push(words[i] + words[i + 1]);
    const nearWord = (candidate, target, maxDistance) => {
      if (Math.abs(candidate.length - target.length) > maxDistance) return false;
      let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
      for (let row = 1; row <= candidate.length; row++) {
        const current = [row];
        for (let column = 1; column <= target.length; column++) {
          current[column] = Math.min(
            current[column - 1] + 1,
            previous[column] + 1,
            previous[column - 1] + (candidate[row - 1] === target[column - 1] ? 0 : 1)
          );
        }
        previous = current;
      }
      return previous[target.length] <= maxDistance;
    };
    const hasGenerateIntent = fuzzyCandidates.some(word =>
      ['generate', 'create', 'draw', 'paint', 'make'].some(target => nearWord(word, target, 2))
    );
    const hasImageSubject = fuzzyCandidates.some(word =>
      ['image', 'picture', 'photo', 'artwork'].some(target => nearWord(word, target, 1))
    );
    return hasGenerateIntent && hasImageSubject;
  }

  async function generateImage(prompt) {
    if (isGenerating) return;

    const text = prompt.trim();
    if (!text && pendingAttachments.length === 0) {
      elements.messageInput.focus();
      return;
    }

    let chat = getActiveConversation();
    if (!chat) {
      createNewConversation();
      chat = getActiveConversation();
    }
    if (!chat) return;

    const attachments = [...pendingAttachments];
    const userMessage = {
      role: 'user',
      content: text,
      attachments,
      timestamp: new Date().toISOString()
    };
    if (chat.title === 'New Conversation') {
      chat.title = text.slice(0, 32) || 'Image Generation';
      elements.currentChatTitle.textContent = chat.title;
      renderConversationsList();
    }

    chat.messages.push(userMessage);
    saveConversations();
    elements.welcomeScreen.classList.add('hidden');
    appendMessageToDOM(userMessage, chat.messages.length - 1);
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    clearPendingAttachments();

    const assistantIndex = chat.messages.length;
    const assistantMessage = {
      role: 'assistant',
      content: '',
      generatedImages: [],
      timestamp: new Date().toISOString()
    };
    chat.messages.push(assistantMessage);

    const streamRow = createStreamRowDOM(assistantIndex);
    const streamBody = streamRow.querySelector('.bubble-markdown-body');
    if (streamBody) {
      streamBody.innerHTML = `<em>Generating image for <strong>"${escapeHtml(text)}"</strong>...</em>`;
    }
    elements.messagesList.appendChild(streamRow);
    scrollToBottom();
    setGeneratingState(true);
    abortController = new AbortController();

    try {
      const response = await fetch(API_BASE + '/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: text,
          apiKey: settings.apiKey,
          attachments
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || `Server returned HTTP ${response.status}`);
      }

      assistantMessage.generatedImages = await Promise.all(data.images.map(async image => {
        const generatedImage = {
          id: `generated_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          mimeType: image.mimeType,
          dataUrl: `data:${image.mimeType};base64,${image.data}`
        };
        try {
          await storeGeneratedImage(generatedImage.id, generatedImage.dataUrl);
        } catch (storageError) {
          console.warn('Generated image could not be saved for future sessions:', storageError);
        }
        return generatedImage;
      }));
      assistantMessage.content = data.text || 'Here is your generated image.';
      if (assistantMessage.generatedImages.length === 0) {
        throw new Error('The image service returned no images. Please try a different prompt.');
      }
    } catch (err) {
      assistantMessage.content = err.name === 'AbortError'
        ? 'Image generation was stopped.'
        : `> ⚠️ **Image generation failed:** ${err.message}`;
    } finally {
      imageGenerationMode = false;
      elements.messageInput.placeholder = 'Ask anything, drag images/docs, or dictate voice...';
      streamRow.remove();
      try {
        saveConversations();
      } catch (storageError) {
        assistantMessage.content += '\n\n> ⚠️ **Storage warning:** This image is visible now, but this browser could not save the chat history.';
        console.error('Could not save generated image conversation:', storageError);
      }
      appendMessageToDOM(assistantMessage, assistantIndex);
      scrollToBottom();
      setGeneratingState(false);
      abortController = null;
    }
  }

  function createStreamRowDOM(index) {
    const row = document.createElement('div');
    row.className = 'message-row assistant-row';
    row.dataset.index = index;
    row.innerHTML = `
      <div class="message-avatar-wrap">
        <img src="assets/avatar.jpg" class="msg-avatar" alt="MM Bot">
      </div>
      <div class="message-content-wrap">
        <div class="message-author-header">
          <span class="message-author-name">Zenith Assistant</span>
          <span class="message-timestamp">${formatTime(new Date().toISOString())}</span>
        </div>
        <div class="message-bubble-assistant">
          <div class="bubble-markdown-body"></div>
          <span class="streaming-cursor"></span>
        </div>
      </div>
    `;
    return row;
  }

  function setGeneratingState(generating) {
    isGenerating = generating;
    elements.sendBtn.classList.toggle('hidden', generating);
    elements.stopGenerationBtn.classList.toggle('hidden', !generating);
    if (elements.stopControlWrapper) {
      elements.stopControlWrapper.classList.toggle('hidden', !generating);
    }
    elements.messageInput.disabled = generating;
    if (!generating) {
      elements.messageInput.focus();
    }
  }

  function stopGeneration() {
    if (!isGenerating) return;
    if (abortController) {
      abortController.abort();
    }
    isGenerating = false;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setGeneratingState(false);
  }

  function regenerateFromIndex(index) {
    const chat = getActiveConversation();
    if (!chat || index < 0 || index >= chat.messages.length) return;

    // Truncate messages to before this assistant message
    chat.messages = chat.messages.slice(0, index);
    saveConversations();
    renderActiveChat();

    // Trigger regeneration of last user message
    sendMessage();
  }

  /* ==========================================================================
     Attachment Management (Vision & Documents)
     ========================================================================== */
  function addFileAttachment(file) {
    if (!file) return;

    // Max 20MB limit per file
    if (file.size > 20 * 1024 * 1024) {
      alert(`File "${file.name}" exceeds 20MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      pendingAttachments.push({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        data: e.target.result // Base64 data URL
      });
      renderAttachmentRibbon();
    };
    reader.readAsDataURL(file);
  }

  function renderAttachmentRibbon() {
    if (pendingAttachments.length === 0) {
      elements.attachmentRibbon.classList.add('hidden');
      elements.attachmentChipsContainer.innerHTML = '';
      return;
    }

    elements.attachmentRibbon.classList.remove('hidden');
    elements.attachmentChipsContainer.innerHTML = '';

    pendingAttachments.forEach((att, idx) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';

      let thumbHtml = '<span>📄</span>';
      if (att.mimeType && att.mimeType.startsWith('image/')) {
        thumbHtml = `<img src="${att.data}" class="attachment-thumb" alt="Preview">`;
      }

      chip.innerHTML = `
        ${thumbHtml}
        <span class="attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <button class="attachment-remove" data-index="${idx}" title="Remove attachment">✕</button>
      `;

      chip.querySelector('.attachment-remove').addEventListener('click', () => {
        pendingAttachments.splice(idx, 1);
        renderAttachmentRibbon();
      });

      elements.attachmentChipsContainer.appendChild(chip);
    });
  }

  function clearPendingAttachments() {
    pendingAttachments = [];
    renderAttachmentRibbon();
  }

  /* ==========================================================================
     Camera Snapshot Capture Modal (Universal Cross-Device Compatible)
     ========================================================================== */
  let currentFacingMode = 'user'; // 'user' (front / selfie) or 'environment' (rear / world)
  let pendingSnapshotDataUrl = null;

  async function startCameraStream() {
    if (cameraStream) {
      try {
        cameraStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      cameraStream = null;
    }

    if (elements.cameraFallbackBanner) elements.cameraFallbackBanner.classList.add('hidden');
    if (elements.cameraSnapshotPreview) {
      elements.cameraSnapshotPreview.classList.add('hidden');
      elements.cameraSnapshotPreview.src = '';
    }
    if (elements.cameraLiveControls) elements.cameraLiveControls.classList.remove('hidden');
    if (elements.cameraPreviewControls) elements.cameraPreviewControls.classList.add('hidden');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraFallback('Camera access is not supported by your browser or connection. You can attach a photo from your files.');
      return;
    }

    // Progressive constraint fallback to guarantee 100% compatibility across all phones, tablets, and desktops
    const constraintAttempts = [
      { video: { facingMode: { ideal: currentFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: currentFacingMode } },
      { video: true }
    ];

    let lastError = null;
    for (const constraints of constraintAttempts) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.cameraVideo.srcObject = cameraStream;
        await elements.cameraVideo.play().catch(() => {});
        return;
      } catch (err) {
        lastError = err;
      }
    }

    const isDenied = lastError && (lastError.name === 'NotAllowedError' || lastError.name === 'PermissionDeniedError');
    showCameraFallback(
      isDenied
        ? 'Camera permission was blocked. Please enable camera access in your browser or select an image file.'
        : `Camera unavailable (${lastError?.message || 'Device in use'}). Choose a photo from your files instead.`
    );
  }

  function showCameraFallback(msg) {
    if (elements.cameraFallbackText) elements.cameraFallbackText.textContent = msg;
    if (elements.cameraFallbackBanner) elements.cameraFallbackBanner.classList.remove('hidden');
    if (elements.cameraLiveControls) elements.cameraLiveControls.classList.add('hidden');
  }

  async function openCameraModal() {
    elements.cameraModal.classList.remove('hidden');
    await startCameraStream();
  }

  function closeCameraModal() {
    if (cameraStream) {
      try {
        cameraStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      cameraStream = null;
    }
    pendingSnapshotDataUrl = null;
    if (elements.cameraSnapshotPreview) {
      elements.cameraSnapshotPreview.classList.add('hidden');
      elements.cameraSnapshotPreview.src = '';
    }
    elements.cameraModal.classList.add('hidden');
  }

  async function toggleCameraFacing() {
    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
    await startCameraStream();
  }

  function captureSnapshot() {
    const video = elements.cameraVideo;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    const canvas = elements.cameraCanvas;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Flip horizontal if front-facing user camera for natural mirror reflection
    if (currentFacingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    pendingSnapshotDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Show preview controls so user can confirm or retake
    if (elements.cameraSnapshotPreview) {
      elements.cameraSnapshotPreview.src = pendingSnapshotDataUrl;
      elements.cameraSnapshotPreview.classList.remove('hidden');
    }
    if (elements.cameraLiveControls) elements.cameraLiveControls.classList.add('hidden');
    if (elements.cameraPreviewControls) elements.cameraPreviewControls.classList.remove('hidden');
  }

  function retakeSnapshot() {
    pendingSnapshotDataUrl = null;
    if (elements.cameraSnapshotPreview) {
      elements.cameraSnapshotPreview.classList.add('hidden');
      elements.cameraSnapshotPreview.src = '';
    }
    if (elements.cameraLiveControls) elements.cameraLiveControls.classList.remove('hidden');
    if (elements.cameraPreviewControls) elements.cameraPreviewControls.classList.add('hidden');
  }

  function confirmSnapshot() {
    if (!pendingSnapshotDataUrl) return;

    pendingAttachments.push({
      name: `Camera_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.jpg`,
      mimeType: 'image/jpeg',
      size: Math.round(pendingSnapshotDataUrl.length * 0.75),
      data: pendingSnapshotDataUrl
    });

    renderAttachmentRibbon();
    closeCameraModal();
  }

  /* ==========================================================================
     Voice Dictation (Microphone Speech-to-Text & Waveform)
     ========================================================================== */
  function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      speechRecognition = new SpeechRec();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = 'en-US';

      speechRecognition.onresult = function (event) {
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' ';
        }
        const text = fullTranscript.trim();
        if (text) {
          elements.messageInput.value = text;
          autoResizeTextarea();
          hasDetectedSpeechInSession = true;

          // Visual feedback that speech was recognized
          if (elements.recordingStatusText) {
            elements.recordingStatusText.textContent = 'Hearing you... (will auto-send when you pause)';
            elements.recordingStatusText.className = 'recording-text recording-status-active';
          }

          // Clear previous silence timer and start fresh silence countdown
          if (silenceAutoSendTimer) {
            clearTimeout(silenceAutoSendTimer);
          }
          silenceAutoSendTimer = setTimeout(() => {
            if (isRecordingVoice && hasDetectedSpeechInSession && elements.messageInput.value.trim()) {
              if (elements.recordingStatusText) {
                elements.recordingStatusText.textContent = 'Done listening! Working on your question...';
                elements.recordingStatusText.className = 'recording-text recording-status-sending';
              }
              // Automatically stop recording and send question!
              stopVoiceRecording(true);
            }
          }, SILENCE_AUTO_SEND_DELAY);
        }
      };

      speechRecognition.onerror = function (event) {
        console.warn('Speech recognition error:', event.error);
      };

      speechRecognition.onend = function () {
        if (isRecordingVoice) {
          // If speech was recorded and microphone ended, auto-submit
          if (hasDetectedSpeechInSession && elements.messageInput.value.trim()) {
            stopVoiceRecording(true);
          } else {
            stopVoiceRecording(false);
          }
        }
      };
    }
  }

  async function toggleVoiceRecording() {
    if (isRecordingVoice) {
      // Tapping mic while recording stops and immediately sends
      stopVoiceRecording(true);
    } else {
      await startVoiceRecording();
    }
  }

  async function startVoiceRecording() {
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(audioStream);
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 64;
      source.connect(audioAnalyser);

      isRecordingVoice = true;
      hasDetectedSpeechInSession = false;
      if (silenceAutoSendTimer) {
        clearTimeout(silenceAutoSendTimer);
        silenceAutoSendTimer = null;
      }

      if (elements.recordingStatusText) {
        elements.recordingStatusText.textContent = 'Listening... Speak your question';
        elements.recordingStatusText.className = 'recording-text';
      }

      elements.micBtn.classList.add('recording');
      elements.voiceWaveformContainer.classList.remove('hidden');

      // Stop any running speech synthesis so bot doesn't talk over the user
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      recordingStartTime = Date.now();
      updateRecordingTimer();
      recordingTimerInterval = setInterval(updateRecordingTimer, 1000);

      drawWaveform();

      if (speechRecognition) {
        speechRecognition.start();
      }
    } catch (err) {
      alert('Microphone access denied or unavailable: ' + err.message);
    }
  }

  function stopVoiceRecording(shouldSend = false) {
    if (silenceAutoSendTimer) {
      clearTimeout(silenceAutoSendTimer);
      silenceAutoSendTimer = null;
    }
    const hadSpeech = hasDetectedSpeechInSession;
    hasDetectedSpeechInSession = false;

    isRecordingVoice = false;
    elements.micBtn.classList.remove('recording');
    elements.voiceWaveformContainer.classList.add('hidden');

    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }

    if (waveformAnimId) {
      cancelAnimationFrame(waveformAnimId);
      waveformAnimId = null;
    }

    if (speechRecognition) {
      try { speechRecognition.stop(); } catch (e) {}
    }

    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }

    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
      audioContext = null;
    }

    // Automatically send the question and start generating answer
    if (shouldSend && elements.messageInput.value.trim()) {
      sendMessage();
    }
  }

  function updateRecordingTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    elements.recordingTimer.textContent = `${mins}:${secs}`;
  }

  function drawWaveform() {
    if (!isRecordingVoice || !audioAnalyser) return;

    const canvas = elements.waveformCanvas;
    const ctx = canvas.getContext('2d');
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    audioAnalyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;

      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(1, '#06b6d4');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
      x += barWidth;
    }

    waveformAnimId = requestAnimationFrame(drawWaveform);
  }

  /* ==========================================================================
     Text-To-Speech (TTS) Voice Synthesis
     ========================================================================== */
  function populateVoiceList() {
    if (!window.speechSynthesis) return;
    availableVoices = window.speechSynthesis.getVoices();

    elements.ttsVoiceSelect.innerHTML = '<option value="">Browser Default Voice</option>';
    availableVoices.forEach(voice => {
      const opt = document.createElement('option');
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — Default' : ''}`;
      if (voice.name === settings.ttsVoice) opt.selected = true;
      elements.ttsVoiceSelect.appendChild(opt);
    });
  }

  function toggleSpeechSynthesis(text, btnElement) {
    if (!window.speechSynthesis) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (btnElement) btnElement.classList.remove('active-speak');
      return;
    }

    speakText(text, btnElement);
  }

  function speakText(text, btnElement = null) {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel(); // Stop any active speech

    // Clean markdown symbols for natural speech readout
    const cleanSpeechText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[#*>\-_~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    if (!cleanSpeechText) return;

    activeAudioUtterance = new SpeechSynthesisUtterance(cleanSpeechText);
    activeAudioUtterance.pitch = settings.ttsPitch || 1.0;
    activeAudioUtterance.rate = settings.ttsRate || 1.0;

    if (settings.ttsVoice) {
      const selectedVoice = availableVoices.find(v => v.name === settings.ttsVoice);
      if (selectedVoice) activeAudioUtterance.voice = selectedVoice;
    }

    if (btnElement) {
      btnElement.classList.add('active-speak');
      activeAudioUtterance.onend = () => btnElement.classList.remove('active-speak');
      activeAudioUtterance.onerror = () => btnElement.classList.remove('active-speak');
    }

    window.speechSynthesis.speak(activeAudioUtterance);
  }

  function updateTTSButtonState() {
    elements.ttsToggleBtn.classList.toggle('active', settings.autoTTS);
    elements.ttsToggleBtn.title = settings.autoTTS ? 'Auto Read-Aloud: ON (Click to mute)' : 'Auto Read-Aloud: OFF (Click to enable)';
  }

  /* ==========================================================================
     Lightbox & Drag-and-Drop
     ========================================================================== */
  function openLightbox(src) {
    elements.lightboxImage.src = src;
    elements.imageLightboxModal.classList.remove('hidden');
  }

  function closeLightbox() {
    elements.imageLightboxModal.classList.add('hidden');
    elements.lightboxImage.src = '';
  }

  function setupDragAndDrop() {
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      elements.dragDropOverlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        elements.dragDropOverlay.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      elements.dragDropOverlay.classList.remove('active');

      if (e.dataTransfer && e.dataTransfer.files) {
        Array.from(e.dataTransfer.files).forEach(file => addFileAttachment(file));
      }
    });
  }

  /* ==========================================================================
     Event Listeners & Binding
     ========================================================================== */
  function bindEvents() {
    // Send message triggers
    elements.sendBtn.addEventListener('click', sendMessage);

    // Stop generation triggers (Dock button, Floating button, and Escape key)
    elements.stopGenerationBtn.addEventListener('click', stopGeneration);
    if (elements.floatingStopBtn) {
      elements.floatingStopBtn.addEventListener('click', stopGeneration);
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isGenerating) {
        e.preventDefault();
        stopGeneration();
      }
    });

    elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    elements.messageInput.addEventListener('input', autoResizeTextarea);

    // Sidebar navigation
    elements.openSidebarBtn.addEventListener('click', () => {
      elements.sidebar.classList.toggle('collapsed');
      elements.sidebar.classList.toggle('open');
    });
    elements.closeSidebarBtn.addEventListener('click', () => {
      elements.sidebar.classList.add('collapsed');
      elements.sidebar.classList.remove('open');
    });
    elements.newChatBtn.addEventListener('click', () => createNewConversation());
    elements.clearAllChatsBtn.addEventListener('click', clearAllConversations);

    // Multimodal quick mode starter chips in sidebar
    document.querySelectorAll('.mode-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const mode = chip.dataset.mode;
        if (mode === 'vision') elements.fileInput.click();
        else if (mode === 'voice') toggleVoiceRecording();
        else if (mode === 'docs') elements.fileInput.click();
        else if (mode === 'code') {
          elements.messageInput.value = 'Explain this code snippet or screenshot and suggest optimizations:';
          elements.messageInput.focus();
        }
      });
    });

    // Welcome Screen Starter Cards
    document.querySelectorAll('.starter-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        const action = card.dataset.action;
        imageGenerationMode = action === 'generate-image';
        elements.messageInput.value = prompt;
        elements.messageInput.focus();
        autoResizeTextarea();

        if (action === 'image' || action === 'file') elements.fileInput.click();
        else if (action === 'camera') openCameraModal();
        else if (action === 'voice') toggleVoiceRecording();
        else if (action === 'generate-image') {
          imageGenerationMode = true;
          elements.messageInput.placeholder = 'Describe the image you want to create...';
        } else {
          elements.messageInput.placeholder = 'Ask anything, drag images/docs, or dictate voice...';
        }
      });
    });

    // Supercharged AI Capabilities Bar ("Do Everything" Bar)
    if (elements.capabilitiesBar) {
      elements.capabilitiesBar.querySelectorAll('.cap-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          imageGenerationMode = mode === 'generate-image';
          if (mode !== 'generate-image') {
            elements.messageInput.placeholder = 'Ask anything, drag images/docs, or dictate voice...';
          }
          if (mode === 'ask') {
            // Clear any starter prompt left by another quick mode and return to normal chat.
            elements.messageInput.value = '';
            elements.messageInput.placeholder = 'Ask anything: Science, history, philosophy, life advice, facts...';
            autoResizeTextarea();
            elements.messageInput.focus();
          } else if (mode === 'code') {
            elements.messageInput.value = 'Write a clean, production-ready script to ';
            elements.messageInput.focus();
            autoResizeTextarea();
          } else if (mode === 'web') {
            elements.messageInput.value = 'Search the web and provide the latest verified information about: ';
            elements.messageInput.focus();
            autoResizeTextarea();
          } else if (mode === 'translate') {
            elements.messageInput.value = 'Translate the following text into Spanish, French, German, and Hindi: ';
            elements.messageInput.focus();
            autoResizeTextarea();
          } else if (mode === 'math') {
            elements.messageInput.value = 'Solve this math problem step-by-step with formulas and clear explanations: ';
            elements.messageInput.focus();
            autoResizeTextarea();
          } else if (mode === 'summarize') {
            elements.messageInput.value = 'Summarize the key takeaways, bullet points, and actionable insights from: ';
            elements.messageInput.focus();
            autoResizeTextarea();
          } else if (mode === 'write') {
            elements.messageInput.value = 'Draft a compelling, professional ';
            elements.messageInput.focus();
            autoResizeTextarea();
          } else if (mode === 'vision') {
            elements.fileInput.click();
          } else if (mode === 'generate-image') {
            imageGenerationMode = true;
            elements.messageInput.placeholder = 'Describe the image you want to create...';
            elements.messageInput.value = 'Create an image of: ';
            elements.messageInput.focus();
            autoResizeTextarea();
          } else if (mode === 'export') {
            exportCurrentChat();
          }
        });
      });
    }

    if (elements.exportChatBtn) {
      elements.exportChatBtn.addEventListener('click', exportCurrentChat);
    }

    // Model select change
    elements.modelSelect.addEventListener('change', () => {
      settings.model = elements.modelSelect.value;
      elements.activeModelBadge.textContent = elements.modelSelect.options[elements.modelSelect.selectedIndex]?.text || settings.model;
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    });

    // TTS Auto toggle
    elements.ttsToggleBtn.addEventListener('click', () => {
      settings.autoTTS = !settings.autoTTS;
      updateTTSButtonState();
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    });

    // Theme selector
    elements.themeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.themeMenu.classList.toggle('hidden');
    });

    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        elements.themeMenu.classList.add('hidden');
      });
    });

    document.addEventListener('click', (e) => {
      if (!elements.themeMenu.contains(e.target) && !elements.themeToggleBtn.contains(e.target)) {
        elements.themeMenu.classList.add('hidden');
      }
    });

    // Attachment menu controls (Take Photo, Upload Image, Attach File)
    if (elements.attachFileBtn && elements.attachMenuDropdown) {
      elements.attachFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.attachMenuDropdown.classList.toggle('hidden');
      });
    }

    if (elements.menuTakePhotoBtn) {
      elements.menuTakePhotoBtn.addEventListener('click', () => {
        if (elements.attachMenuDropdown) elements.attachMenuDropdown.classList.add('hidden');
        openCameraModal();
      });
    }

    if (elements.menuUploadImageBtn) {
      elements.menuUploadImageBtn.addEventListener('click', () => {
        if (elements.attachMenuDropdown) elements.attachMenuDropdown.classList.add('hidden');
        elements.imageOnlyInput.click();
      });
    }

    if (elements.menuAttachFileBtn) {
      elements.menuAttachFileBtn.addEventListener('click', () => {
        if (elements.attachMenuDropdown) elements.attachMenuDropdown.classList.add('hidden');
        elements.fileInput.click();
      });
    }

    document.addEventListener('click', (e) => {
      if (elements.attachMenuWrapper && !elements.attachMenuWrapper.contains(e.target)) {
        if (elements.attachMenuDropdown) elements.attachMenuDropdown.classList.add('hidden');
      }
    });

    elements.fileInput.addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(f => addFileAttachment(f));
      elements.fileInput.value = '';
    });

    if (elements.imageOnlyInput) {
      elements.imageOnlyInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(f => addFileAttachment(f));
        elements.imageOnlyInput.value = '';
      });
    }

    elements.clearAllAttachmentsBtn.addEventListener('click', clearPendingAttachments);

    // Camera Controls (Mobile & Cross-Device)
    elements.cameraBtn.addEventListener('click', openCameraModal);
    elements.closeCameraModalBtn.addEventListener('click', closeCameraModal);
    elements.cancelCameraBtn.addEventListener('click', closeCameraModal);
    elements.captureSnapshotBtn.addEventListener('click', captureSnapshot);
    if (elements.flipCameraBtn) elements.flipCameraBtn.addEventListener('click', toggleCameraFacing);
    if (elements.flipCameraBtnMobile) elements.flipCameraBtnMobile.addEventListener('click', toggleCameraFacing);
    if (elements.confirmSnapshotBtn) elements.confirmSnapshotBtn.addEventListener('click', confirmSnapshot);
    if (elements.retakeSnapshotBtn) elements.retakeSnapshotBtn.addEventListener('click', retakeSnapshot);
    if (elements.discardSnapshotBtn) {
      elements.discardSnapshotBtn.addEventListener('click', retakeSnapshot);
    }
    if (elements.cameraUploadFallbackBtn) {
      elements.cameraUploadFallbackBtn.addEventListener('click', () => {
        closeCameraModal();
        elements.fileInput.click();
      });
    }

    // Voice Dictation & Hands-Free Auto-Send
    elements.micBtn.addEventListener('click', toggleVoiceRecording);
    if (elements.stopVoiceBtn) {
      elements.stopVoiceBtn.addEventListener('click', () => stopVoiceRecording(true));
    }
    if (elements.cancelVoiceBtn) {
      elements.cancelVoiceBtn.addEventListener('click', () => {
        elements.messageInput.value = '';
        stopVoiceRecording(false);
      });
    }

    // Settings Modal
    elements.openSettingsBtn.addEventListener('click', () => openModal(elements.settingsModal));
    elements.apiKeyStatusCard.addEventListener('click', () => openModal(elements.settingsModal));
    elements.quickKeyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(elements.settingsModal);
    });
    elements.closeSettingsModalBtn.addEventListener('click', () => closeModal(elements.settingsModal));
    elements.saveSettingsBtn.addEventListener('click', saveSettings);

    elements.systemPromptSelect.addEventListener('change', () => {
      elements.customSystemPrompt.style.display = elements.systemPromptSelect.value === 'custom' ? 'block' : 'none';
    });

    elements.temperatureSlider.addEventListener('input', () => {
      elements.tempValueDisplay.textContent = elements.temperatureSlider.value;
    });

    elements.pitchSlider.addEventListener('input', () => {
      elements.pitchDisplay.textContent = elements.pitchSlider.value;
    });

    elements.rateSlider.addEventListener('input', () => {
      elements.rateDisplay.textContent = elements.rateSlider.value;
    });

    elements.testVoiceBtn.addEventListener('click', () => {
      speakText('Hello! I am your Multimodal AI voice assistant.');
    });

    elements.testApiKeyBtn.addEventListener('click', testApiKeyConnection);

    // Lightbox
    elements.closeLightboxBtn.addEventListener('click', closeLightbox);
    elements.imageLightboxModal.addEventListener('click', (e) => {
      if (e.target === elements.imageLightboxModal) closeLightbox();
    });

    // Scroll to bottom button
    elements.messagesContainer.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = elements.messagesContainer;
      const distFromBottom = scrollHeight - (scrollTop + clientHeight);
      elements.scrollToBottomBtn.classList.toggle('hidden', distFromBottom < 160);
    });
    elements.scrollToBottomBtn.addEventListener('click', scrollToBottom);

    // Global drag and drop
    setupDragAndDrop();

    // Escape key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal(elements.settingsModal);
        closeCameraModal();
        closeLightbox();
      }
    });
  }

  function exportCurrentChat() {
    const chat = getActiveConversation();
    if (!chat || !chat.messages || chat.messages.length === 0) {
      alert('There are no messages in this conversation to export.');
      return;
    }
    let md = `# ${chat.title || 'Zenith Assistant Conversation'}\n\n`;
    md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    chat.messages.forEach(m => {
      const isU = (m.role === 'user');
      const sender = isU ? '👤 **You**' : '🌌 **Zenith Assistant**';
      md += `### ${sender} *(${formatTime(m.timestamp)})*\n\n${m.content || ''}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(chat.title || 'conversation').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function testApiKeyConnection() {
    const key = elements.apiKeyInput.value.trim();
    if (!key) {
      showKeyFeedback('Please enter an API key first.', false);
      return;
    }

    elements.testApiKeyBtn.textContent = 'Testing...';
    elements.testApiKeyBtn.disabled = true;

    try {
      const res = await fetch(API_BASE + '/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        showKeyFeedback(`✓ Key verified successfully! (${data.count} models accessible)`, true);
      } else {
        showKeyFeedback(`✕ Error: ${data.error || 'Invalid key'}`, false);
      }
    } catch (err) {
      showKeyFeedback(`✕ Network error: ${err.message}`, false);
    } finally {
      elements.testApiKeyBtn.textContent = 'Test';
      elements.testApiKeyBtn.disabled = false;
    }
  }

  function showKeyFeedback(text, isSuccess) {
    elements.apiKeyTestFeedback.textContent = text;
    elements.apiKeyTestFeedback.className = `feedback-text ${isSuccess ? 'success' : 'error'}`;
    elements.apiKeyTestFeedback.classList.remove('hidden');
  }

  function autoResizeTextarea() {
    const ta = elements.messageInput;
    ta.style.height = 'auto';
    const computedHeight = ta.scrollHeight;
    ta.style.height = Math.min(Math.max(computedHeight, 28), 160) + 'px';
  }

  function scrollToBottom() {
    elements.messagesContainer.scrollTo({
      top: elements.messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  }

  function openModal(modal) {
    modal.classList.remove('hidden');
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
  }

  function formatTime(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
