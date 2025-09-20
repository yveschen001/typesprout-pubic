# TypeSprout — Kids Typing & Tree Growth

## 開發
- Node: 22（本庫含 `.nvmrc`）
- 安裝：`npm i`
- 啟動：`nvm use 22 && npm run dev`

## .env
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=
VITE_ADS_ENABLED=false
VITE_SHEETS_CONTENT_URL=
VITE_SHEETS_COUNTERS_URL=
VITE_USE_GA=false
VITE_USE_CF=false
VITE_GA_ID=
VITE_CF_TOKEN=
VITE_SHEETS_CONTENT_URL=
VITE_SHEETS_UI_URL=
VITE_SHEETS_ADMIN_TOKEN=
```

## Firebase
- Console 啟用 Auth(Google)；Firestore 建庫（Production）
- 規則：`firebase.rules` 內容貼到 Console 規則頁
- 建議索引（Console → Firestore → Indexes 建立）：
  - attempts: `(lang ASC, ts DESC)`
  - attempts: `(uid ASC, ts DESC)`
  - attempts: `(lang ASC, adjWpm DESC, ts DESC)`
  - leaderboards: `(period ASC, lang ASC, scopeId ASC)`
  - economyLogs: `(uid ASC, ts DESC)`
  若查詢報 `FAILED_PRECONDITION: index-needed`，Console 會提供建立連結，或依上列手動建立。
  範例連結格式（僅供參考，實際以 Console 顯示為準）：
  `https://console.firebase.google.com/project/<PROJECT_ID>/firestore/indexes?create_composite=CmFwcm9qZWN0cy8<PROJECT_ID>/databases/(default)/collectionGroups/attempts/indexes~2Fcomposite~2FqueryScope~3D"COLLECTION"~26fields~3D~255B~257B~2522fieldPath~2522~253A~2522lang~2522~252C~2522order~2522~253A~2522ASCENDING~2522~257D~252C~257B~2522fieldPath~2522~253A~2522adjWpm~2522~252C~2522order~2522~253A~2522DESCENDING~2522~257D~252C~257B~2522fieldPath~2522~253A~2522ts~2522~252C~2522order~2522~253A~2522DESCENDING~2522~257D~255D`

## 產生 sitemap/robots
- `SITE_BASE=https://<your-domain> node scripts/gen-sitemap-robots.mjs`

## 多語與 SEO
- 路由 `/{lang}/...`，支援 zh-TW/zh-CN/en-US
- 使用 react-helmet-async 設定每頁 `<title>/<meta>`；輸出 hreflang/canonical 與 JSON-LD（SoftwareApplication / LearningResource）

## UI 指南
- 規範檔：`docs/ui-guidelines.md`（已由 `.cursorrules` 引用與強化）
- 共用元件：`src/components/Button.tsx` 作為按鈕樣式參考

## 部署（GitHub Pages）
- 建議使用 Actions，自行上傳 `dist` 亦可
- 基礎命令：`npm run build` → `dist/` 上傳

### GitHub Pages 自動部署
1. 建立 GitHub repo，推送本專案到 `main`
2. 在 repo Settings → Pages 設為「GitHub Actions」
3. 在 Settings → Secrets and variables → Actions 新增下列 Secrets：
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`（可空）
   - `VITE_ADS_ENABLED`（預設 `false`）
   - `VITE_ADS_CHILD_DIRECTED`（預設 `true`）
   - `SITE_BASE`（如 `https://<user>.github.io/<repo>`，用於 sitemap/robots 與 canonical/hreflang）
   - `PUBLIC_BASE`（如 `/<repo>/`，供 Vite base 使用）
4. 推送到 `main` 後，Actions 會自動建置與部署；完成後在 Pages 頁面會顯示公開網址

### SEO（JSON-LD / hreflang / canonical）
- 在 `.env` 設定 `VITE_SITE_BASE=https://<domain>` 後，`src/adapters/seo/Seo.tsx` 會自動為每頁注入：
  - `<title>` / `<meta name=description>`
  - `<link rel=canonical>` 指向對應語言的路徑
  - `<link rel=alternate hreflang=...>` 對所有支援語言輸出 alternate
  - JSON-LD（SoftwareApplication）
### Analytics（GA4 / Cloudflare）
- 於 `.env` 設定 `VITE_USE_GA=true` 或 `VITE_USE_CF=true`（互斥）；同時為 `true` 時，程式將警告並僅啟用 GA4。
- GA4 採 Consent Mode 預設：`ad_storage/ad_user_data/ad_personalization=denied`，且 `allow_google_signals=false`、`allow_ad_personalization_signals=false`、`ads_data_redaction=true`。

### 題庫維護（Google 表單 + Apps Script）
- 透過 Google 表單寫入試算表，Apps Script Web App 輸出 JSON 端點；將 URL 填入 `.env` 的 `VITE_SHEETS_CONTENT_URL` / `VITE_SHEETS_UI_URL`。
- 若未配置，前端會回退到 `content/` 內的示例 JSON。
- GAS 端點部署：見 `gas/README.md`，部署後複製 `/exec` 填入上述環境變數；`VITE_SHEETS_ADMIN_TOKEN` 供 Admin 批量在地化使用。
  - 首頁示例見 `src/pages/Home.tsx` 使用 `<Seo .../>` 的方式
