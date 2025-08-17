// filename: server.js
// server.js (Final Stable Version - Polling Logic Corrected & Prompt Updated)
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({
  default: fetch
}) => fetch(...args));
const path = require('path');
require("dotenv").config();
const {
  HttpsProxyAgent
} = require("https-proxy-agent");
const db = require("./database.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  v4: uuidv4
} = require('uuid');
const app = express();

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "a-very-strong-secret-key-that-you-should-change";
const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : null;

const taskStorage = {};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- API Provider Configuration ---
const apiPool = {};
let i = 1;
while (process.env[`API_${i}_NAME`]) {
  const apiId = `api_${i}`;
  const apiType = process.env[`API_${i}_TYPE`];

  let providerConfig = {
    id: apiId,
    name: process.env[`API_${i}_NAME`],
    type: apiType,
    apiUrl: process.env[`API_${i}_URL`],
  };

  if (apiType === "gemini") {
    const apiKeys = [];
    if (process.env[`API_${i}_KEY`]) {
      apiKeys.push({ key: process.env[`API_${i}_KEY`], status: "active", cooldownUntil: 0 });
    }
    let j = 1;
    while (process.env[`API_${i}_KEY_${j}`]) {
      apiKeys.push({ key: process.env[`API_${i}_KEY_${j}`], status: "active", cooldownUntil: 0 });
      j++;
    }
    providerConfig.apiKeys = apiKeys;
    providerConfig.currentKeyIndex = 0;
  } else {
    providerConfig.apiKey = process.env[`API_${i}_KEY`];
  }

  apiPool[apiId] = providerConfig;
  i++;
}


// --- API Router and Middleware ---
const apiRouter = express.Router();
const verifyToken = (req, res, next) => {
  const token = req.headers["x-access-token"];
  if (!token) {
    return res.status(403).json({
      message: "没有提供 Token"
    });
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        message: "Token 无效或已过期"
      });
    }
    req.userId = decoded.id;
    next();
  });
};

// --- Authentication Routes ---
apiRouter.post("/auth/register", (req, res) => {
  const {
    username,
    password
  } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({
      message: "用户名或密码格式不正确"
    });
  }
  const hashedPassword = bcrypt.hashSync(password, 8);
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) {
    if (err) {
      return res.status(500).json({
        message: "用户名已存在"
      });
    }
    res.status(201).json({
      message: "注册成功"
    });
  });
});
apiRouter.post("/auth/login", (req, res) => {
  const {
    username,
    password
  } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({
        message: "用户不存在"
      });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({
        message: "密码错误"
      });
    }
    const token = jwt.sign({
      id: user.id
    }, JWT_SECRET, {
      expiresIn: 2592000
    });
    res.status(200).json({
      id: user.id,
      username: user.username,
      accessToken: token
    });
  });
});

// --- API Routes (Public) ---
apiRouter.get("/providers", (req, res) => {
  const providers = Object.values(apiPool).map(p => ({
    id: p.id,
    name: p.name,
    type: p.type
  }));
  res.json(providers);
});

// --- API Routes (Protected) ---
apiRouter.use(verifyToken);

apiRouter.get("/sessions", (req, res) => {
  db.all("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC", [req.userId], (err, sessions) => {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }
    res.json(sessions);
  });
});

apiRouter.post("/sessions", (req, res) => {
  const newSession = {
    id: `session_${Date.now()}_${req.userId}`,
    user_id: req.userId,
    title: "新的对话",
  };
  db.run("INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)", [newSession.id, newSession.user_id, newSession.title], function(err) {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }
    res.status(201).json(newSession);
  });
});

apiRouter.get("/sessions/:id/messages", (req, res) => {
  const sessionId = req.params.id;
  db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({
        error: "对话不存在或无权访问"
      });
    }
    db.all("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC", [sessionId], (err, messages) => {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }
      const systemMessage = {
        role: "system",
        content: "你是一个名为“智核”的AI助手。你的核心准则是：提供诚实、有帮助、且无害的回答。你必须始终使用简体中文进行交流，即使是技术术语也要尝试翻译或用中文解释。在任何情况下都不能使用英文或其他语言。",
      };
      // Important: Here we do NOT parse the content, we send it as is.
      const formattedMessages = [systemMessage, ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))];
      res.json(formattedMessages);
    });
  });
});

apiRouter.post("/sessions/:id/messages", (req, res) => {
  const sessionId = req.params.id;
  const {
    role,
    content
  } = req.body;
  db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({
        error: "对话不存在或无权访问"
      });
    }
    const messageContent = typeof content === "string" ? content : JSON.stringify(content);
    db.run("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)", [sessionId, role, messageContent], function(err) {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }
      res.status(201).json({
        id: this.lastID,
        role,
        content
      });
    });
  });
});

