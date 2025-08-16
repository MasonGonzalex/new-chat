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
  const userInput = document.getElementById("user-input"); // Now a textarea
  const chatBox = document.getElementById("chat-box");
  const chatTitle = document.getElementById("chat-title");
  const usernameDisplay = document.getElementById("username-display");
  const logoutBtn = document.getElementById("logout-btn");
  const historyToggleBtn = document.getElementById("history-toggle-btn");
  const historyDrawer = document.getElementById("history-drawer");
  const drawerOverlay = document.getElementById("drawer-overlay");
  const sendButton = document.getElementById("send-button");

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
    historyDrawer.classList.toggle("open");
    drawerOverlay.classList.toggle("visible");
  });
  drawerOverlay.addEventListener("click", () => {
    historyDrawer.classList.remove("open");
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
      state.sessions.unshift(newSession);
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
      const date = new Date(session.created_at);
      timeSpan.textContent = date
        .toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
        .replace(/\//g, "-");
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
    if (state.currentMessages) {
      state.currentMessages
        .filter((msg) => msg.role !== "system")
        .forEach((msg) => {
          try {
            const parsedContent = JSON.parse(msg.content);
            if (parsedContent && typeof parsedContent === 'object' && 'answer' in parsedContent) {
              renderThinkingMessage(parsedContent);
            } else {
              renderSimpleMessage(msg.content, msg.role);
            }
          } catch (e) {
            renderSimpleMessage(msg.content, msg.role);
          }
        });
    }
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function renderSimpleMessage(content, role) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role);
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

  function renderThinkingMessage(data) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message assistant";

    const innerDiv = document.createElement('div');

    const thoughtBlock = (data.thought && data.thought.trim() !== '') ? `
      <div class="thinking-header">
          <span class="timer">思考过程 (${data.duration}s)</span>
          <span class="toggle-thought">
              <svg class="arrow down" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
      </div>
      <div class="thought-wrapper">
          <div class="thought-process">${marked.parse(data.thought)}</div>
      </div>
    ` : '';

    innerDiv.innerHTML = `
      ${thoughtBlock}
      <div class="final-answer">${marked.parse(data.answer)}</div>
    `;

    messageDiv.appendChild(innerDiv);
    chatBox.appendChild(messageDiv);

    if (data.thought && data.thought.trim() !== '') {
      const header = innerDiv.querySelector(".thinking-header");
      const thoughtWrapper = innerDiv.querySelector(".thought-wrapper");
      header.addEventListener("click", () => {
        thoughtWrapper.classList.toggle("collapsed");
        header.querySelector(".arrow").classList.toggle("down");
      });
    }

    innerDiv.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
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
    userInput.style.height = (userInput.scrollHeight) + 'px';
    sendButton.disabled = !userInput.value.trim();
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = userInput.value.trim();
    if (!message || !state.activeSessionId) return;

    sendButton.disabled = true;
    const userMessage = { role: "user", content: message };
    state.currentMessages.push(userMessage);
    renderMessages();
    userInput.value = "";
    userInput.style.height = 'auto';
    userInput.focus();

    await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(userMessage),
    });

    await handleStreamingChat(message, state.activeSessionId);
    sendButton.disabled = false;
  });

  async function handleStreamingChat(userMessage, sessionId) {
    const loadingBubble = document.createElement("div");
    loadingBubble.className = "message assistant loading";
    loadingBubble.innerHTML = `<div><div class="dot-flashing"></div></div>`;
    chatBox.appendChild(loadingBubble);
    chatBox.scrollTop = chatBox.scrollHeight;

    let assistantMessageDiv = null;
    let currentThought = "";
    let currentAnswer = "";
    const startTime = Date.now();

    try {
      const requestResponse = await apiRequest("/api/chat-request", {
        method: "POST",
        body: JSON.stringify({
          messages: state.currentMessages,
          apiId: "api_1",
          sessionId: sessionId
        }),
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

            if ((pollResponse.fullAnswer || pollResponse.fullThought) && !assistantMessageDiv) {
              loadingBubble.remove();
              assistantMessageDiv = document.createElement("div");
              assistantMessageDiv.className = "message assistant";
              assistantMessageDiv.innerHTML = `
                <div>
                  <div class="thinking-header">
                    <span class="timer">思考过程...</span>
                    <span class="toggle-thought">
                      <svg class="arrow down" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </span>
                  </div>
                  <div class="thought-wrapper"><div class="thought-process"></div></div>
                  <div class="final-answer"></div>
                </div>`;
              chatBox.appendChild(assistantMessageDiv);
              const header = assistantMessageDiv.querySelector(".thinking-header");
              header.addEventListener("click", () => {
                header.parentElement.querySelector(".thought-wrapper").classList.toggle("collapsed");
                header.querySelector(".arrow").classList.toggle("down");
              });
            }

            if (assistantMessageDiv && (pollResponse.fullThought !== currentThought || pollResponse.fullAnswer !== currentAnswer)) {
              currentThought = pollResponse.fullThought;
              currentAnswer = pollResponse.fullAnswer;
              const cursor = pollResponse.done ? "" : "▋";
              assistantMessageDiv.querySelector('.timer').textContent = `思考过程 (${((Date.now() - startTime) / 1000).toFixed(1)}s)`;
              assistantMessageDiv.querySelector('.thought-process').innerHTML = marked.parse(currentThought || '...');
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
      if(loadingBubble) loadingBubble.remove();
      renderSimpleMessage(`请求处理错误: ${error.message}`, 'assistant');
      return;
    } finally {
      if(loadingBubble) loadingBubble.remove();
      if(assistantMessageDiv) assistantMessageDiv.remove();

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const messageData = { thought: currentThought, answer: currentAnswer, duration: duration };
      const finalMessage = { role: "assistant", content: JSON.stringify(messageData) };
      state.currentMessages.push(finalMessage);
      renderMessages();

      await updateSessionTitle(userMessage);
    }
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
      await loadSessions();
      sendButton.disabled = true;
    }
  }

  initializeApp();
});