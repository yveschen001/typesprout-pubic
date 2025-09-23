import React from 'react'
import { useLocation, useParams } from 'react-router-dom'
import Seo from '../adapters/seo/Seo'
import { useAuth } from '../features/auth/hooks'
import Tooltip from '../components/Tooltip'
import { typingConfig } from '../features/typing/config'
import { db } from '../libs/firebase'
import { collection, query as fq, where, orderBy, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore'
// removed inline sign-in button; use header AuthWidget only
import { useEffect, useState } from 'react'
import { loadReminderPref, requestNotifyPermission, shouldRemind, showReminderNotification } from '../libs/reminders'

const metaByKey: Record<string, { title: string; description: string }> = {
  '': { title: 'TypeSprout — Kids Typing & Tree Growth', description: 'Kids typing practice with gamified tree growth. zh-TW/zh-CN/en-US' },
  practice: { title: 'Practice — TypeSprout', description: 'Free typing practice with IME support and modes.' },
  test: { title: '打字測驗 — TypeSprout', description: '計時測驗，顯示正確率與綜合分數。' },
  result: { title: '結果 — TypeSprout', description: '你的打字測驗結果。' },
  leaderboard: { title: '排行榜 — TypeSprout', description: '依語言的每日/每週/每月排行榜。' },
  profile: { title: '個人資料 — TypeSprout', description: '你的個人資訊、年級與偏好設定。' },
  garden: { title: '種樹 — TypeSprout', description: '以打字點數推進樹的成長與獎勵。' },
  admin: { title: 'Admin — TypeSprout', description: 'Administration placeholder.' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { lang } = useParams()
  const L = lang || 'en-US'
  const { pathname } = useLocation()
  const seg = (pathname.split('/')[2] || '') as keyof typeof metaByKey
  const meta = metaByKey[seg] || metaByKey['']
  const canonicalPath = pathname || `/${L}/`
  const [showBanner, setShowBanner] = useState(false)
  const [hideLoginHint, setHideLoginHint] = useState(false)
  const [todayEarned, setTodayEarned] = useState(0)
  const [estMinLeft, setEstMinLeft] = useState<number | null>(null)

  useEffect(() => {
    // 在每次進站時檢查是否需要提醒
    const pref = loadReminderPref()
    if (!pref.enabled) return
    const run = async () => {
      if (shouldRemind()) {
        const perm = await requestNotifyPermission()
        const shown = perm === 'granted' && showReminderNotification()
        if (!shown) setShowBanner(true)
      }
    }
    void run()
  }, [])

  // 以 sessionStorage 記住「稍後」選擇，避免重新整理後又彈出
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('hideLoginHint')
      if (v === '1') setHideLoginHint(true)
    } catch {}
  }, [])

  // 監聽今天點數累計，統一顯示
  useEffect(() => {
    if (!user) { setTodayEarned(0); return }
    try {
      const now = new Date()
      const today = now.toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const todayEndLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      const start = todayLocal
      const end = todayEndLocal
      
      // 调试：检查时间计算
      console.log('Layout: 时间计算调试:', {
        now: now,
        nowLocal: now.toLocaleString(),
        nowUTC: now.toISOString(),
        todayLocal: todayLocal,
        todayLocalString: todayLocal.toLocaleString(),
        todayLocalUTC: todayLocal.toISOString(),
        todayEndLocal: todayEndLocal,
        todayEndLocalString: todayEndLocal.toLocaleString(),
        todayEndLocalUTC: todayEndLocal.toISOString(),
        start: start,
        startLocal: start.toLocaleString(),
        startUTC: start.toISOString(),
        end: end,
        endLocal: end.toLocaleString(),
        endUTC: end.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: now.getTimezoneOffset()
      })
      
      console.log('Layout: 今日进度计算 - 本地时间:', {
        now: now.toISOString(),
        nowLocal: now.toLocaleString(),
        todayLocal: todayLocal.toISOString(),
        todayLocalString: todayLocal.toLocaleString(),
        start: start.toISOString(),
        startLocal: start.toLocaleString(),
        user: user.uid
      })
      
      // 先尝试从economyLogs获取
      const q = fq(collection(db, 'economyLogs'), where('uid','==', user.uid), where('ts','>=', Timestamp.fromDate(start)), where('ts','<=', Timestamp.fromDate(end)), orderBy('ts','desc'))
      const unsub = onSnapshot(q, (snaps) => {
        let sum = 0
        console.log('Layout: economyLogs查询结果:', snaps.docs.length, '条记录')
        snaps.docs.forEach(d => { 
          const v = d.data() as { type?: string; delta?: number; ts?: any }
          if (v.type==='earn') {
            const delta = Number(v.delta||0)
            sum += delta
            console.log('Layout: economyLogs记录:', { type: v.type, delta, ts: v.ts?.toDate?.()?.toISOString() })
          }
        })
        
        // 如果economyLogs没有数据，尝试从attempts计算
        if (sum === 0) {
          console.log('Layout: economyLogs为空，尝试从attempts计算今日进度')
          // 从attempts计算今日进度
          const calculateFromAttempts = async () => {
            try {
              const attemptsQuery = fq(
                collection(db, 'attempts'), 
                where('uid', '==', user.uid), 
                where('ts', '>=', Timestamp.fromDate(start)), 
                orderBy('ts', 'desc')
              )
              const attemptsSnaps = await getDocs(attemptsQuery)
              console.log('Layout: attempts查询结果:', attemptsSnaps.docs.length, '条记录')
              let calculatedSum = 0
              attemptsSnaps.docs.forEach(d => {
                const data = d.data() as any
                const recordTime = data.ts?.toDate?.()
                console.log('Layout: attempt记录:', {
                  ts: recordTime?.toISOString(),
                  tsLocal: recordTime?.toLocaleString(),
                  durationSec: data.durationSec,
                  adjWpm: data.adjWpm,
                  accuracy: data.accuracy
                })
                
                // 检查记录是否在今天的时间范围内
                if (recordTime && recordTime >= start && recordTime <= end) {
                  if (data.durationSec && data.adjWpm && data.accuracy) {
                    const Lkey = (lang || 'en-US') as keyof typeof typingConfig.baseByLang
                    const base = typingConfig.baseByLang[Lkey]
                    const minutes = data.durationSec / 60
                    const ratio = Math.max(0, Math.min(2, data.adjWpm / 20)) // 假设目标速度是20
                    const ep = base * minutes * ratio * (0.5 + 0.5 * data.accuracy)
                    const roundedEp = Math.round(ep)
                    calculatedSum += roundedEp
                    console.log('Layout: 计算点数:', { minutes, ratio, ep, roundedEp, calculatedSum })
                  }
                } else {
                  console.log('Layout: 记录不在今天范围内，跳过:', {
                    recordTime: recordTime?.toISOString(),
                    start: start.toISOString(),
                    end: end.toISOString()
                  })
                }
              })
              console.log('Layout: 从attempts计算的今日进度:', calculatedSum)
              setTodayEarned(calculatedSum)
            } catch (error) {
              console.error('Layout: 从attempts计算今日进度失败:', error)
            }
          }
          calculateFromAttempts()
          return
        }
        
        console.log('Layout: 今日进度更新:', sum)
        setTodayEarned(sum)
      })
      return () => { try { unsub() } catch {} }
    } catch (error) { 
      console.error('Layout: 获取今日进度失败:', error)
      setTodayEarned(0) 
    }
  }, [user])

  // 估算：以最近一次成績估每分鐘點數，換算還需幾分鐘達成上限
  useEffect(() => {
    (async () => {
      try {
        if (!user) { setEstMinLeft(null); return }
        const Lkey = (lang || 'en-US') as keyof typeof typingConfig.baseByLang
        const base = typingConfig.baseByLang[Lkey]
        const prefRef = doc(db, 'profiles', user.uid)
        const snap = await getDoc(prefRef)
        const pdata = snap.exists() ? (snap.data() as any) : {}
        const grade = Math.max(1, Math.min(6, Number(pdata.grade || 3)))
        const target = typingConfig.targetByGrade[Lkey]?.[grade as 1|2|3|4|5|6] || 20
        const last = pdata.lastAttempt || {}
        const acc = Math.max(0, Math.min(1, Number(last.accuracy ?? 0.85)))
        const adj = Number(last.adjWpm ?? (target * 0.8))
        const ratio = Math.max(0, Math.min(2, adj / target))
        const epPerMin = base * ratio * (0.5 + 0.5 * acc)
        const remain = Math.max(0, typingConfig.dailyEpCap - todayEarned)
        
        if (!Number.isFinite(epPerMin) || epPerMin <= 0) {
          setEstMinLeft(null)
        } else {
          const mins = remain <= 0 ? 0 : Math.ceil(remain / epPerMin)
          const maxMins = 100
          const finalMins = Math.min(mins, maxMins)
          setEstMinLeft(Number.isFinite(finalMins) ? finalMins : null)
        }
      } catch { setEstMinLeft(null) }
    })()
  }, [user, lang, todayEarned])

  return (
    <>
      <Seo title={meta.title} description={meta.description} canonicalPath={canonicalPath} />
      {/* 儲存最終語言選擇到 localStorage，供下次優先使用 */}
      {typeof window !== 'undefined' && lang && (
        <script dangerouslySetInnerHTML={{ __html: `try{localStorage.setItem('typesprout_lang','${L}')}catch{}` }} />
      )}
      {user && (
        <div className="bg-[var(--color-surface,#fff)]/90 backdrop-blur border-b border-[var(--color-border,#e5e7eb)] sticky top-0 z-30" aria-label="今日進度">
          <div className="max-w-[960px] mx-auto px-4 py-2 text-sm flex items-center justify-between gap-3">
            <div className="text-[var(--color-muted,#6b7280)] flex items-center">今日：{todayEarned}/{typingConfig.dailyEpCap}（剩餘 {Math.max(0, typingConfig.dailyEpCap - todayEarned)}）{(estMinLeft!=null) && ` · 估約 ${estMinLeft} 分`}
              <Tooltip label={`怎麼拿點數？每次測驗依『時間×速度×正確率』換算（base×分鐘×(速度/目標，最多×2)×(0.5+0.5×正確率)）。每日上限 100；鼓勵規則：正確率≥30% 時，每 10 秒至少 +1 點（可累加）；≥30 秒且正確率≥50% 至少 +1。${estMinLeft!=null?` 依你最近表現，達到上限約還需 ${estMinLeft} 分鐘。`:''}`}>？</Tooltip>
            </div>
            <div className="text-[12px] text-[var(--color-muted,#6b7280)]">小提醒：每天練一點，樹就會長大！</div>
          </div>
        </div>
      )}
      {!user && !hideLoginHint && (
        <div className="bg-sky-50 border-b border-sky-200 text-[var(--color-surface-foreground,#111827)]">
          <div className="max-w-[960px] mx-auto px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap" role="region" aria-label="登入建議">
            <div>
              建議使用右上角「Sign in with Google」登入以保存你的成績與歷程；本網站重視匿名與隱私，不會儲存個人敏感資料。
            </div>
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 rounded border" onClick={()=>{ setHideLoginHint(true); try{ sessionStorage.setItem('hideLoginHint','1') }catch{} }} aria-label="關閉提示">稍後</button>
            </div>
          </div>
        </div>
      )}
      {showBanner && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-[var(--color-surface-foreground,#111827)]">
          <div className="max-w-[960px] mx-auto px-4 py-2 text-sm flex items-center justify-between gap-3">
            <div>提醒：今天還沒練習喔！每天動動手，讓小樹更茁壯。</div>
            <button className="px-2 py-1 rounded border" onClick={()=>setShowBanner(false)}>知道了</button>
          </div>
        </div>
      )}
      {children}
      <footer className="mt-8 pt-6 border-t border-[var(--color-border,#e5e7eb)] text-[var(--color-muted,#6b7280)] text-sm">
        <div className="max-w-[960px] mx-auto px-4 flex items-center justify-between gap-3 flex-wrap">
          <div>© {new Date().getFullYear()} <span className="brand-title">TypeSprout</span></div>
          <div className="flex items-center gap-3">
            <a href={`/${lang}/terms`} aria-label="服務條款">服務條款</a>
            <a href={`/${lang}/privacy`} aria-label="隱私權政策">隱私</a>
          </div>
        </div>
      </footer>
    </>
  )
}


