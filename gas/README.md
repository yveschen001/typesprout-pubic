# TypeSprout – Google Apps Script (GAS) Endpoints

本資料夾僅做說明與紀錄（不需 clasp）。你可以直接在 Google Apps Script 建立專案、貼上 `Code.gs` 內容，並部署成 Web App，然後把產生的 `/exec` URL 放入前端 `.env`：

VITE_SHEETS_CONTENT_URL=
VITE_SHEETS_UI_URL=
VITE_SHEETS_ADMIN_TOKEN=

步驟
1. 進入 Google Drive → 新增 → 更多 → Apps Script。
2. 將 `Code.gs` 內容複製貼上（會提供 `doGet/doPost` 與 `apiContent_/apiUI_`）。
3. 左側「專案設定」→ 新增 `OPENAI_API_KEY`（如需在地化）、在程式碼中設定 `ADMIN_TOKEN`（或改為使用 Property）。
4. 發布 Web App：
   - 選單：部署 → 新增部署 → 類型選「網路應用程式」。
   - 存取權限選「任何知道連結的人」。
   - 部署後複製 `/exec` URL。
5. 將 URL 貼到前端 `.env`：
   - `VITE_SHEETS_CONTENT_URL=<你的 /exec>`（內容題庫端點）
   - `VITE_SHEETS_UI_URL=<你的 /exec>`（UI 在地化端點）
   - `VITE_SHEETS_ADMIN_TOKEN=<你設定的管理 Token>`（僅 Admin 批量在地化用）

端點說明（最小）
- GET `?type=content&lang=zh-TW&grade=3&limit=200&after=<id>`
- GET `?type=ui&lang=zh-TW`
- POST `/exec` Body：`{ action:"localize", token:"<ADMIN_TOKEN>", source:"zh-TW", target:"en-US", rows:[{text:"..."}] }`

部署成功後，前端會在 Practice/Test 非阻塞讀取題庫、i18n 初始化階段嘗試取回 UI 文案（失敗則回退到本地）。
