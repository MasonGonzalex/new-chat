#!/bin/bash =============================================== == 一键回滚到指定 Git 
# 标签的脚本 == =============================================== --- 配置 --- 设置你的 PM2 
# 应用名称
APP_NAME="deepseek-app"
# --- 脚本开始 ---
echo "开始执行一键回滚脚本..."
# 第1步：检查是否提供了版本标签作为参数
if [ -z "$1" ]; then echo "错误：请输入要回滚的版本标签！" echo "例如: ./rollback.sh 
  v1.0-stable" exit 1
fi TARGET_TAG="$1" echo "目标版本: $TARGET_TAG"
# 第2步：确保在主分支上
echo "--> 切换到 main 分支..." git checkout main if [ $? -ne 0 ]; then echo "错误：切换到 
  main 分-支失败。请检查 Git 状态。" exit 1
fi
# 第3步：从远程获取最新的信息，包括所有标签
echo "--> 从远程仓库获取最新信息..." git fetch origin --tags if [ $? -ne 0 ]; then echo 
  "错误：获取远程信息失败。" exit 1
fi
# 第4步：硬重置到目标标签
echo "--> 将本地仓库硬重置到标签: $TARGET_TAG..." git reset --hard "$TARGET_TAG" if [ $? 
-ne 0 ]; then
  echo "错误：重置到标签 $TARGET_TAG 失败。请确认标签存在。" exit 1 fi
# 第5步：清理工作目录
echo "--> 清理工作目录 (删除 node_modules, .db 等)..." git clean -dfx if [ $? -ne 0 ]; then 
  echo "错误：清理工作目录失败。" exit 1
fi
# 第6步：安装依赖
echo "--> 重新安装 Node.js 依赖..." npm install if [ $? -ne 0 ]; then echo "错误：'npm 
  install' 失败。" exit 1
fi
# 第7步：重启 PM2 应用
echo "--> 重启 PM2 应用: $APP_NAME..." pm2 restart "$APP_NAME" if [ $? -ne 0 ]; then echo 
  "错误：重启 PM2 应用失败。" exit 1
fi
echo "✅ 回滚成功！应用 '$APP_NAME' 已成功回滚到版本 '$TARGET_TAG' 并重启。"
