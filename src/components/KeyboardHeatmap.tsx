import React from 'react'

type Layout = 'qwerty'|'bopomofo'

const qwertyRows = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']
const bopomofoRows = ['ㄅㄆㄇㄈㄉㄊㄋㄌ','ㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖ','ㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝ','ㄞㄟㄠㄡㄢㄣㄤㄥㄦ']

export default function KeyboardHeatmap({ layout, colorBy, nextKey }: { layout: Layout; colorBy: Record<string, number>; nextKey?: string }) {
  const rows = layout==='qwerty' ? qwertyRows : bopomofoRows
  // 顏色刻度：預設閾值（5%/15%）；若整體錯誤率偏低，改用動態閾值（當前最大值的 40%/80%）提高對比度
  const vals = Object.values(colorBy)
  const maxV = vals.length ? Math.max(...vals) : 0
  const useRelative = maxV > 0 && maxV < 0.02 // 錯誤率極低時，改用相對刻度
  const low = !useRelative && (maxV > 0 && maxV < 0.08) ? Math.max(0.015, maxV * 0.4) : 0.05
  const mid = !useRelative && (maxV > 0 && maxV < 0.08) ? Math.max(low + 0.01, maxV * 0.8) : 0.15
  function color(v: number){
    if (useRelative) {
      const r = maxV > 0 ? (v / maxV) : 0
      if (r <= 0.3) return 'hsl(140, 70%, 45%)'
      if (r <= 0.7) return 'hsl(45, 85%, 52%)'
      return 'hsl(0, 80%, 55%)'
    } else {
      const p = Math.max(0, Math.min(1, v))
      if (p <= low) return 'hsl(140, 70%, 45%)'       // 綠
      if (p <= mid) return 'hsl(45, 85%, 52%)'        // 黃
      return 'hsl(0, 80%, 55%)'                       // 紅
    }
  }
  // 標記前三個高錯誤鍵（>5%）
  const top = Object.entries(colorBy).sort((a,b)=>b[1]-a[1]).slice(0,3).filter(([,v])=>v>low).map(([k])=>k)
  return (
    <div className="inline-block select-none">
      {rows.map((r, ri) => (
        <div key={ri} className="flex justify-center gap-1 mb-1">
          {r.split('').map((k) => {
            const v = colorBy[k] || 0
            const pct = Math.round(v * 100)
            const highlight = nextKey===k ? 'ring-2 ring-sky-400' : (top.includes(k) ? 'ring-2 ring-red-400' : '')
            return (
              <div key={k} className={`w-10 h-10 rounded-md border border-[var(--color-border,#e5e7eb)] flex flex-col items-center justify-center text-[11px] ${highlight}`} style={{ background: color(v) }} title={`${k}: ${pct}%`} aria-label={`${k} 錯誤率 ${pct}%`}>
                <div className="leading-none font-medium">{k}</div>
                <div className="leading-none text-[10px] opacity-90">{pct}%</div>
              </div>
            )
          })}
        </div>
      ))}
      <div className="mt-1 text-[11px] text-[var(--color-muted,#6b7280)]" aria-hidden>
        {useRelative
          ? '相對刻度：綠 ≤30% · 黃 ≤70% · 紅 ＞70%（相對於最高錯誤鍵；依「最近累積」錯誤率計算）'
          : `綠 ≤${Math.round(low*100)}% · 黃 ≤${Math.round(mid*100)}% · 紅 ＞${Math.round(mid*100)}%（% 為該鍵『最近累積』錯誤率）`}
      </div>
    </div>
  )
}


