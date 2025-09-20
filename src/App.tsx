import { Outlet, Link, useParams, Navigate, useRoutes } from 'react-router-dom'
import { useEffect } from 'react'
// i18n 初始化改到 src/main.tsx 避免在渲染時變更狀態
import { supportedLangs } from './config/app'
import AuthWidget from './features/auth'
import { langChildRoutes } from './app/routes'
import './App.css'
import Layout from './app/Layout'
import A11yPanel from './dev/A11yPanel'
import { useTranslation } from 'react-i18next'

function App() {
  const { lang } = useParams()
  const supported = supportedLangs as readonly string[]
  if (!lang || !supported.includes(lang)) {
    return <Navigate to="/en-US/" replace />
  }
  const { t, i18n } = useTranslation()
  // URL 切換語言時，同步 i18n 當前語言
  useEffect(() => {
    try { if (lang && i18n.language !== lang) void i18n.changeLanguage(lang) } catch {}
  }, [lang, i18n])

  return (
    <div className="max-w-[960px] mx-auto px-4">
      <a href="#content" className="sr-only focus:not-sr-only">Skip to main content</a>
      <nav className="sr-only focus:not-sr-only">
        <a href="#primary-nav">Skip to primary navigation</a>
      </nav>
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4">
          <Link to={`/${lang}/`} className="no-underline">
            <h1 className="brand-title text-[24px] leading-none">TypeSprout
              <div className="brand-subtitle mt-0.5 text-[13px] font-medium text-[var(--color-muted,#6b7280)]">{(lang||'en-US').startsWith('zh') ? '兒童打字與種樹成長' : 'Kids Typing & Tree Growth'}</div>
            </h1>
          </Link>
          <nav id="primary-nav" className="flex items-center gap-3" aria-label="Primary">
            <Link to={`/${lang}/test`}>{t('nav.test')}</Link>
            <Link to={`/${lang}/leaderboard`}>{t('nav.leaderboard')}</Link>
            <Link to={`/${lang}/garden`}>{t('nav.garden')}</Link>
          </nav>
        </div>
        <AuthWidget />
      </header>
      <main id="content" className="py-2 pb-8">
        <Layout>
          {useRoutes(langChildRoutes)}
        </Layout>
      </main>
      {import.meta.env.DEV && <A11yPanel />}
    </div>
  )
}

export default App
