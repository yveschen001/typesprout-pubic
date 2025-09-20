import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initI18n } from './libs/i18n'
import { supportedLangs, defaultLang, isRtl } from './config/app'
import { analytics } from './config/analytics'

const LangGuard = ({ children }: { children: React.ReactNode }) => {
  const urlLang = location.pathname.split('/')[1]
  if (!supportedLangs.includes(urlLang as any)) {
    const browserLang = (navigator.language || defaultLang)
    const short = String(browserLang || '').slice(0,2)
    const map: Record<string, string> = { zh: 'zh-TW', en: 'en-US' }
    const guess = map[short] || defaultLang
    return <Navigate to={`/${guess}/`} replace />
  }
  // 設定方向（包含 RTL）
  try {
    const html = document.documentElement
    const l = urlLang || defaultLang
    html.setAttribute('lang', l)
    html.setAttribute('dir', isRtl(l) ? 'rtl' : 'ltr')
  } catch {}
  // 尊重玩家選擇：若 URL 已含語言，就以 URL 為準
  return <>{children}</>
}

// 初始化 i18n（根據目前 URL 語言或預設）
const urlLang0 = location.pathname.split('/')[1]
const initialLng = (supportedLangs as readonly string[]).includes(urlLang0) ? (urlLang0 as any) : defaultLang
initI18n(initialLng as any)

const router = createBrowserRouter([
  { path: '/', element: <LangGuard><Navigate to={`/${(navigator.language||defaultLang).startsWith('zh')?'zh-TW':'en-US'}/`} replace /></LangGuard> },
  { path: '/:lang/*', element: (<LangGuard><App /></LangGuard>) },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>
  </StrictMode>,
)

// Analytics init (mutually exclusive toggles per .cursorrules)
if (typeof window !== 'undefined') {
  analytics.init()
}
