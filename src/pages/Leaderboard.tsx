import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../libs/firebase'
import { filterAttempts, toTopN } from '../features/leaderboard/utils'

type Period = 'daily' | 'weekly' | 'monthly'

export default function Leaderboard() {
  const { lang } = useParams()
  const L = lang || 'en-US'
  const [period, setPeriod] = useState<Period>('daily')
  const [rows, setRows] = useState<any[]>([])
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
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const windowMs = period === 'daily' ? dayMs : period === 'weekly' ? 7 * dayMs : 30 * dayMs
    const since = Timestamp.fromMillis(now - windowMs)

    const q = query(
      collection(db, 'attempts'),
      where('lang', '==', L),
      where('ts', '>=', since),
      orderBy('ts', 'desc'),
      limit(1000),
    )
    const snaps = await getDocs(q)
    const attempts = snaps.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
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
    // 先用穩定分數排序（utils 內部以最近 10 次 adjWpm winsorize 後平均），再去重為「每位用戶只保留 1 名」。
    const ranked = toTopN(filtered as any, 1000)
    const seen = new Set<string>()
    const top: any[] = []
    for (const r of ranked) {
      if (!seen.has(r.uid)) { seen.add(r.uid); top.push(r); if (top.length >= 20) break }
    }
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
  }

  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-3">排行榜</h2>
      {!/* 在未登入時提示用途與隱私 */false && (
        <></>
      )}
      {/* 未登入也可看排行榜，但提示登入可保存成績 */}
      {(!rows || rows.length===0) && (
        <div className="mb-3 text-[12px] text-[var(--color-muted,#6b7280)]">提示：登入後你的測驗成績會自動參與排行；我們僅用於記錄分數與歷程，不收集個人敏感資訊。</div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-3 rounded-[12px] border p-2 bg-gradient-to-b from-emerald-50/30 to-white">
        <select className="h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="daily">日排行</option>
          <option value="weekly">週排行</option>
          <option value="monthly">月排行</option>
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
                <div className="text-xs text-[var(--color-muted,#6b7280)]">綜合分數</div>
              </div>
            </div>
            <div className="tabular-nums text-lg font-semibold">{Number(r.adjWpm).toFixed(1)}</div>
          </li>
        ))}
        {rows.length === 0 && <div className="text-[var(--color-muted,#6b7280)]">尚無資料</div>}
      </ol>
    </div>
  )
}


