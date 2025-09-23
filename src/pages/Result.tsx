import { useEffect, useState } from 'react'
import { useLocation, Link, useParams } from 'react-router-dom'
import SpeedChart from '../components/metrics/SpeedChart'
import AccuracyChart from '../components/metrics/AccuracyChart'
import ChartSection from '../components/metrics/ChartSection'
import { db } from '../libs/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../features/auth/hooks'
import { getAttemptsWindow, trimmedMean } from '../adapters/firestore/stats'
import Tooltip from '../components/Tooltip'

type ResultState = { rawWpm: number; accuracy: number; adjWpm: number; durationSec?: number; rawChars?: number; totalQChars?: number }

type LastAttempt = {
  raw: number
  accuracy: number
  adjWpm: number
  durationSec?: number
  rawChars?: number
}

function Result() {
  const { state } = useLocation() as { state: Partial<ResultState & { fromTest?: boolean }> }
  const { lang } = useParams()
  const { user } = useAuth()
  const [vals, setVals] = useState<{ raw: number; accuracy: number; adj: number; dur: number; chars: number; totalQChars: number }>({ raw: state?.rawWpm ?? 0, accuracy: state?.accuracy ?? 0, adj: state?.adjWpm ?? 0, dur: state?.durationSec ?? 0, chars: state?.rawChars ?? 0, totalQChars: Math.max(0, Number(state?.totalQChars || 0)) })
  const [siteAvg, setSiteAvg] = useState<number | null>(null)
  const [percentile, setPercentile] = useState<number | null>(null)
  const [histAdj, setHistAdj] = useState<Array<{ i: number; adj: number; ts?: Date; durationSec?: number; rawChars?: number; accuracy?: number; totalQChars?: number }>>([])
  const [histAcc, setHistAcc] = useState<Array<{ i: number; acc: number; ts?: Date; durationSec?: number; rawChars?: number; adj?: number; totalQChars?: number }>>([])
  const [showInsights, setShowInsights] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        // 只有當非測驗導向且目前沒有任何值時，才回退到 lastAttempt
        if (!state?.fromTest && !(vals.raw > 0 || vals.accuracy > 0 || vals.adj > 0)) {
          if (user) {
            const ref = doc(db, 'profiles', user.uid)
            const snap = await getDoc(ref)
            const la = (snap.data() as any)?.lastAttempt as LastAttempt | undefined
            if (la) setVals({ raw: Number(la.raw||0), accuracy: Number(la.accuracy||0), adj: Number(la.adjWpm||0), dur: Number(la.durationSec||0), chars: Number(la.rawChars||0), totalQChars: 0 })
          }
        }
      } catch {}
    })()
  }, [user, state?.fromTest, vals.raw, vals.accuracy, vals.adj])

  // 以「同語言」近 30 天樣本估算站內平均（修剪平均）
  useEffect(() => {
    void (async () => {
      try {
        const L = (lang || 'en-US') as string
        const rows = await getAttemptsWindow({ lang: L, days: 30, sampleLimit: 500 })
        const vals = rows.map((r: any) => Number((r as any).adjWpm || 0)).filter((v) => Number.isFinite(v))
        const sorted = vals.slice().sort((a,b)=>a-b)
        const avg = trimmedMean(sorted, 0.2)
        setSiteAvg(avg || 0)
        if (sorted.length) {
          const cur = Number(state?.adjWpm ?? adj) || 0
          // 以「嚴格小於你的人」佔比作為百分位；範圍 [0.01, 99.99]
          const below = sorted.filter(v => v < cur).length
          const rawPct = (below / sorted.length) * 100
          const pct = Math.min(99.99, Math.max(0.01, Number(rawPct.toFixed(2))))
          setPercentile(Number.isFinite(pct) ? pct : null)
        } else {
          setPercentile(null)
        }
      } catch {
        setSiteAvg(30)
      }
    })()
  }, [lang, state?.adjWpm, vals.adj])

  // 讀取本人最近表現供 Insights 圖表，並把「本次這一筆」也塞到最後
  useEffect(() => {
    void (async () => {
      try {
        let rows: Array<Record<string, unknown>> = []
        if (user) rows = await getAttemptsWindow({ uid: user.uid, days: 30, sampleLimit: 50 })
        const list = rows.slice().reverse()
        const toDateSafe = (v: unknown): Date | undefined => {
          try {
            if (!v) return undefined
            if (v instanceof Date) return v
            if (typeof v === 'number') return new Date(v)
            if (typeof v === 'object' && v && 'toDate' in (v as Record<string, unknown>)) {
              const fn = (v as { toDate?: () => Date }).toDate
              return typeof fn === 'function' ? fn() : undefined
            }
          } catch {}
          return undefined
        }
        const adjArr = list.map((r: any, i: number) => ({ 
          i, 
          adj: Number((r as any).adjWpm || 0), 
          ts: toDateSafe((r as any).ts),
          durationSec: Number(r.durationSec || 0),
          rawChars: Number(r.rawChars || 0),
          accuracy: Math.max(0, Math.min(1, Number(r.accuracy || 0))),
          totalQChars: Array.isArray(r.questions) ? r.questions.reduce((sum: number, q: any) => sum + Number(q.chars || 0), 0) : 0
        }))
        const accArr = list.map((r: any, i: number) => ({ 
          i, 
          acc: Math.max(0, Math.min(1, Number((r as any).accuracy || 0))), 
          ts: toDateSafe((r as any).ts),
          durationSec: Number(r.durationSec || 0),
          rawChars: Number(r.rawChars || 0),
          adj: Number(r.adjWpm || 0),
          totalQChars: Array.isArray(r.questions) ? r.questions.reduce((sum: number, q: any) => sum + Number(q.chars || 0), 0) : 0
        }))
        // 追加當前這一場（確保圖表最後一點是「最近」）
        if (Number.isFinite(vals.adj) && (vals.adj || 0) >= 0) {
          adjArr.push({ 
            i: adjArr.length, 
            adj: Number(vals.adj || 0), 
            ts: new Date(),
            durationSec: Number(vals.dur || 0),
            rawChars: Number(vals.chars || 0),
            accuracy: Math.max(0, Math.min(1, Number(vals.accuracy || 0))),
            totalQChars: Number(vals.totalQChars || 0)
          })
        }
        if (Number.isFinite(vals.accuracy) && (vals.accuracy || 0) >= 0) {
          accArr.push({ 
            i: accArr.length, 
            acc: Math.max(0, Math.min(1, Number(vals.accuracy || 0))), 
            ts: new Date(),
            durationSec: Number(vals.dur || 0),
            rawChars: Number(vals.chars || 0),
            adj: Number(vals.adj || 0),
            totalQChars: Number(vals.totalQChars || 0)
          })
        }
        setHistAdj(adjArr)
        setHistAcc(accArr)
      } catch {
        setHistAdj([]); setHistAcc([])
      }
    })()
  }, [user, vals.adj, vals.accuracy, vals.dur, vals.chars, vals.totalQChars])

  const acc = vals.accuracy
  const adj = vals.adj
  const chars = vals.chars
  const dur = vals.dur
  const totalQChars = vals.totalQChars

  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-2">結果</h2>
      <div className="p-4 border rounded-[12px] shadow-[var(--elevation-card,0_1px_2px_rgba(0,0,0,.06),_0_2px_8px_rgba(0,0,0,.04))] text-left">
        <div className="h3 mb-2">本次總結</div>
        <ul className="list-disc list-inside space-y-1 pl-1 text-left">
          <li>題目總字數：{totalQChars > 0 ? totalQChars : '—'} 字 · 實際輸入：{chars > 0 ? chars : '—'} 字</li>
          <li>花費時間：{dur > 0 ? `${dur.toFixed(2)} 秒` : '—'}</li>
          <li className="flex items-start gap-1">
            <span>正確率：{(acc*100).toFixed(0)}%</span>
            <Tooltip label="正確率 = 正確字 ÷ 題目總字。注意：沒輸入的字也算在題目總字內，所以多漏字會讓正確率下降。">？</Tooltip>
          </li>
          <li className="flex items-start gap-1">
            <span>綜合分數（正確速度）：{adj.toFixed(1)}</span>
            <Tooltip label="綜合分數 = 只計正確字的輸入速度。計算方式：速度（WPM/CPM）× 正確率。用意：先把正確率練穩，再慢慢變快。">？</Tooltip>
          </li>
          {siteAvg != null && (<li>相較站內平均（同語言）：{adj.toFixed(1)} / {siteAvg.toFixed(1)}{percentile!=null?` · 超過約 ${(percentile as number).toFixed(2)}% 人`:''}</li>)}
        </ul>
        <div className="mt-3 flex gap-3">
          <Link to={`/${lang}/test`} className="inline-flex items-center gap-1 px-3 h-10 rounded-[10px] border">再試一次</Link>
          <button className="inline-flex items-center gap-1 px-3 h-10 rounded-[10px] border" onClick={() => setShowInsights(s=>!s)}>{showInsights ? '隱藏深入分析' : '顯示深入分析'}</button>
        </div>
      </div>
      {showInsights && (
        <div className="mt-6" aria-describedby="insights-desc">
          <div id="insights-desc" className="mb-2 text-[var(--color-muted,#6b7280)]">
            下面兩張圖幫你了解「最近的表現」。綠色線越高表示越快；藍色線越高表示越準。
          </div>
          <ChartSection topText="上：綜合分數趨勢；下：正確率趨勢。綜合分數把速度與正確率一起算。先把正確率提高，再慢慢變快。">
            <SpeedChart data={histAdj.length ? histAdj : Array.from({length: 30},(_,i)=>({ i, adj }))} />
            <div className="h-3" />
            <AccuracyChart data={histAcc.length ? histAcc : Array.from({length: 30},(_,i)=>({ i, acc }))} />
          </ChartSection>
        </div>
      )}
    </div>
  )
}
export default Result