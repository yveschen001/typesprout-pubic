import { useCallback, useEffect, useMemo, useState } from 'react'
import Seedling from '../features/seedling/Seedling'
import Button from '../components/Button'
import Tooltip from '../components/Tooltip'
import { typingConfig } from '../features/typing/config'
// gardenConfig not needed directly here
import { useAuth } from '../features/auth/hooks'
import { loadGarden, recentEconomyLogs, harvestToday, updateStageFromRecentActivity } from '../features/garden/api'
import { signInWithGoogleRedirect } from '../features/auth/actions'
import { doc, getDoc, collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '../libs/firebase'
import { useParams } from 'react-router-dom'

export default function Garden() {
  const [tab, setTab] = useState<'tree'|'history'>('tree')
  const { user } = useAuth()
  const { lang } = useParams()
  const [gpTotal, setGpTotal] = useState(0)
  const [stage, setStage] = useState(1)
  const [recent, setRecent] = useState<Array<{ date: string; active: boolean; minutes: number }>>([])
  const [estMinLeft, setEstMinLeft] = useState<number | null>(null)
  const activeDays = useMemo(() => recent.filter(d => d.active).length, [recent])
  
  // 計算預估時間（與 Layout 相同的邏輯）
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
        
        // 使用與Layout相同的todayEarned計算方式
        const today = new Date().toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
        const start = new Date(today + 'T00:00:00')
        const q = query(collection(db, 'economyLogs'), where('uid','==', user.uid), where('ts','>=', Timestamp.fromDate(start)), orderBy('ts','desc'))
        const snaps = await getDocs(q)
        let todayEarned = 0
        snaps.docs.forEach(d => { 
          const v = d.data() as { type?: string; delta?: number }
          if (v.type==='earn') todayEarned += Number(v.delta||0) 
        })
        
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
  }, [user, lang])
  
  type TsLike = { toDate?: () => Date } | Date | number | undefined
  type Inv = { fertilizer?: number; water?: number; fertilizerActiveUntil?: TsLike; waterActiveUntil?: TsLike }
  type Log = { id: string; ts?: TsLike; type?: string; delta?: number; source?: string }
  const [inventory, setInventory] = useState<Inv>({})
  const [logs, setLogs] = useState<Log[]>([])
  const [err, setErr] = useState<string>('')
  const [pending, setPending] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) return
    setErr('')
    const g = await loadGarden(user.uid)
    setGpTotal(Number(g.tree?.gpTotal || 0))
    setStage(Number(g.tree?.stage || 1))
    // 自動收成果實：若今天階段為 5 且有累積 GP
    try {
      const today = new Date().toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
      const tree: any = g.tree || {}
      const canAutoHarvest = Number(tree.stage || 0) >= 5 && Number(tree.dailyGp || 0) > 0 && String(tree.dailyDate || today) === today
      if (canAutoHarvest) {
        await harvestToday(user.uid)
      }
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed to harvest') }
    const inv: Inv = {
      fertilizer: Number(g.inventory?.fertilizer || 0),
      water: Number(g.inventory?.water || 0),
      fertilizerActiveUntil: (g as unknown as { inventory?: { fertilizerActiveUntil?: TsLike } }).inventory?.fertilizerActiveUntil,
      waterActiveUntil: (g as unknown as { inventory?: { waterActiveUntil?: TsLike } }).inventory?.waterActiveUntil,
    }
    setInventory(inv)
    const rawLogs = await recentEconomyLogs(user.uid)
    console.log('Garden refresh: 获取到 economyLogs', rawLogs.length, '条记录')
    console.log('Garden refresh: economyLogs 详情', rawLogs)
    setLogs((rawLogs as unknown as Array<{ id: string; ts?: TsLike; type?: string; delta?: number; source?: string }>))
    // 更新最近 5 天活躍並同步階段
    try {
      console.log('Garden refresh: calling updateStageFromRecentActivity for user:', user.uid)
      const { stage: newStage, days } = await updateStageFromRecentActivity(user.uid)
      console.log('Garden refresh: got stage and days:', { newStage, days })
      setStage(newStage)
      setRecent(days)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to update activity')
    }
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  // 進度條改為活躍規則說明，暫不使用舊 GP 進度
  function formatTs(x: TsLike) {
    if (!x) return '—'
    if (x instanceof Date) return x.toLocaleString()
    if (typeof x === 'number') return new Date(x).toLocaleString()
    console.log('formatTs: 處理 Timestamp 對象', x, 'toDate 方法:', typeof x.toDate)
    const d = x.toDate?.()
    console.log('formatTs: toDate() 結果:', d)
    return d ? d.toLocaleString() : '—'
  }
  function asDate(x?: TsLike): Date | undefined {
    if (!x) return undefined
    if (x instanceof Date) return x
    if (typeof x === 'number') return new Date(x)
    return x.toDate?.()
  }
  function isActive(x?: TsLike) {
    if (!x) return false
    const d = x instanceof Date ? x : (typeof x === 'number' ? new Date(x) : (x.toDate?.() || undefined))
    if (!d) return false
    return d.getTime() > Date.now()
  }
  const fertActive = isActive(inventory.fertilizerActiveUntil)
  const waterActive = isActive(inventory.waterActiveUntil)
  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-3">種樹</h2>
      {!user && (
        <div className="mb-4 p-4 rounded-[12px] border border-[var(--color-border,#e5e7eb)] bg-[var(--color-surface,#fff)]" role="region" aria-label="請先登入">
          <div className="font-semibold mb-1">要開始種樹，請先登入</div>
          <div className="text-[var(--color-muted,#6b7280)]">登入只是為了幫你保存進度與歷程，我們不會蒐集個人敏感資訊。</div>
          <div className="mt-3"><Button onClick={()=>{ void signInWithGoogleRedirect() }}>使用 Google 登入</Button></div>
        </div>
      )}
      {!user && (
        <div className="text-[var(--color-muted,#6b7280)]">登入後你會看到「今天總結」與「最近紀錄」，並能追蹤小樹的成長。</div>
      )}
      {!user && (<div className="h-4" />)}
      {!user ? null : (
      <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        <Button variant={tab==='tree'?'primary':'outline'} onClick={() => setTab('tree')}>我的小樹</Button>
        <Button variant={tab==='history'?'primary':'outline'} onClick={() => setTab('history')}>歷程</Button>
      </div>
      {tab==='tree' && (
        <div>
          <div className="mb-3 grid place-items-center">
            {(() => {
              const visStage = (typeof stage === 'number' && stage>=1 && stage<=5) ? (stage as 1|2|3|4|5) : 1
              const sizeCls = visStage>=5?'w-64 h-64': visStage>=3?'w-56 h-56':'w-48 h-48'
              return <div className={`mx-auto translate-y-3 ${sizeCls}`}><Seedling stage={visStage} className="w-full h-full" /></div>
            })()}
          </div>
          <div className="mt-2 body muted">升級規則：最近 5 天，每天任意練習都會累積；當天輸入越久越容易升級。最高階段 5。</div>
          <div className="mt-3 p-3 rounded-[12px] bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] text-left">
            <div className="font-semibold mb-1">怎麼升級？</div>
            <ul className="list-disc list-inside leading-7 text-[var(--color-muted,#6b7280)]">
              <li>每天登入並練習打字，累積時間；只要開始測驗，就會產生「有效輸入時間」。</li>
              <li>每天只要有練習就會累積活躍；輸入越久，成長越快。</li>
              <li>到達第 5 等級，可以開始結果（長出果實）。</li>
              <li>最近 5 天的活躍會讓小樹往上或往下：活躍多就升級，活躍少就降級。</li>
              <li>最高到階段 5；若能每天都維持階段 5，就會持續長出果實。</li>
              <li>收集到的果實將依排名提供平台獎勵；目前可先以測驗時間作為積分累計。</li>
            </ul>
            {(() => {
              // 使用與頂部導航欄相同的預估時間
              const needStage = Math.min(5, Math.max(1, Number(stage)||1) + 1)
              const canLevelUpToday = (Number(stage)||1) < 5
              const moreMin = estMinLeft || 0
              return canLevelUpToday ? (
                <div className="mt-2 text-sm text-[var(--color-muted,#6b7280)]">
                  距離升到 <span className="font-semibold">階段 {needStage}</span>，建議今天至少再有效輸入 <span className="font-semibold">{moreMin.toFixed(0)}</span> 分鐘。
                </div>
              ) : null
            })()}
          </div>
          <div className="mt-3 p-3 rounded-[12px] bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)]">
            <div className="font-semibold mb-2">最近 5 天活躍</div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {recent.map(d => (
                <div key={d.date} className="p-2 rounded-[10px] border">
                  <div className="text-xs text-[var(--color-muted,#6b7280)]">{d.date.slice(5)}</div>
                  <div className={`mt-1 font-semibold ${d.active? 'text-[var(--color-success,#16a34a)]' : 'text-[var(--color-danger,#ef4444)]'}`}>{d.active ? '✓' : '✗'}</div>
                  <div className="text-xs text-[var(--color-muted,#6b7280)]">{d.minutes} 分</div>
                </div>
              ))}
              {recent.length===0 && <div className="col-span-5 text-[var(--color-muted,#6b7280)]">尚無資料</div>}
            </div>
            <div className="mt-2 text-sm text-[var(--color-muted,#6b7280)]">活躍天數：{activeDays} / 5</div>
            <div className="mt-2 text-left">
              <Button variant="outline" onClick={async ()=>{ if(!user) return; setPending(true); try { const { stage: s, days } = await updateStageFromRecentActivity(user.uid); setStage(s); setRecent(days) } catch(e: unknown){ setErr(e instanceof Error? e.message : 'Failed') } finally { setPending(false) } }} disabled={pending}>重算活躍與階段</Button>
              <div className="mt-1 text-xs text-[var(--color-muted,#6b7280)]">什麼是「重算活躍與階段」？會重新讀取你最近 5 天的測驗紀錄，計算有效輸入分鐘數，並更新活躍清單與目前階段。</div>
            </div>
          </div>
          {/* 舊 GP/EP 規則已移除 */}
          {/* 成長示意圖 */}
          <div className="mt-8">
            <div className="h3 mb-2">成長示意圖</div>
            <div className="text-[var(--color-muted,#6b7280)] mb-3">不同階段外觀與解鎖條件（示意）。</div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 place-items-center">
              {([1,2,3,4,5] as const).map((stg) => {
                return (
                <div key={stg} className="w-full max-w-[200px] p-3 rounded-[12px] border border-[var(--color-border,#e5e7eb)] text-center">
                  <div className="mx-auto w-28 h-28"><Seedling stage={stg} className="w-full h-full" /></div>
                  <div className="mt-2 font-semibold">階段 {stg}</div>
                  <div className="text-sm text-[var(--color-muted,#6b7280)]">
                    {stg===1 && '萌芽 · 預設外觀'}
                    {stg===2 && '長出第二片葉'}
                    {stg===3 && '葉片增生'}
                    {stg===4 && '枝幹伸展＋側枝'}
                    {stg===5 && '小樹樹冠成形（結果）'}
                  </div>
                </div>
              )})}
            </div>
          </div>
        </div>
        )}
        {tab==='history' && (
        <div>
          {/* 今日總結 */}
          {(() => {
            const today = new Date().toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
            const todayPoints = logs.reduce((sum, l) => {
              const d = asDate(l.ts)
              const key = d ? d.toLocaleDateString('en-CA') : '' // 轉換為本地時間格式進行比較
              return key===today && l.type==='earn' ? sum + Number(l.delta || 0) : sum
            }, 0)
            const todayRec = recent.find(r => r.date === today)
            const todayMinutes = todayRec ? (todayRec.minutes || 0) : 0
            return (
              <div className="mb-3 p-3 rounded-[12px] bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)]">
                <div className="font-semibold mb-1">今天總結
                  <span className="inline-flex items-center">
                    <span className="ml-1"><Tooltip label={`點數怎麼來？由本日測驗產生，與有效輸入時間、速度與正確率有關。每日上限 100；短練習（≥5秒且正確率≥30%）至少+1。`}>？</Tooltip></span>
                  </span>
                </div>
                <div className="text-[var(--color-muted,#6b7280)]">有效輸入：{(todayMinutes).toFixed(2)} 分鐘 · 獲得點數：{todayPoints} / {typingConfig.dailyEpCap}（剩餘 {Math.max(0, typingConfig.dailyEpCap - todayPoints)}）</div>
              </div>
            )
          })()}

          {/* 說明區塊 */}
          <div className="mb-3 p-3 rounded-[12px] bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] text-left">
            <div className="font-semibold mb-1">什麼是「歷程」？</div>
            <ul className="list-disc list-inside leading-7 text-[var(--color-muted,#6b7280)]">
              <li>記錄你每次測驗後獲得的「點數」（同時也會加到 XP）。</li>
              <li>點數由 速度×正確率×時間 換算而來，用於推動小樹成長。</li>
              <li>最近 5 天的有效輸入會影響小樹階段；維持活躍越多天，越容易結果（長出果實）。</li>
              <li>下方清單顯示每筆獲得紀錄，方便你追蹤自己的努力。</li>
            </ul>
          </div>

          <div className="text-[var(--color-muted,#6b7280)] mb-2">最近紀錄</div>
          <ul>
            {logs.map(l => {
              const extra: string[] = []
              const dur = (l as any).durationSec as number | undefined
              const acc = (l as any).accuracy as number | undefined
              const cc = (l as any).correctChars as number | undefined
              const tq = (l as any).totalQChars as number | undefined
              if (typeof dur === 'number') extra.push(`時長 ${dur.toFixed(2)} 秒`)
              if (typeof acc === 'number') extra.push(`正確率 ${(acc*100).toFixed(0)}%`)
              if (typeof cc === 'number' && typeof tq === 'number') extra.push(`正確字/總字 ${cc}/${tq}`)
              const extraStr = extra.length ? ` ｜ ${extra.join(' · ')}` : ''
              return (
                <li key={l.id} className="py-1.5 border-b border-[var(--color-border,#e5e7eb)]">
                  {formatTs(l.ts)} · +{Number(l.delta || 0)} 點數（{l.source==='attempt'?'測驗':'其他'}）{extraStr}
                </li>
              )
            })}
            {logs.length===0 && <li className="text-[var(--color-muted,#6b7280)]">目前沒有紀錄</li>}
          </ul>
          {/* 自動收成果實；不再需要手動按鈕與枯萎復甦 */}
        </div>
      )}
      </div>
      )}
      
    </div>
  )
}


