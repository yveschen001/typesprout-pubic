import { useParams } from 'react-router-dom'
import KeyboardHeatmap from '../components/KeyboardHeatmap'
import SpeedChart from '../components/metrics/SpeedChart'
import AccuracyChart from '../components/metrics/AccuracyChart'
import { fetchContent } from '../adapters/sheets/content'
import type { StructuredText } from '../adapters/sheets/parse'

export default function Practice() {
  const { lang } = useParams()
  const L = lang || 'en-US'
  const isZh = L.startsWith('zh')
  // non-blocking content preload & show first structured sample
  void (async () => {
    try {
      const items = await fetchContent({ lang: L, limit: 1 })
      const first = items && (items as any[])[0]
      const st = (first as any)?.structured as StructuredText | undefined
      // 可在此處把 st.q 展示到 UI（此頁目前僅示例，不做實際渲染）
    } catch {}
  })()
  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-3">Practice</h2>
      <p className="body muted">Free typing practice with IME support and modes.</p>
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <div className="p-4 border border-[var(--color-border,#e5e7eb)] rounded-[12px] shadow-[var(--elevation-card,0_1px_2px_rgba(0,0,0,.06),_0_2px_8px_rgba(0,0,0,.04))]">
          <h3 className="h3 mb-2">Text source</h3>
          <p className="body muted">Coming soon</p>
        </div>
        <div className="p-4 border border-[var(--color-border,#e5e7eb)] rounded-[12px] shadow-[var(--elevation-card,0_1px_2px_rgba(0,0,0,.06),_0_2px_8px_rgba(0,0,0,.04))]">
          <h3 className="h3 mb-2">Options</h3>
          <p className="body muted">Bopomofo tips / punctuation modes</p>
        </div>
      </div>
      <div className="mt-6">
        <details>
          <summary className="cursor-pointer select-none">Insights</summary>
          <div className="mt-3 flex flex-wrap gap-6 items-start">
            <KeyboardHeatmap layout={isZh? 'bopomofo':'qwerty'} colorBy={{}} />
            <div className="grow min-w-[280px]">
              <SpeedChart data={Array.from({length: 20},(_,i)=>({i, adj: 0}))} />
              <div className="h-3" />
              <AccuracyChart data={Array.from({length: 20},(_,i)=>({i, acc: 0}))} />
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}