apiRouter.put("/sessions/:id/title", (req, res) => {
  const sessionId = req.params.id;
  const {
    title
  } = req.body;
  db.run("UPDATE sessions SET title = ? WHERE id = ? AND user_id = ?", [title, sessionId, req.userId], function(err) {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        error: "对话不存在或无权访问"
      });
    }
    res.status(200).json({
      message: "标题更新成功"
    });
  });
});

// --- Chat Polling Routes ---
apiRouter.post("/chat-request", (req, res) => {
  const taskId = uuidv4();
  const {
    sessionId
  } = req.body; // Receive sessionId

  taskStorage[taskId] = {
    fullThought: "",
    fullAnswer: "",
    done: false,
    error: null
  };
  res.status(202).json({
    taskId
  });

  (async () => {
    const startTime = Date.now(); // Record start time
    
    async function fetchWithGeminiFailover(provider, purifiedMessages) {
        const totalKeys = provider.apiKeys.length;
        if (totalKeys === 0) {
            throw new Error("No Gemini API keys configured.");
        }
    
        // 1. Find an available key
        let selectedKeyIndex = -1;
        for (let i = 0; i < totalKeys; i++) {
            const keyIndex = (provider.currentKeyIndex + i) % totalKeys;
            const apiKeyInfo = provider.apiKeys[keyIndex];
            
            // Check if the key is in cooldown
            if (apiKeyInfo.status === 'cooldown' && Date.now() < apiKeyInfo.cooldownUntil) {
                continue; // Skip this key, it's cooling down
            }
    
            // If the cooldown has passed, restore it to active
            if (apiKeyInfo.status === 'cooldown') {
                apiKeyInfo.status = 'active';
            }
    
            // Found an available key
            selectedKeyIndex = keyIndex;
            break;
        }
        
        // If no available keys were found
        if (selectedKeyIndex === -1) {
            throw new Error("GEMINI_ALL_KEYS_IN_COOLDOWN");
        }
        
        // 2. Use the found key for the request
        const apiKeyInfo = provider.apiKeys[selectedKeyIndex];
        const currentApiKey = apiKeyInfo.key;
        provider.currentKeyIndex = selectedKeyIndex; // Record the currently used key
    
        const requestUrl = `${provider.apiUrl.replace(":generateContent", ":streamGenerateContent")}?key=${currentApiKey}&alt=sse`;
        
        // ==================== MODIFICATION START ====================
        const systemPrompt = `You are an elite-tier 'Explainer' and 'Problem-Solver' AI. Your core talent is making complex topics feel intuitive and actionable, regardless of the domain (from math and logic to life advice and technical support). You don't just provide answers; you provide understanding.

Apply your core talent to the following user query. You must follow this structure for complex queries:

1. Frame the Problem: Start by acknowledging the user's query and briefly reframe it to highlight the core principle or the real challenge behind it.

2. Establish the 'First Principle': Before providing a solution, explain the single most important concept, rule, or mindset needed to understand it. This is the 'Aha!' moment.

3. Provide a Step-by-Step Breakdown: Offer a clear, numbered list of steps. For each step, include both the 'Action (What to do)' and the 'Rationale (Why we do it)'. Use analogies where possible.

4. Synthesize & Generalize: After the solution, connect the specific steps back to the 'First Principle' and explain how this method can be applied to other similar problems.

5. Proactive Wrap-up: Conclude with a concise summary and anticipate a potential next question, a common pitfall, or an advanced tip.

Adaptive Simplicity Clause: For straightforward factual questions, bypass this structure and provide a direct, accurate answer.`;
        
        const requestBody = JSON.stringify({
            contents: purifiedMessages.filter(msg => msg.role !== "system").map(msg => ({
                role: msg.role === "assistant" ? "model" : msg.role,
                parts: [{ text: msg.content }]
            })),
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              "temperature": 0.7,
              "topP": 0.95,
              "topK": 64,
              "maxOutputTokens": 8192
            }
        });
        // ==================== MODIFICATION END ====================
    
        const response = await fetch(requestUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
            agent: agent,
        });
    
        // 3. Update the key's status based on the response
        if (response.ok) {
            // Success, set the next starting point to the next key
            provider.currentKeyIndex = (selectedKeyIndex + 1) % totalKeys;
            return response;
        }
    
        if (response.status === 429) { // Rate limit exceeded
            console.warn(`Gemini API key at index ${selectedKeyIndex} is rate-limited. Placing it on cooldown for 1 minute.`);
            apiKeyInfo.status = 'cooldown';
            apiKeyInfo.cooldownUntil = Date.now() + 60 * 1000; // 1-minute cooldown
        } else if (response.status === 400) { // Invalid key
            console.error(`Gemini API key at index ${selectedKeyIndex} is INVALID. Marking as permanently disabled.`);
            apiKeyInfo.status = 'disabled'; // Permanently disable
        }
        
        // 4. Immediately try again by calling itself to find the next available key
        return fetchWithGeminiFailover(provider, purifiedMessages);
    }

    try {
      const {
        messages,
        apiId
      } = req.body;

      // Context purification logic
      const purifiedMessages = messages.map(message => {
        if (message.role === 'assistant') {
          try {
            const parsedContent = JSON.parse(message.content);
            if (parsedContent && typeof parsedContent === 'object' && parsedContent.hasOwnProperty('answer')) {
              return { ...message, content: parsedContent.answer };
            }
          } catch (e) {
            // Not a valid JSON or not the structure we expect, keep original content
          }
        }
        return message;
      });

      const provider = apiPool[apiId];
      if (!provider) throw new Error("无效的 API ID");
      const {
        type,
        apiUrl
      } = provider;
      
      let response;

      if (type === "gemini") {
          response = await fetchWithGeminiFailover(provider, purifiedMessages);
      } else if (type === "deepseek-chat" || type === "deepseek-reasoner") {
          const requestUrl = apiUrl;
          const requestBody = JSON.stringify({
            model: type,
            messages: purifiedMessages,
            stream: true
          });
          response = await fetch(requestUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${provider.apiKey}`
            },
            body: requestBody,
            agent: agent,
        });
      } else {
          throw new Error("该模型类型不支持流式输出");
      }

      if (!response || !response.ok) {
        const errorText = response ? await response.text() : "No successful response after all retries.";
        throw new Error(`API request failed: ${errorText}`);
      }
      
      for await (const chunk of response.body) {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);
            if (data.trim() === "[DONE]") continue;
            try {
              const parsedData = JSON.parse(data);
              let thoughtChunk = "",
                answerChunk = "";
              if (type === "gemini") {
                answerChunk = parsedData?.candidates?.[0]?.content?.parts?.[0]?.text;
              } else if (type.startsWith("deepseek")) {
                thoughtChunk = parsedData?.choices?.[0]?.delta?.reasoning_content;
                answerChunk = parsedData?.choices?.[0]?.delta?.content;
              }
              if (taskStorage[taskId]) {
                if (thoughtChunk) taskStorage[taskId].fullThought += thoughtChunk;
                if (answerChunk) taskStorage[taskId].fullAnswer += answerChunk;
              }
            } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (error) {
        let errorMessage = error.message;
        if (error.message === "GEMINI_ALL_KEYS_IN_COOLDOWN") {
            errorMessage = "模型服务暂时过载，请稍后再试 (所有API密钥均在冷却中)。";
        }
        console.error(`[后台任务 ${taskId} 失败]:`, errorMessage);
        if (taskStorage[taskId]) {
            taskStorage[taskId].error = errorMessage;
        }
    } finally {
      if (taskStorage[taskId]) {
        taskStorage[taskId].done = true;
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        // [CORE LOGIC] Persist the standardized assistant message
        if (sessionId) {
          const finalMessageData = {
            thought: taskStorage[taskId].fullThought,
            answer: taskStorage[taskId].fullAnswer,
            duration: duration
          };
          const finalContentString = JSON.stringify(finalMessageData);

          db.run("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            [sessionId, 'assistant', finalContentString],
            function(err) {
              if (err) {
                console.error(`[DB Error] Failed to save assistant message for session ${sessionId}:`, err.message);
              }
            }
          );
        }

        setTimeout(() => {
          delete taskStorage[taskId];
        }, 300000);
      }
    }
  })();
});

apiRouter.get("/chat-poll/:taskId", (req, res) => {
  const {
    taskId
  } = req.params;
  const task = taskStorage[taskId];
  if (!task) {
    return res.status(404).json({
      error: "任务不存在或已过期",
      fullThought: "",
      fullAnswer: "",
      done: true
    });
  }
  // 每次都返回完整内容，让前端自己判断差异
  res.json({
    fullThought: task.fullThought,
    fullAnswer: task.fullAnswer,
    done: task.done,
    error: task.error,
  });
});

app.use("/api", apiRouter);
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, () => {
  console.log(`[INFO] 服务器已启动，正在 http://localhost:${PORT} 上运行`);
});