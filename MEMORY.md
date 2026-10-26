# 語音速記 記憶索引

> 這是索引，不是倉庫：現況寫這裡，過程與細節寫子檔，超過約 150 行就拆檔。
> 建立：2026-10-26。repo 公開，這裡不寫任何密碼、key、網址。

## 現況（2026-10-26 上線）
- 手機錄音 → Apps Script → Gemini 轉文字＋整理 → Google Drive
  - 筆記 `.md` →「我的雲端硬碟/voice-notes/」
  - 錄音 `.wav` →「我的雲端硬碟/voice-notes-audio/」，筆記 frontmatter 的 `audio:` 與內文 🎧 連結指向它
- Mac 端不用這個 App：直接按兩下 Fn 用系統聽寫輸入
- 已安裝：Galaxy S25（Chrome，加到主畫面）；iPad 尚未確認

## 各部分在哪裡
| 東西 | 位置 |
| --- | --- |
| 程式碼 | `~/Projects/voice-notes/`（本機）＋ GitHub `hawayana/voice-notes`（公開） |
| 手機 App 網址 | `https://hawayana.github.io/voice-notes/`（GitHub Pages，main 分支 `/docs`） |
| 後端 | script.google.com 專案「語音速記」，網頁應用程式，執行身分：我，存取：所有人 |
| 後端網址 | Apps Script →「部署」→「管理部署作業」→ 網頁應用程式網址（結尾 `/exec`） |
| 密碼類設定 | Apps Script → ⚙️ 專案設定 → 指令碼屬性：`GEMINI_API_KEY`、`TOKEN`（手機 App ⚙️ 也存一份 TOKEN） |
| Gemini key | Google AI Studio，掛在 Cloud 專案「My First Project」（不要用 UVA-budget） |
| 可選屬性 | `GEMINI_MODEL`、`FOLDER_NAME`、`AUDIO_FOLDER_NAME`、`DICTIONARY`（專有名詞，逗號分隔） |

## 設計決策（為什麼這樣做）
- **前端放 GitHub Pages，不用 Apps Script 自己的網頁**：Apps Script 網頁跑在沙盒 iframe，拿不到麥克風
- **錄成 16 kHz 單聲道 WAV**：Android Chrome 預設的 webm 不在 Gemini 正式支援清單；WAV 最穩。1 分鐘約 2 MB，上限 5 分鐘（避免超過 Gemini inline 20 MB）
- **手機先存 IndexedDB 再上傳**：沒網路或失敗時想法不會丟，下次開 App 自動補送
- **POST 不設 Content-Type**：讓瀏覽器用 text/plain，避開 Apps Script 不支援的 CORS preflight
- **用 TOKEN 保護**：網址設「所有人」才能從手機直接呼叫，所以靠 TOKEN 擋陌生請求
- **Gemini 主力 `gemini-3.8-flash`，忙線改用 3.6 Flash → 2.5 Flash**：轉錄＋整理用 Flash 就夠，Pro 慢又容易碰額度；準確度主要靠 `DICTIONARY`
- **筆記只留在 Drive，不自動進 vault（方案 B，使用者 2026-10-26 決定）**：不想所有東西都跟 vault 混在一起；需要時請 Claude 從 Drive 讀出來轉過去，或之後在 Drive 另開 vault

## 踩過的坑
- **Gemini 忙線（high demand）** → 後端加了重試與備用模型
- **同一則被處理 7 次、產生重複檔**：手機沒收到回應（App 切到背景、或瀏覽器分頁＋主畫面 App 兩個視窗同時送）就重送 → 後端加 LockService＋「處理中」標記，前端用 `navigator.locks` 讓多視窗只有一個上傳，收到 processing 30 秒後再確認
- **「重試」按了沒反應**：上一次上傳還沒結束時被靜默忽略 → 改成顯示提示、加 150 秒逾時、單則失敗不擋其他、可逐則刪除
- **指令碼屬性填反**：曾把 key 填在「屬性」欄 → 左邊是名稱（`TOKEN`），右邊才是值
- **改了 Code.gs 卻沒生效**：一定要「管理部署作業 → ✏️ → 建立新版本」；不要「新增部署作業」（網址會變）
- **macOS 不讓 launchd 讀 `~/Library/CloudStorage`**（Operation not permitted）：腳本不能放 OneDrive／Drive 資料夾裡執行；雲端互搬改用 rclone 遠端。使用者另外兩個備份排程也有同樣問題（另開任務處理）
- **Mac 的 `rm` 是 `trash` 的 alias**；Drive 裡 Apps Script 建的檔案本機刪不掉 → 用 Google Drive 連接器 `trash_file`

## 待辦／注意
- [ ] 確認 Apps Script 已部署含 `LockService` 的版本（防重複）
- [ ] iPad 安裝（Safari → 分享 → 加入主畫面）
- rclone 的 `gdrive:` 遠端是用 rclone 共用 client_id 建的，2026 年內會失效；目前沒用到（自動搬檔已停用），要重新啟用搬檔時需先建自己的 Google OAuth client_id（https://rclone.org/drive/#making-your-own-client-id）
