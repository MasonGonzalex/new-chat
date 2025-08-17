#!/bin/bash

# backup_gdrive.sh

# This script backs up the chat_app.db file to a Google Drive remote using rclone.
# It creates a timestamped local copy, uploads it, and then cleans up old backups.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# The database file to back up
DB_FILE="./chat_app.db"
# The name of your rclone remote for Google Drive
RCLONE_REMOTE="gdrive_backup"
# The directory on Google Drive to store backups
REMOTE_DIR="/new-chat-backups/"
# --- End of Configuration ---

# Check if the database file exists
if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file not found at $DB_FILE"
    exit 1
fi

# Create a timestamp
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_FILE="chat_app_backup_${TIMESTAMP}.db"

echo "--- Starting Backup Process: $(date) ---"

# 1. Create a safe, timestamped local copy of the database
echo "Step 1: Creating local temporary backup: $BACKUP_FILE"
cp "$DB_FILE" "$BACKUP_FILE"
echo "Local backup created successfully."

# 2. Upload the backup file to Google Drive using rclone
echo "Step 2: Uploading $BACKUP_FILE to ${RCLONE_REMOTE}:${REMOTE_DIR}"
rclone copy "$BACKUP_FILE" "${RCLONE_REMOTE}:${REMOTE_DIR}"
echo "Upload completed successfully."

# 3. Clean up the local temporary backup file
echo "Step 3: Removing local temporary backup file: $BACKUP_FILE"
rm "$BACKUP_FILE"
echo "Local temporary file removed."

# 4. Clean up old backups on Google Drive (older than 7 days)
echo "Step 4: Deleting remote backups older than 7 days..."
rclone delete --min-age 7d "${RCLONE_REMOTE}:${REMOTE_DIR}"
echo "Remote cleanup completed."

echo "--- 备份成功: $(date) ---"