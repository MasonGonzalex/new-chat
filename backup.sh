#!/bin/bash 定义备份目录的路径
BACKUP_DIR="$HOME/备份" SOURCE_DIR_NAME="deepseek-local-test" echo 
"开始执行一键备份脚本..."
# 1. 创建备份的根目录（如果它不存在的话） -p 选项确保即使目录已存在也不会报错
echo "--> 确保备份目录 '$BACKUP_DIR' 存在..." mkdir -p "$BACKUP_DIR"
# 2. 为了保证是全新备份，先删除旧的备份文件夹（如果存在）
echo "--> 清理旧的备份（如果存在）..." rm -rf "$BACKUP_DIR/$SOURCE_DIR_NAME"
# 3. 将当前项目文件夹完整地复制到备份目录 cp -r 表示递归复制（复制整个文件夹） `.` 
# 代表当前目录
echo "--> 正在将当前项目完整复制到 '$BACKUP_DIR'..." cp -r . "$BACKUP_DIR/$SOURCE_DIR_NAME" 
if [ $? -eq 0 ]; then
  echo "✅ 备份成功！当前项目状态已完整保存到 '$BACKUP_DIR/$SOURCE_DIR_NAME'" else echo "❌ 
  备份失败！请检查权限或路径问题。" exit 1
fi
