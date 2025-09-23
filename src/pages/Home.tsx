import { Link, useParams } from 'react-router-dom'
import AuthWidget from '../features/auth'
import { useEffect, useState } from 'react'
import { getTotalUsersAllTime, getAttemptsWindow, trimmedMean, getCountryCounts } from '../adapters/firestore/stats'
import AdsSlot from '../components/AdsSlot'
import WorldMap from '../components/WorldMap'
import Tooltip from '../components/Tooltip'
import { useAuth } from '../features/auth/hooks'
import { db } from '../libs/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { Users, Keyboard, BarChart3, Trophy, Globe, ChevronRight } from 'lucide-react'
import Seedling from '../features/seedling/Seedling'
import { loadGarden } from '../features/garden/api'
import { useTranslation } from 'react-i18next'
import { debugLog } from '../utils/debug'

export default function Home() {
  const { lang } = useParams()
  const L = lang || 'en-US'
  const { t } = useTranslation()
  const [totalUsers, setTotalUsers] = useState<number | null>(null)
  const [avgAdj, setAvgAdj] = useState<number | null>(null)
  const [totalChars, setTotalChars] = useState<number | null>(null)
  const [youVsSite, setYouVsSite] = useState<{ you?: number; site?: number }>({})
  const [err, setErr] = useState<string>('')
  const [countryCounts, setCountryCounts] = useState<Record<string, number>>({})
  const [focusIso, setFocusIso] = useState<string>(() => {
    try {
      // 尝试从浏览器语言检测地区
      const locale = Intl.DateTimeFormat().resolvedOptions().locale
      const country = locale.split('-')[1]
      if (country && country.length === 2) {
        return country.toUpperCase()
      }
      // 如果无法检测，根据语言设置默认地区
      if (locale.startsWith('zh')) return 'TW'
      if (locale.startsWith('ja')) return 'JP'
      if (locale.startsWith('ko')) return 'KR'
      if (locale.startsWith('en')) return 'US'
      return 'US' // 最终回退
    } catch {
      return 'US'
    }
  })
  const { user } = useAuth()
  const [tab, setTab] = useState<'visitors'|'leader'>('visitors')
  const [top3, setTop3] = useState<Array<{ id: string; name: string; wpm: number }>>([])
  const [plantStage, setPlantStage] = useState<number>(1)
  const [showHelp, setShowHelp] = useState(false)

  // lightweight CountUp animation
  function useCountUp(target: number, durationMs = 800) {
    const [v, setV] = useState(0)
    useEffect(() => {
      let raf = 0
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs)
        setV(target * p)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [target, durationMs])
    return v
  }
  useEffect(() => {
    void (async () => {
      try {
        setErr('')
        // 使用實際測試的語言，而不是 URL 參數
        const actualLang = user ? (await getDoc(doc(db, 'profiles', user.uid))).data()?.lang || L : L
        debugLog('Home', 'actualLang from profile:', actualLang)
        const [users, attempts, your30d] = await Promise.all([
          getTotalUsersAllTime(10000),
          getAttemptsWindow({ lang: actualLang, days: 30, sampleLimit: 500 }),
          user ? getAttemptsWindow({ lang: actualLang, days: 30, sampleLimit: 200, uid: user.uid }) : Promise.resolve([]),
        ])
        console.log('Home data loaded:', { users, attemptsCount: attempts.length, your30dCount: your30d.length, lang: L })
        setTotalUsers(users)
        const vals = attempts.map((a: any) => a.adjWpm as number).filter((v) => typeof v === 'number')
        const avgAdj = trimmedMean(vals, 0.2)
        const totalChars = attempts.reduce((s: number, a: any) => s + Number(a.rawChars || 0), 0)
        const youVsSite = { you: trimmedMean(your30d.filter((a: any) => a.uid).map((a: any) => a.adjWpm || 0), 0.2), site: avgAdj }
        console.log('Home calculated stats:', { avgAdj, totalChars, youVsSite, valsCount: vals.length })
        setAvgAdj(avgAdj)
        setTotalChars(totalChars)
        setYouVsSite(youVsSite)
        const cc = await getCountryCounts()
        // 若沒有資料，至少顯示自己國家=1 以利顯示紅點
        const iso = (Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || 'US').toUpperCase()
        if (!cc || Object.keys(cc).length === 0) cc[iso] = 1
        setCountryCounts(cc)
        const sorted = [...attempts]
          .filter((a: any) => typeof a.adjWpm === 'number')
          .sort((a: any, b: any) => (b.adjWpm || 0) - (a.adjWpm || 0))
        const seen = new Set<string>()
        const uniq: Array<{ id: string; name: string; wpm: number }> = []
        for (const a of sorted) {
          const key = String(a.uid || a.id)
          if (seen.has(key)) continue
          seen.add(key)
          uniq.push({ id: key, name: String(a.nick || (a.uid || '').slice(0,6) || 'Player'), wpm: Number(a.adjWpm || 0) })
          if (uniq.length >= 3) break
        }
        setTop3(uniq)
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed to load stats') }
    })()
  }, [L])

  // 保底：無論是否有統計資料，至少讓聚焦國家顯示為 1（顯示紅點與著色）
  useEffect(() => {
    if (!focusIso) return
    setCountryCounts((prev) => {
      const iso = focusIso.toUpperCase()
      if ((prev?.[iso] ?? 0) >= 1) return prev
      return { ...prev, [iso]: 1 }
    })
  }, [focusIso])

  // 優先以 Profile.country 覆寫聚焦國家，否則退回瀏覽器 locale
  useEffect(() => {
    void (async () => {
      try {
        if (!user) return
        const ref = doc(db, 'profiles', user.uid)
        const snap = await getDoc(ref)
        const c = (snap.data() as { country?: string } | undefined)?.country
        if (c && typeof c === 'string' && c.length === 2) setFocusIso(c.toUpperCase())
      } catch {}
    })()
  }, [user])

  // 載入植物階段：與 Garden 頁面使用相同的數據源
  useEffect(() => {
    async function loadPlantStage() {
      if (!user) {
        setPlantStage(1)
        return
      }
      
      try {
        const gardenData = await loadGarden(user.uid)
        const stage = Number(gardenData.tree?.stage || 1)
        setPlantStage(Math.min(5, Math.max(1, stage)))
      } catch (error) {
        console.error('Failed to load plant stage:', error)
        setPlantStage(1) // 出错时显示第1阶段
      }
    }
    
    loadPlantStage()
  }, [user])

  // 保底：無論是否有統計資料，至少讓聚焦國家顯示為 1（顯示紅點與著色）
  useEffect(() => {
    if (!focusIso) return
    setCountryCounts((prev) => {
      const iso = focusIso.toUpperCase()
      if ((prev?.[iso] ?? 0) >= 1) return prev
      return { ...prev, [iso]: 1 }
    })
  }, [focusIso])
  // CountUp values
  const cuUsers = useCountUp(totalUsers || 0)
  const cuAvg = useCountUp(avgAdj || 0)
  const cuChars = useCountUp(totalChars || 0)
  const cuMe = useCountUp(youVsSite.you || 0)

  return (
    <div className="max-w-[960px] mx-auto px-4">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[20px] border border-[var(--color-border,#e5e7eb)] bg-gradient-to-b from-emerald-50 via-white to-sky-50 px-4 py-6">
        <div className="grid gap-4 md:grid-cols-2 items-center relative">
          <div>
            <h1 className="h1 mb-1">{t('home.heroTitle')}</h1>
          <p className="body muted">每天輸入都會化成能量澆灌你的樹，養成正確打字習慣與專注力，支援多語系。</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to={`/${L}/test`} className="inline-flex items-center gap-1 rounded-[12px] px-4 h-11 bg-[var(--color-success,#16a34a)] text-white">
                {t('home.ctaTest')} <ChevronRight size={18} />
              </Link>
              {/* 移除『小幫手』按鈕；首頁維持簡潔 */}
              {/* 首頁不再顯示『小樹苗預覽』按鈕 */}
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted,#6b7280)]">{t('home.privacyNote') || '建議使用 Google 登入以保存你的進度；僅用於記錄，絕不蒐集個人敏感資料。'}</p>
          </div>
          <div className="hidden md:block">
            <div className={`${plantStage>=5?'w-64 h-64': plantStage>=3?'w-56 h-56':'w-48 h-48'} mx-auto translate-y-3`}>
              <Seedling stage={plantStage as 1|2|3|4|5} className="w-full h-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats cards */}
      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] items-end">
        <div className="p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px] shadow-[var(--elevation-card,0_1px_2px_rgba(0,0,0,.06),_0_2px_8px_rgba(0,0,0,.04))] relative pr-3">
          <div className="flex items-center justify-between text-[var(--color-muted,#6b7280)]"><span className="inline-flex items-center gap-1">玩家數（歷史）<Tooltip label='從所有成績中估算的不重複玩家總數（匿名）'>?</Tooltip></span><Users size={16} /></div>
          <div className="h2" aria-live="polite">{Number.isFinite(cuUsers) ? Math.round(cuUsers) : 0}</div>
        </div>
        <div className="p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px] shadow-[var(--elevation-card,0_1px_2px_rgba(0,0,0,.06),_0_2px_8px_rgba(0,0,0,.04))] relative pr-3">
          <div className="flex items-center justify-between text-[var(--color-muted,#6b7280)]"><span className="inline-flex items-center gap-1">平均綜合分數（30 天）<Tooltip label={ (L==='zh-TW') ? '把速度和正確率一起變成一個分數。分數越高，代表又快又準。這裡是全站最近 30 天的平均。' : ((t('tips.avgAdj') !== 'tips.avgAdj') ? t('tips.avgAdj') : (t('home.cards.avgAdj') || 'Average adjusted score (30d)')) }>?</Tooltip></span><Keyboard size={16} /></div>
          <div className="h2" aria-live="polite">{avgAdj != null ? (cuAvg).toFixed(1) : <span className="inline-block h-5 w-16 bg-gray-200 rounded" />}</div>
        </div>
        <div className="p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px] shadow-[var(--elevation-card,0_1px_2px_rgba(0,0,0,.06),_0_2px_8px_rgba(0,0,0,.04))] relative pr-3">
          <div className="flex items-center justify-between text-[var(--color-muted,#6b7280)]"><span className="inline-flex items-center gap-1">總字數（30 天）<Tooltip label={ (L==='zh-TW') ? '最近 30 天大家一起打了多少字（不記名統計）' : ((t('tips.totalChars') !== 'tips.totalChars') ? t('tips.totalChars') : (t('home.cards.totalChars') || 'Total characters (30d)')) }>?</Tooltip></span><BarChart3 size={16} /></div>
          <div className="h2" aria-live="polite">{totalChars != null ? Math.round(cuChars) : <span className="inline-block h-5 w-16 bg-gray-200 rounded" />}</div>
        </div>
        <div className="p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px] shadow-[var(--elevation-card,0_1px_2px_rgba(0,0,0,.06),_0_2px_8px_rgba(0,0,0,.04))] relative pr-3">
          <div className="flex items-center justify-between text-[var(--color-muted,#6b7280)]"><span className="inline-flex items-center gap-1">我 vs 全站（30 天）<Tooltip label={ (L==='zh-TW') ? '你最近 30 天的平均分數，跟全站同一語言的小朋友平均相比' : ((t('tips.meVsSite') !== 'tips.meVsSite') ? t('tips.meVsSite') : (t('home.cards.meVsSite') || 'Me vs Site (30d)')) }>?</Tooltip></span><Trophy size={16} /></div>
          <div className="h2" aria-live="polite">{youVsSite.you != null ? (cuMe).toFixed(1) : '—'} / {youVsSite.site != null ? youVsSite.site.toFixed(1) : '—'}</div>
        </div>
      </div>
      {err && <div className="mt-2 text-[var(--color-danger,#ef4444)]">{err}</div>}
      {/* Tabs: Visitors / Leaderboard preview */}
      <div className="mt-6">
        <div role="tablist" aria-label="Home sections" className="flex gap-2">
          <button role="tab" aria-selected={tab==='visitors'} className={tab==='visitors'? 'px-3 h-10 rounded-[10px] bg-sky-100 text-sky-700':'px-3 h-10 rounded-[10px] border'} onClick={()=>setTab('visitors')}><span className="inline-flex items-center gap-1"><Globe size={16}/>{t('home.tabs.visitors')}</span></button>
          <button role="tab" aria-selected={tab==='leader'} className={tab==='leader'? 'px-3 h-10 rounded-[10px] bg-sky-100 text-sky-700':'px-3 h-10 rounded-[10px] border'} onClick={()=>setTab('leader')}><span className="inline-flex items-center gap-1"><Trophy size={16}/>{t('home.tabs.leader')}</span></button>
        </div>
        {tab==='visitors' && (
          <div role="tabpanel" className="mt-3">
            <div className="text-[var(--color-muted,#6b7280)] mb-2">{t('home.visitorsDesc')}</div>
            <div className="border border-[var(--color-border,#e5e7eb)] rounded-[12px] overflow-hidden">
              <WorldMap counts={countryCounts} focusIso2={focusIso} />
            </div>
          </div>
        )}
        {tab==='leader' && (
          <div role="tabpanel" className="mt-3">
            <ol className="space-y-2">
              {top3.map((u, i) => (
                <li key={`${u.id}-${i}`} className="flex items-center justify-between rounded-[12px] border px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="grid place-items-center w-8 h-8 rounded-full bg-[var(--color-primary,#16a34a)]/10 text-[var(--color-primary,#16a34a)] font-semibold">{i+1}</div>
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-[var(--color-muted,#6b7280)]">綜合分數</div>
                    </div>
                  </div>
                  <div className="tabular-nums text-lg font-semibold">{u.wpm.toFixed(1)}</div>
                </li>
              ))}
              {top3.length===0 && <div className="text-[var(--color-muted,#6b7280)]">{t('home.leaderEmpty')}</div>}
            </ol>
            <div className="mt-3 text-right">
              <Link to={`/${L}/leaderboard`} className="inline-flex items-center gap-1 px-3 h-10 rounded-[10px] border">{t('home.leaderViewFull')} <ChevronRight size={16}/></Link>
            </div>
          </div>
        )}
      </div>
      <div className="mt-6">
        <h3 className="h3 mb-2">關於 <span className="brand-title">TypeSprout</span></h3>
        <p className="body muted text-left text-top">
          嗨大家好，我是來自台灣的爸爸 Yves.C。<span className="brand-title">TypeSprout</span> 的靈感來自我家孩子在 Roblox 上和世界各地朋友聊天——我發現，打字其實是孩子走向更大世界的第一把鑰匙。於是我用 no-code 概念 + ChatGPT/AI 一點一滴做出這個網頁打字練習，並加入「小樹成長」的視覺回饋：每一次正確敲擊，樹就長大一點，把每天的努力變成看得見的成就感。
          <br/><br/>
          內容方面，我把 小一到小六常用單字 整理成可選題庫；孩子可以練母語，也能在「設定」裡切換 英文或其他想練的語言，單字由 AI 依年級難度篩選。針對成人也準備了延伸題庫，目前包含 Bible API 與 AI 生成的聖經經句（來源為線上免費資源，準確度可能受限制），之後會陸續加入 名人名言 等主題，讓練習更有意思。
          <br/><br/>
          在 <span className="brand-title">TypeSprout</span> 裡，孩子會透過 分數、每天的努力 一步步累積；畫面上的小樹也會隨表現茁壯，形成「努力 → 回饋 → 再投入」的良性循環。我也設計了 5 天活躍檢測：連續練習 5 天 就會獲得小果實獎勵。當成果被看見，動機就會長出來。 這就是我想分享給孩子、也想分享給你的學習節奏。針對老師，我在個人頁面加入了 「班級」 功能，老師可建立班級、邀請同班小朋友一起參與，讓練習更有團體競賽感。
          <br/><br/>
          這是一個由我個人維護的小專案（沒有工程背景，主要靠 ChatGPT/AI 引導與協作完成）。若你在使用上有建議或發現問題，歡迎到 GitHub 的 Issues 留言，我會盡可能彙整後處理，先向大家說聲謝謝。<br/>
          GitHub：<a href="https://github.com/yveschen001/typesprout-pubic/issues" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary,#16a34a)] underline hover:no-underline">https://github.com/yveschen001/typesprout-pubic/issues</a>
        </p>
      </div>
      {/* 小幫手對話框移除 */}
      <AdsSlot placement="home" />
      {/* 已在 Header 顯示頭像，這裡不再重複 */}
    </div>
  )
}


