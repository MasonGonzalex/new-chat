// ecosystem.config.js (最终正确版)
module.exports = {
  apps: [{
    name: 'deepseek-app',
    script: 'server.js',
    
    // 【关键】我们现在就把它配置好，为下一步做准备
    env: {
      "NODE_ENV": "production",
      "HTTP_PROXY": "http://127.0.0.1:20171",
      "HTTPS_PROXY": "http://127.0.0.1:20171",
    }
  }]
};