# 語音速記（voice-notes）

## 目標
手機（Galaxy S25）／iPad／Mac 打開就能講，Gemini 轉文字並整理成 `.md`，連同原始錄音存到 Google Drive。
只服務 hawayana 一個人，求簡單、穩定、免費或極低成本。

## 目錄結構
| 路徑 | 內容 | 改了之後 |
| --- | --- | --- |
| `docs/` | 前端 PWA（index.html、app.js、sw.js、manifest、icon） | push 到 GitHub → Pages 自動發布；改 app.js／index.html 要把 `sw.js` 的 `VERSION` 加一 |
| `apps-script/Code.gs` | 後端（Google Apps Script） | **使用者要手動**貼到 script.google.com 並「管理部署作業 → 編輯 → 建立新版本」 |
| `mac/voice_notes_mover.sh` | 已停用的 Drive → vault 搬檔腳本 | 不用動 |
| `README.md` | 給使用者看的安裝與使用說明 | |
| `MEMORY.md` | 設計決策、踩過的坑、待辦 | 有新決策就寫回 |

## 慣例
- 回覆與註解用繁體中文；檔名英文、不含空格
- **這個 repo 是公開的**：不得寫入 TOKEN、Gemini API key、Apps Script 網址或任何個人資料
- 前端不引入框架或建置工具，維持純 HTML/JS，方便手機直接載入
- 改後端時，明確告訴使用者「這次要更新 Apps Script」並附步驟；只改前端時告訴他「手機重新整理即可」
- 測試前端：本機起 `python3 -m http.server`（docs/）＋假後端，不要拿使用者真的 TOKEN 測

## 記憶
- 本專案長期記憶：`./MEMORY.md`（開始前先讀，有新決策或糾正時寫回）
