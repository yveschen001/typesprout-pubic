import { useParams } from 'react-router-dom'
import Seo from '../adapters/seo/Seo'
import { useState } from 'react'
import { ENV } from '../libs/env'
import { adminBulkTranslate } from '../adapters/sheets/admin'

export default function Admin() {
  const { lang } = useParams()
  const L = lang || 'en-US'
  return (
    <div className="max-w-[960px] mx-auto px-4">
      <Seo title="管理後台 — TypeSprout" description="管理工具（不對一般使用者開放）。" canonicalPath={`/${L}/admin`} />
      <meta name="robots" content="noindex,nofollow" />
      <h2 className="h2 mb-3">管理後台</h2>
      <p className="body muted">此區僅供維運與內容管理使用。</p>
      {ENV.SHEETS_ADMIN_TOKEN && (
        <div className="mt-6 p-4 border border-[var(--color-border,#e5e7eb)] rounded-[12px]">
          <h3 className="h3 mb-2">大量在地化工具</h3>
          <AdminTranslateBlock />
          <details className="mt-2">
            <summary className="cursor-pointer select-none">？ 使用說明</summary>
            <div className="mt-2 text-sm text-[var(--color-muted,#6b7280)]">輸入來源與目標語言代碼，貼上多行文字後按下執行，結果僅供人工複核。此功能需管理權杖啟用。</div>
          </details>
        </div>
      )}
    </div>
  )
}

function AdminTranslateBlock() {
  const [src, setSrc] = useState('en-US')
  const [dst, setDst] = useState('zh-TW')
  const [texts, setTexts] = useState('hello\nworld')
  const [out, setOut] = useState<string>('')
  const [pending, setPending] = useState(false)
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input className="h-10 rounded-[12px] border px-3" value={src} onChange={(e)=>setSrc(e.target.value)} aria-label="來源語言" />
        <input className="h-10 rounded-[12px] border px-3" value={dst} onChange={(e)=>setDst(e.target.value)} aria-label="目標語言" />
      </div>
      <textarea className="w-full h-28 rounded-[12px] border px-3 py-2" value={texts} onChange={(e)=>setTexts(e.target.value)} aria-label="多行文字（每行一筆）" />
      <div className="mt-2">
        <button className="px-4 h-10 rounded-[12px] border" disabled={pending} onClick={async ()=>{
          try{ setPending(true); const res = await adminBulkTranslate({ sourceLang: src, targetLang: dst, texts: texts.split('\n').filter(Boolean) }); setOut(JSON.stringify(res?.items||[], null, 2)) } finally { setPending(false) }
        }}>執行</button>
      </div>
      {out && (<pre className="mt-2 p-2 bg-gray-50 rounded-md overflow-auto text-xs">{out}</pre>)}
    </div>
  )
}


