// filename: public/script.js
// public/script.js (Final Stable Version - Corrected History Rendering)
document.addEventListener("DOMContentLoaded", () => {
  // --- 状态管理 (State Management) ---
  let state = {
    sessions: [],
    activeSessionId: localStorage.getItem("lastActiveSessionId") || null, // Initialize from localStorage
    token: localStorage.getItem("accessToken"),
    username: localStorage.getItem("username"),
    isRegisterMode: false,
    currentMessages: [],
    apiProviders: [],
  };

  function setChatboxHeight() {
    const header = document.querySelector('#app-container > header');
    const footer = document.querySelector('#app-container > footer');
    if (header && footer) {
        const headerHeight = header.offsetHeight;
        const footerHeight = footer.offsetHeight;
        const chatBox = document.getElementById('chat-box');
        chatBox.style.height = `calc(100dvh - ${headerHeight}px - ${footerHeight}px)`;
    }
  }

  function formatDate(dateString) {
      if (!dateString) return '';
      try {
          // Replace hyphens with slashes for better Safari compatibility
          const compatibleDateString = String(dateString).replace(/-/g, "/");
          const date = new Date(compatibleDateString);
          return date.toLocaleString("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
          });
      } catch (e) {
          console.error("Invalid date format:", dateString);
          return '';
      }
  }

  // --- DOM 元素选择器 (DOM Element Selectors) ---
  const appContainer = document.getElementById("app-container");
  const authContainer = document.getElementById("auth-container");
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authUsername = document.getElementById("auth-username");
  const authPassword = document.getElementById("auth-password");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const switchAuthModeBtn = document.getElementById("switch-auth-mode");
  const authMessage = document.getElementById("auth-message");
  const newChatBtn = document.getElementById("new-chat-btn");
  const newChatBtnHeader = document.getElementById("new-chat-btn-header");
  const sessionList = document.getElementById("session-list");
  const chatForm = document.getElementById("chat-form");
  const userInput = document.getElementById("user-input");
  const chatBox = document.getElementById("chat-box");
  const chatTitle = document.getElementById("chat-title");
  const modelSelect = document.getElementById("model-select");
  const usernameDisplay = document.getElementById("username-display");
  const logoutBtn = document.getElementById("logout-btn");
  const historyToggleBtn = document.getElementById("history-toggle-btn");
  const historyDrawer = document.getElementById("history-drawer");
  const drawerOverlay = document.getElementById("drawer-overlay");
  const sendButton = document.getElementById("send-button");
  const tocBtn = document.getElementById("toc-btn");
  const tocDrawer = document.getElementById("toc-drawer");

  // --- 依赖库配置 (Library Configuration) ---
  marked.setOptions({
    highlight: function(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      try {
        return hljs.highlight(code, {
          language: language,
          ignoreIllegals: true
        }).value;
      } catch (e) {
        try {
          return hljs.highlightAuto(code).value;
        } catch (e) {
          return code;
        }
      }
    },
  });

  // --- 认证相关功能 (Authentication Functions) ---
  function toggleAuthModeUI() {
    authMessage.textContent = "";
    if (state.isRegisterMode) {
      authTitle.textContent = "注册";
      authSubmitBtn.textContent = "注册";
      switchAuthModeBtn.textContent = "已有账号？点击登录";
    } else {
      authTitle.textContent = "登录";
      authSubmitBtn.textContent = "登录";
      switchAuthModeBtn.textContent = "没有账号？点击注册";
    }
  }
  switchAuthModeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    state.isRegisterMode = !state.isRegisterMode;
    toggleAuthModeUI();
  });
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = authUsername.value;
    const password = authPassword.value;
    const endpoint = state.isRegisterMode ? "/api/auth/register" : "/api/auth/login";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "操作失败");
      }
      if (state.isRegisterMode) {
        state.isRegisterMode = false;
        toggleAuthModeUI();
        authMessage.style.color = "#0E9F6E";
        authMessage.textContent = "注册成功！请登录。";
      } else {
        state.token = data.accessToken;
        state.username = data.username;
        localStorage.setItem("accessToken", state.token);
        localStorage.setItem("username", state.username);
        initializeApp();
      }
    } catch (error) {
      authMessage.style.color = "#F05252";
      authMessage.textContent = error.message;
    }
  });
  logoutBtn.addEventListener("click", function() {
    state.token = null;
    state.username = null;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("username");
    localStorage.removeItem("lastActiveSessionId");
    toggleAuthViews(false);
  });
  function toggleAuthViews(isLoggedIn) {
    if (isLoggedIn) {
      appContainer.classList.remove("hidden");
      authContainer.classList.add("hidden");
      usernameDisplay.textContent = state.username;
    } else {
      appContainer.classList.add("hidden");
      authContainer.classList.remove("hidden");
    }
  }

  // --- 侧边栏与会话管理 (Sidebar & Session Management) ---
  historyToggleBtn.addEventListener("click", () => {
    tocDrawer.classList.remove("open");
    historyDrawer.classList.toggle("open");
    drawerOverlay.classList.toggle("visible");
  });
  tocBtn.addEventListener("click", () => {
    historyDrawer.classList.remove("open");
    tocDrawer.classList.toggle("open");
    drawerOverlay.classList.toggle("visible");
  });
  drawerOverlay.addEventListener("click", () => {
    historyDrawer.classList.remove("open");
    tocDrawer.classList.remove("open");
    drawerOverlay.classList.remove("visible");
  });

  async function apiRequest(url, options = {}) {
    const defaultHeaders = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (state.token) {
      defaultHeaders["x-access-token"] = state.token;
    }

    const response = await fetch(url, {
      ...options,
      headers: defaultHeaders,
    });
    if (response.status === 401) {
      logoutBtn.click();
      return Promise.reject(new Error("登录已过期，请重新登录。"));
    }
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error("JSON parsing error:", e, "for response text:", text);
      data = {
        error: "Invalid response from server",
        _raw: text
      };
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || "请求失败");
    }
    return data;
  }

  async function loadSessions() {
    try {
      const sessions = await apiRequest("/api/sessions");
      state.sessions = sessions;
      renderSessions();
      if (state.sessions && state.sessions.length > 0) {
        const lastActiveSessionId = localStorage.getItem("lastActiveSessionId");
        const sessionExists = state.sessions.some(s => s.id === lastActiveSessionId);
        const activeSessionId = (lastActiveSessionId && sessionExists) ? lastActiveSessionId : state.sessions[0].id;
        await loadSessionMessages(activeSessionId);
      } else {
        await createNewSession();
      }
    } catch (error) {
      console.error("加载对话列表失败:", error);
    }
  }

  async function createNewSession() {
    try {
      const newSession = await apiRequest("/api/sessions", {
        method: "POST"
      });
      const sessionWithDate = { ...newSession, created_at: new Date().toISOString() };
      state.sessions.unshift(sessionWithDate);
      renderSessions();
      await loadSessionMessages(newSession.id);
      historyDrawer.classList.remove("open");
      drawerOverlay.classList.remove("visible");
    } catch (error) {
      console.error("创建新对话失败:", error);
    }
  }
  newChatBtn.addEventListener("click", createNewSession);
  newChatBtnHeader.addEventListener("click", createNewSession);


  async function loadSessionMessages(sessionId) {
    historyDrawer.classList.remove("open");
    drawerOverlay.classList.remove("visible");
    state.activeSessionId = sessionId;
    localStorage.setItem("lastActiveSessionId", sessionId);
    renderSessions();
    const activeSession = state.sessions.find(s => s.id === sessionId);
    chatTitle.textContent = activeSession ? activeSession.title : "聊天";

    try {
      state.currentMessages = await apiRequest(`/api/sessions/${sessionId}/messages`);
      renderMessages();
      userInput.focus();
      renderTableOfContents();
    } catch (error) {
      console.error(`加载对话 [${sessionId}] 失败:`, error);
      chatBox.innerHTML = `<div class="message assistant"><div>加载消息失败: ${error.message}</div></div>`;
    }
  }

  function renderSessions() {
    sessionList.innerHTML = "";
    if (!state.sessions || !Array.isArray(state.sessions)) return;
    state.sessions.forEach((session) => {
      const listItem = document.createElement("li");
      const titleSpan = document.createElement("span");
      titleSpan.classList.add("session-title");
      titleSpan.textContent = session.title;
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("session-time");
      timeSpan.textContent = formatDate(session.created_at);
      listItem.appendChild(titleSpan);
      listItem.appendChild(timeSpan);
      listItem.dataset.sessionId = session.id;
      if (session.id === state.activeSessionId) {
        listItem.classList.add("active");
      }
      listItem.addEventListener("click", () => loadSessionMessages(session.id));
      sessionList.appendChild(listItem);
    });
  }

  // --- 消息渲染 (Message Rendering) ---
  function renderMessages() {
    chatBox.innerHTML = "";
    const filteredMessages = state.currentMessages.filter(msg => msg.role !== 'system');
    filteredMessages.forEach((msg, index) => {
      try {
        const parsedContent = JSON.parse(msg.content);
        if (parsedContent && typeof parsedContent === 'object' && 'answer' in parsedContent) {
          renderThinkingMessage(parsedContent, index);
        } else {
          renderSimpleMessage(msg.content, msg.role, index);
        }
      } catch (e) {
        renderSimpleMessage(msg.content, msg.role, index);
      }
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function renderSimpleMessage(content, role, index) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role);
    messageDiv.dataset.messageIndex = index;
    const innerDiv = document.createElement("div");
    innerDiv.innerHTML = marked.parse(String(content));
    messageDiv.appendChild(innerDiv);
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    innerDiv.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
    return messageDiv;
  }

  function renderThinkingMessage(data, index) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message assistant";
    messageDiv.dataset.messageIndex = index;
    if (!data.thought || !data.thought.trim()) { 
        messageDiv.classList.add('no-thought'); 
    }
    const innerDiv = document.createElement('div');

    const thoughtBlockHTML = `
      <div class="thinking-header">
          <span class="timer">思考过程 (${data.duration}s)</span>
          <span class="toggle-thought">
              <svg class="arrow down" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
      </div>
      <div class="thought-wrapper">
          <div class="thought-process">${marked.parse(data.thought || '(无思考过程)')}</div>
      </div>
    `;
    
    innerDiv.innerHTML = `${thoughtBlockHTML}<div class="final-answer">${marked.parse(data.answer)}</div>`;
    messageDiv.appendChild(innerDiv);
    chatBox.appendChild(messageDiv);

    const header = innerDiv.querySelector(".thinking-header");
    const thoughtWrapper = innerDiv.querySelector(".thought-wrapper");

    header.addEventListener("click", () => {
        header.classList.toggle('collapsed');
        thoughtWrapper.classList.toggle('collapsed');
    });

    innerDiv.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageDiv;
  }

  // --- Chatting and API Interactions ---
  userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      chatForm.dispatchEvent(new Event("submit"));
    }
  });
  userInput.addEventListener("input", () => {
    userInput.style.height = 'auto';
    userInput.style.height = `${userInput.scrollHeight}px`;
    sendButton.disabled = !userInput.value.trim();
  });

  async function loadApiProviders() {
    try {
      const providers = await apiRequest("/api/providers");
      state.apiProviders = providers;
      modelSelect.innerHTML = "";
      providers.forEach((provider) => {
        const option = document.createElement("option");
        option.value = provider.id;
        option.textContent = provider.name;
        modelSelect.appendChild(option);
      });
    } catch (error) {
      console.error("加载 API 列表失败:", error);
      modelSelect.innerHTML = "<option>加载失败</option>";
    }
  }

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    userInput.blur();
    const message = userInput.value.trim();
    if (!message || !state.activeSessionId) return;
    sendButton.disabled = true;
    const userMessage = { role: "user", content: message };
    state.currentMessages.push(userMessage);
    renderMessages();
    userInput.value = "";
    userInput.style.height = 'auto';
    // No focus on mobile to prevent keyboard popping up again
    if (window.innerWidth > 768) {
      userInput.focus();
    }
    await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(userMessage),
    });
    const apiId = modelSelect.value;
    await handleStreamingChat(apiId, message, state.activeSessionId);
    sendButton.disabled = false;
  });

  async function handleStreamingChat(apiId, userMessage, sessionId) {
    const assistantMessageDiv = document.createElement("div");
    assistantMessageDiv.className = "message assistant";
    const messageIndex = state.currentMessages.filter(msg => msg.role !== 'system').length;
    assistantMessageDiv.dataset.messageIndex = messageIndex;

    const innerDiv = document.createElement("div");
    innerDiv.innerHTML = `
        <div class="thinking-header">
            <span class="timer">思考过程 (0.0s)</span>
            <span class="toggle-thought">
                <svg class="arrow down" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
        </div>
        <div class="thought-wrapper"><div class="thought-process"><div class="dot-flashing"></div></div></div>
        <div class="final-answer"></div>
    `;
    assistantMessageDiv.appendChild(innerDiv);
    chatBox.appendChild(assistantMessageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    const header = assistantMessageDiv.querySelector(".thinking-header");
    header.addEventListener("click", () => {
        header.classList.toggle('collapsed');
        innerDiv.querySelector(".thought-wrapper").classList.toggle('collapsed');
    });

    let currentThought = "";
    let currentAnswer = "";
    const startTime = Date.now();
    let timerIntervalId = null;

    try {
      timerIntervalId = setInterval(() => {
        assistantMessageDiv.querySelector('.timer').textContent = `思考过程 (${((Date.now() - startTime) / 1000).toFixed(1)}s)`;
      }, 100);

      const requestResponse = await apiRequest("/api/chat-request", {
        method: "POST",
        body: JSON.stringify({ messages: state.currentMessages, apiId, sessionId }),
      });
      if (!requestResponse.taskId) throw new Error("未能获取有效的任务ID");
      const { taskId } = requestResponse;

      await new Promise((resolve, reject) => {
        const intervalId = setInterval(async () => {
          if (state.activeSessionId !== sessionId) {
            clearInterval(intervalId);
            resolve();
            return;
          }
          try {
            const pollResponse = await apiRequest(`/api/chat-poll/${taskId}`);
            if (pollResponse.error) {
              clearInterval(intervalId);
              reject(new Error(pollResponse.error));
              return;
            }

            if (pollResponse.fullThought !== currentThought || pollResponse.fullAnswer !== currentAnswer) {
                currentThought = pollResponse.fullThought;
                currentAnswer = pollResponse.fullAnswer;
                const cursor = pollResponse.done ? "" : "▋";

                const thoughtProcessDiv = assistantMessageDiv.querySelector('.thought-process');
                if (currentThought) {
                    thoughtProcessDiv.innerHTML = marked.parse(currentThought);
                } else {
                    thoughtProcessDiv.innerHTML = '<div class="dot-flashing"></div>';
                }

                assistantMessageDiv.querySelector('.final-answer').innerHTML = marked.parse(currentAnswer + cursor);
                chatBox.scrollTop = chatBox.scrollHeight;
            }

            if (pollResponse.done) {
              clearInterval(intervalId);
              resolve();
            }
          } catch (error) {
            clearInterval(intervalId);
            reject(error);
          }
        }, 100);
      });
    } catch (error) {
      if(timerIntervalId) clearInterval(timerIntervalId);
      innerDiv.innerHTML = `<div class="final-answer" style="color: var(--error-color);">请求处理错误: ${error.message}</div>`;
      return;
    } finally {
        if(timerIntervalId) clearInterval(timerIntervalId);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        assistantMessageDiv.querySelector('.timer').textContent = `思考过程 (${duration}s)`;
        assistantMessageDiv.querySelector('.final-answer').innerHTML = marked.parse(currentAnswer);

        if (!currentThought.trim()) {
            assistantMessageDiv.querySelector('.thought-process').innerHTML = '(无思考过程)';
        }

        const messageData = { thought: currentThought, answer: currentAnswer, duration };
        const finalMessage = { role: "assistant", content: JSON.stringify(messageData) };
        state.currentMessages.push(finalMessage);

        await updateSessionTitle(userMessage);
        renderTableOfContents();
    }
  }

  function renderTableOfContents() {
    tocDrawer.innerHTML = '<div class="sidebar"><h2 style="padding: 12px 16px; margin:0;">目录</h2><ul id="toc-list" style="list-style:none; padding:0; margin:0;"></ul></div>';
    const tocList = tocDrawer.querySelector("#toc-list");
    const filteredMessages = state.currentMessages.filter(msg => msg.role !== 'system');
    
    filteredMessages.forEach((msg, index) => {
      if (msg.role === 'user') {
        const listItem = document.createElement('li');
        listItem.style.padding = "10px 16px";
        listItem.style.borderBottom = "1px solid var(--border-color)";
        listItem.style.cursor = "pointer";

        const userText = document.createElement('div');
        userText.textContent = `Q: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`;
        userText.style.fontWeight = "500";
        userText.style.marginBottom = "4px";

        const assistantMsg = filteredMessages[index + 1];
        let assistantText = document.createElement('div');
        assistantText.style.fontSize = "13px";
        assistantText.style.color = "var(--text-secondary)";
        if(assistantMsg && assistantMsg.role === 'assistant') {
            try {
                const parsed = JSON.parse(assistantMsg.content);
                assistantText.textContent = `A: ${(parsed.answer || "").substring(0, 60)}...`;
            } catch (e) {
                assistantText.textContent = `A: ${assistantMsg.content.substring(0, 60)}...`;
            }
        } else {
            assistantText.textContent = "A: 等待回答...";
        }

        listItem.appendChild(userText);
        listItem.appendChild(assistantText);
        listItem.addEventListener('click', () => {
            const targetMessage = document.querySelector(`.message[data-message-index="${index}"]`);
            if(targetMessage) {
                targetMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
                tocDrawer.classList.remove('open');
                drawerOverlay.classList.remove('visible');
            }
        });
        tocList.appendChild(listItem);
      }
    });
  }


  async function updateSessionTitle(userMessage) {
    const userMessagesCount = state.currentMessages.filter((msg) => msg.role === "user").length;
    if (userMessagesCount === 1) {
      const newTitle = userMessage.substring(0, 20);
      try {
        await apiRequest(`/api/sessions/${state.activeSessionId}/title`, {
          method: "PUT",
          body: JSON.stringify({ title: newTitle }),
        });
        const sessionToUpdate = state.sessions.find((s) => s.id === state.activeSessionId);
        if (sessionToUpdate) {
          sessionToUpdate.title = newTitle;
          renderSessions();
          chatTitle.textContent = newTitle;
        }
      } catch (error) {
        console.error("更新标题失败:", error);
      }
    }
  }

  async function initializeApp() {
    state.token = localStorage.getItem("accessToken");
    state.username = localStorage.getItem("username");

    toggleAuthViews(!!state.token);

    if (state.token) {
      await loadApiProviders();
      await loadSessions();
      sendButton.disabled = true;
    }
    
    setChatboxHeight();
    window.addEventListener('resize', setChatboxHeight);

    userInput.addEventListener('focus', () => {
      // A small delay is needed for the keyboard to start animating
      setTimeout(() => {
        window.scrollTo(0, document.body.scrollHeight);
      }, 150);
    });
  }

  initializeApp();
});