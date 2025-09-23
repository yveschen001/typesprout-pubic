import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../libs/firebase'
import { filterAttempts, toTopN } from '../features/leaderboard/utils'
import { useAuth } from '../features/auth/hooks'
import Tooltip from '../components/Tooltip'

type Period = 'today' | 'yesterday' | 'lastWeek' | 'lastMonth'

export default function Leaderboard() {
  const { lang } = useParams()
  const L = lang || 'en-US'
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('today')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [sortDesc, setSortDesc] = useState(true)
  const [grade, setGrade] = useState<number | undefined>(undefined)
  const [classCode, setClassCode] = useState<string>('')
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const g = Number(searchParams.get('grade') || '')
    setGrade(Number.isFinite(g) && g > 0 ? g : undefined)
    setClassCode(searchParams.get('class') || '')
  }, [])

  useEffect(() => { void fetchRows() }, [L, period, grade, classCode])

  async function fetchRows() {
    setLoading(true)
    setError('')
    try {
      // 根据时间段计算查询范围
      const now = new Date()
      let since: Timestamp
      let until: Timestamp | undefined
      
      if (period === 'today') {
        // 今天 (本地时间 00:00 到 23:59)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
        since = Timestamp.fromDate(today)
        until = Timestamp.fromDate(tomorrow)
      } else if (period === 'yesterday') {
        // 昨天 (本地时间 00:00 到 23:59)
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())
        const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000)
        since = Timestamp.fromDate(yesterdayStart)
        until = Timestamp.fromDate(yesterdayEnd)
      } else if (period === 'lastWeek') {
        // 上周 (自然周，周一到周日)
        const dayOfWeek = now.getDay()
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const thisMonday = new Date(now.getTime() - daysToMonday * 24 * 60 * 60 * 1000)
        const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000)
        const lastSunday = new Date(lastMonday.getTime() + 7 * 24 * 60 * 60 * 1000)
        since = Timestamp.fromDate(lastMonday)
        until = Timestamp.fromDate(lastSunday)
      } else { // lastMonth
        // 上个月 (自然月，1号开始)
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        since = Timestamp.fromDate(lastMonth)
        until = Timestamp.fromDate(thisMonth)
      }

      // 构建查询条件
      const conditions = [
        where('lang', '==', L),
        where('ts', '>=', since)
      ]
      
      // 如果有结束时间，添加结束条件
      if (until) {
        conditions.push(where('ts', '<', until))
      }
      
      conditions.push(orderBy('ts', 'desc'))
      conditions.push(limit(1000))

      const q = query(collection(db, 'attempts'), ...conditions)
      const snaps = await getDocs(q)
      const attempts = snaps.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
      console.log('Leaderboard fetch:', { 
        period, 
        L, 
        attemptsCount: attempts.length, 
        firstFew: attempts.slice(0, 3),
        since: since.toDate(),
        until: until?.toDate(),
        sinceISO: since.toDate().toISOString(),
        untilISO: until?.toDate().toISOString(),
        now: new Date().toISOString(),
        query: { lang: L, since: since.toDate(), until: until?.toDate(), limit: 1000 }
      })
      
      // 检查是否有数据在时间范围内
      if (attempts.length > 0) {
        console.log('Leaderboard: 检查时间范围匹配')
        attempts.forEach((attempt, i) => {
          const attemptDate = attempt.ts?.toDate?.()?.toISOString().slice(0, 10) || new Date(attempt.ts).toISOString().slice(0, 10)
          const sinceDate = since.toDate().toISOString().slice(0, 10)
          const untilDate = until?.toDate().toISOString().slice(0, 10)
          console.log(`数据${i+1}:`, {
            attemptDate,
            sinceDate,
            untilDate,
            inRange: attemptDate >= sinceDate && (!untilDate || attemptDate < untilDate)
          })
        })
      }
      
      // 详细检查每个attempt的数据结构
      if (attempts.length > 0) {
        console.log('Leaderboard detailed attempt data:')
        attempts.slice(0, 2).forEach((attempt, i) => {
          console.log(`Attempt ${i + 1}:`, {
            id: attempt.id,
            uid: attempt.uid,
            lang: attempt.lang,
            durationSec: attempt.durationSec,
            accuracy: attempt.accuracy,
            rawWpm: attempt.rawWpm,
            cpm: attempt.cpm,
            adjWpm: attempt.adjWpm,
            classCode: attempt.classCode,
            ts: attempt.ts?.toDate?.() || attempt.ts
          })
        })
      }
      
      let uidToGrade: Record<string, number> | undefined
      if (grade) {
        const uids = Array.from(new Set(attempts.map((a: any) => a.uid))).slice(0, 50)
        const results = await Promise.all(uids.map(async (u) => {
          const snap = await getDoc(doc(db, 'profiles', u))
          return [u, Number((snap.data() as any)?.grade || 0)] as const
        }))
        uidToGrade = Object.fromEntries(results)
      }
      
      const filtered = filterAttempts(attempts as any, { lang: L, classCode: classCode || undefined, gradeFilter: grade, uidToGrade })
      console.log('Leaderboard filtered:', { 
        originalCount: attempts.length, 
        filteredCount: filtered.length,
        grade,
        classCode,
        uidToGradeKeys: Object.keys(uidToGrade || {})
      })
      // 先用穩定分數排序（utils 內部以最近 10 次 adjWpm winsorize 後平均），再去重為「每位用戶只保留 1 名」。
      const ranked = toTopN(filtered as any, 1000, period)
      console.log('Leaderboard ranked:', { rankedCount: ranked.length, firstFew: ranked.slice(0, 3) })
      // 由于toTopN已经按用户合并了，直接使用ranked结果
      const top = ranked.slice(0, 20)
      console.log('Leaderboard final top:', { topCount: top.length, top: top.slice(0, 3) })
      
      // 盡量補齊頭像（profiles.photoURL）
      const needProfiles = top.filter(r => !r.photoURL).map(r => r.uid)
      if (needProfiles.length) {
        const results = await Promise.all(needProfiles.map(async (u) => {
          const snap = await getDoc(doc(db, 'profiles', u))
          return [u, (snap.data() as any)?.photoURL || ''] as const
        }))
        const map = Object.fromEntries(results)
        for (const r of top) if (!r.photoURL && map[r.uid]) r.photoURL = map[r.uid]
      }
      
      setRows(top)
    } catch (error) {
      console.error('Failed to fetch leaderboard data:', error)
      setError('載入排行榜失敗，請稍後再試')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-3">排行榜</h2>
      {!/* 在未登入時提示用途與隱私 */false && (
        <></>
      )}
      {/* 未登入也可看排行榜，但提示登入可保存成績 */}
      {!user && (
        <div className="mb-3 text-[12px] text-[var(--color-muted,#6b7280)]">提示：登入後你的測驗成績會自動參與排行；我們僅用於記錄分數與歷程，不收集個人敏感資訊。</div>
      )}
      
      {/* 加载状态 */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">排行榜數據載入中...</p>
          <p className="text-sm text-gray-500">如果持續無法載入，請檢查網路連接或稍後再試</p>
        </div>
      )}
      
      {/* 错误状态 */}
      {error && (
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => fetchRows()} 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            重新載入
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-3 rounded-[12px] border p-2 bg-gradient-to-b from-emerald-50/30 to-white">
        <select className="h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="today">本日排行</option>
          <option value="yesterday">昨日排行</option>
          <option value="lastWeek">上周排行</option>
          <option value="lastMonth">上個月排行</option>
        </select>
        <select className="h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" value={String(grade || '')} onChange={(e) => { const v = Number(e.target.value || ''); setGrade(Number.isFinite(v) && v>0 ? v : undefined); const next = new URLSearchParams(searchParams); if (v) next.set('grade', String(v)); else next.delete('grade'); setSearchParams(next) }}>
          <option value="">全部年級</option>
          <option value="1">一年級</option>
          <option value="2">二年級</option>
          <option value="3">三年級</option>
          <option value="4">四年級</option>
          <option value="5">五年級</option>
          <option value="6">六年級</option>
        </select>
        <input className="h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" placeholder="班級代碼" value={classCode} onChange={(e) => { setClassCode(e.target.value); const next = new URLSearchParams(searchParams); if (e.target.value) next.set('class', e.target.value); else next.delete('class'); setSearchParams(next) }} />
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted,#6b7280)]">
          <Tooltip label="🏆 排行榜怎麼算的？&#10;• 本日排行：今天（本地時間）的成績&#10;• 昨日排行：昨天（本地時間）的成績&#10;• 上周排行：上週一到週日的成績&#10;• 上個月排行：上個月1號到月底的成績&#10;&#10;📊 分數怎麼算？&#10;• 綜合分數 = 最快速度 × 正確率 × 練習時間&#10;• 同一天多次練習會合併計算&#10;• 練習時間越長，分數越高&#10;&#10;💡 小提醒：每天練習一點點，小樹就會長大喔！" />
        </div>
      </div>
      <div className="body muted mb-2" aria-keyshortcuts="Alt+ArrowUp, Alt+ArrowDown">提示：按 Alt+↑/↓ 切換排序</div>
      <ol className="space-y-2" onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') setSortDesc(false); if (e.altKey && e.key === 'ArrowDown') setSortDesc(true) }} tabIndex={0} aria-label="Leaderboard list">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center justify-between rounded-[12px] border px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center w-8 h-8 rounded-full bg-[var(--color-primary,#16a34a)]/10 text-[var(--color-primary,#16a34a)] font-semibold">{i+1}</div>
            <div className="flex items-center gap-2">
                <img src={r.photoURL || 'https://lh3.googleusercontent.com/a/default-user=s32'} alt="avatar" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                <div className="font-medium">{r.nick || r.uid.slice(0,6)}</div>
                <div className="text-xs text-[var(--color-muted,#6b7280)]">
                  {r.totalDuration ? `${period === 'today' ? '今日' : period === 'yesterday' ? '昨日' : period === 'lastWeek' ? '上周' : '上月'} ${Math.round(r.totalDuration/60)}分` : '綜合分數'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="tabular-nums text-lg font-semibold">{Number(r.maxAdjWpm || r.adjWpm).toFixed(1)}</div>
              {r.totalChars && (
                <div className="text-xs text-[var(--color-muted,#6b7280)]">
                  {r.totalChars}字 · {Math.round(r.avgAccuracy * 100)}%準確
                </div>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && <div className="text-[var(--color-muted,#6b7280)]">尚無資料</div>}
      </ol>
    </div>
  )
}


