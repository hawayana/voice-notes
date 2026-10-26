@AGENTS.md

## Claude Code 專屬
- 專屬 skill 放 `.claude/skills/`，名稱加專案前綴（同名時個人層 skill 會優先於專案層）
- 記憶只讀寫 `./MEMORY.md`，不寫入個人 vault 的記憶
- 需釐清需求時可用 AskUserQuestion
- 沒辦法寫入使用者的剪貼簿（pbcopy 無效）：要使用者複製程式碼時，給 GitHub 檔案連結請他按「Copy raw file」
