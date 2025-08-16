#!/bin/bash 定义路径和名称
BACKUP_PATH="$HOME/备份/deepseek-local-test" PROJECT_PATH="$HOME/deepseek-local-test" 
APP_NAME="deepseek-app" echo "开始执行一键恢复脚本..."
# 1. 检查备份是否存在
if [ ! -d "$BACKUP_PATH" ]; then echo "❌ 恢复失败！找不到备份文件夹: '$BACKUP_PATH'" exit 
  1
fi echo "--> 停止 PM2 应用: $APP_NAME..." pm2 stop "$APP_NAME"
# 2. 关键一步：先回到主目录，才能安全地删除整个项目文件夹
echo "--> 准备清理当前项目..." cd ~
# 3. 删除当前的项目文件夹
echo "--> 正在删除: '$PROJECT_PATH'..." rm -rf "$PROJECT_PATH"
# 4. 从备份位置复制回来
echo "--> 正在从备份恢复: '$BACKUP_PATH'..." cp -r "$BACKUP_PATH" .
# 5. 进入恢复后的项目目录
echo "--> 进入恢复后的目录并安装依赖..." cd "$PROJECT_PATH" npm install
# 6. 重启应用
echo "--> 重启 PM2 应用: $APP_NAME..." pm2 restart "$APP_NAME"
echo "✅ 恢复成功！项目已从备份中恢复并重启。"
