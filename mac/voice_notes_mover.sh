#!/bin/bash
# 把手機「語音速記」App 存到 Google Drive 的 .md，搬進 OneDrive 上 hawayana-agent 的收件匣
# 用 rclone 雲端對雲端直接搬：launchd 背景程式沒有權限碰 ~/Library/CloudStorage（macOS 隱私保護），
# 所以本腳本也刻意不放在 OneDrive 資料夾裡。搬走後 Drive 上那份會刪掉（Drive 只當中繼站）

RCLONE="/opt/homebrew/bin/rclone"
SRC="gdrive:voice-notes"
DEST="onedrive:hawayana-agent/100_Todo/voice-notes"
LOG_FILE="/Users/hawayana/Library/Logs/voice_notes_mover.log"

if ! "$RCLONE" listremotes | grep -q '^gdrive:$'; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') 尚未設定 rclone 的 gdrive 遠端，跳過" >> "$LOG_FILE"
    exit 0
fi

"$RCLONE" move "$SRC" "$DEST" --include "*.md" --log-file="$LOG_FILE" --log-level INFO
