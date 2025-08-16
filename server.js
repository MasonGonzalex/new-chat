// server.js (Final Stable Version - Polling Logic Corrected)
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

const PORT = process.env.PORT || 3000;
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
  apiPool[apiId] = {
    id: apiId,
    name: process.env[`API_${i}_NAME`],
    type: process.env[`API_${i}_TYPE`],
    apiKey: process.env[`API_${i}_KEY`],
    apiUrl: process.env[`API_${i}_URL`],
  };
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
      const formattedMessages = [systemMessage, ...messages];
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
    try {
      const {
        messages,
        apiId
      } = req.body;
      const provider = apiPool[apiId];
      if (!provider) throw new Error("无效的 API ID");
      const {
        type,
        apiUrl,
        apiKey
      } = provider;
      let requestUrl, requestBody;

      if (type === "gemini") {
        requestUrl = `${apiUrl.replace(":generateContent", ":streamGenerateContent")}?key=${apiKey}&alt=sse`;
        requestBody = JSON.stringify({
          model: "gemini-2.5-pro",
          contents: messages.filter(msg => msg.role !== "system").map(msg => ({
            role: msg.role === "assistant" ? "model" : msg.role,
            parts: [{
              text: msg.content
            }]
          }))
        });
      } else if (type === "deepseek-chat" || type === "deepseek-reasoner") {
        requestUrl = apiUrl;
        requestBody = JSON.stringify({
          model: type,
          messages: messages,
          stream: true
        });
      } else {
        throw new Error("该模型类型不支持流式输出");
      }

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: type.startsWith("deepseek") ? `Bearer ${apiKey}` : undefined
        },
        body: requestBody,
        agent: agent,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 返回错误: ${errorText}`);
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
      console.error(`[后台任务 ${taskId} 失败]:`, error.message);
      if (taskStorage[taskId]) taskStorage[taskId].error = error.message;
    } finally {
      if (taskStorage[taskId]) {
        taskStorage[taskId].done = true;
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