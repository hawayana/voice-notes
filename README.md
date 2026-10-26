# 💡 語音速記

手機／iPad／Mac 打開就能講，AI（Gemini）轉文字並整理，存成 `.md`，最後自動進到
`hawayana-agent/100_Todo/voice-notes/`。

```
手機 App（GitHub Pages 上的 PWA）
  │ 錄音 16 kHz WAV／或打字（網路斷了先存在手機，之後自動重送）
  ▼
Google Apps Script（apps-script/Code.gs）
  │ Gemini 轉文字＋整理 → 寫 .md 到 Google Drive「voice-notes」，錄音 .wav 存「voice-notes-audio」
  ▼
Mac launchd 每 5 分鐘（mac/voice_notes_mover.sh）
  │ rclone：gdrive:voice-notes → onedrive:hawayana-agent/100_Todo/voice-notes
  ▼
OneDrive 同步到 Mac → hawayana-agent 收件匣
```

## 檔案

| 路徑 | 用途 |
| --- | --- |
| `docs/` | 前端 PWA（GitHub Pages 從這裡發布） |
| `apps-script/Code.gs` | 後端，貼到 script.google.com |
| `mac/voice_notes_mover.sh` | Drive → OneDrive 搬檔；由 `~/Library/LaunchAgents/com.hawayana.voice-notes-mover.plist` 每 5 分鐘執行 |

## 一次性設定

### 1. 申請 Gemini API key
到 <https://aistudio.google.com/apikey> → Create API key → 複製。
> 免費額度的資料 Google 可能拿去改進模型；未發表的研究內容建議在 AI Studio 綁定帳單（用量很小，費用極低）。

### 2. 建立 Apps Script 後端
1. 到 <https://script.google.com> → 新專案，命名「語音速記」
2. 把 `apps-script/Code.gs` 全部內容貼上取代預設程式碼 → 儲存
3. 左側 ⚙️ 專案設定 → 最下方「指令碼屬性」→ 新增：
   - `GEMINI_API_KEY`：步驟 1 的 key
   - `TOKEN`：自己訂一組通關密語（例如一串英數字）
4. 右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」
   - 執行身分：**我**
   - 誰可以存取：**所有人**
5. 按部署 → 授權（會出現「Google 尚未驗證」→ 進階 → 前往語音速記）
6. 複製「網頁應用程式網址」（結尾是 `/exec`）

> 之後改了 Code.gs，要用「管理部署作業」→ 編輯 → 版本選「新版本」，網址才會維持不變。

### 3. 發布前端到 GitHub Pages
1. GitHub 建立空的 repo `voice-notes`（Public，不要勾 README）
2. 推上去（由 Claude 協助）
3. repo → Settings → Pages → Branch: `main`、資料夾 `/docs` → Save
4. 幾分鐘後網址：`https://hawayana.github.io/voice-notes/`

repo 公開的只有程式碼；Apps Script 網址和 TOKEN 只存在各裝置的瀏覽器裡。

### 4. 讓 Mac 能從 Google Drive 搬檔
在終端機執行一次（會開瀏覽器登入 Google）：

```bash
/opt/homebrew/bin/rclone config create gdrive drive scope=drive
```

### 5. 每台裝置
1. 打開 `https://hawayana.github.io/voice-notes/`
2. ⚙️ 填 Apps Script 網址、TOKEN、裝置名稱 → 測試連線 → 儲存
3. 加到主畫面
   - Galaxy S25（Chrome）：右上 ⋮ →「加到主畫面／安裝應用程式」
   - iPad（Safari）：分享 →「加入主畫面」
4. 第一次按錄音會問麥克風權限 → 允許

## 筆記格式

```markdown
---
title: "DDR1 抑制劑用在 NP cell"
created: 2026-10-25T14:32:05-04:00
device: Galaxy S25
source: voice
duration_sec: 42
audio: https://drive.google.com/file/d/…
tags: [DDR1, 實驗想法]
status: inbox
---

# DDR1 抑制劑用在 NP cell

🎧 [原始錄音](https://drive.google.com/file/d/…)

（AI 整理後的內容）

## 原始逐字稿

（原話）
```

## 疑難排解
- 搬檔紀錄：`~/Library/Logs/voice_notes_mover.log`
- 手機顯示「📮 還有 N 則等待上傳」：按「重試」，或下次打開 App 會自動重送
- 想改專有名詞字典：Apps Script 指令碼屬性加 `DICTIONARY`（逗號分隔）
- 想換模型：指令碼屬性加 `GEMINI_MODEL`
