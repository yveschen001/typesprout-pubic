import { useEffect, useState } from 'react'

export default function A11yPanel() {
  const [violations, setViolations] = useState<any[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    let axe: any
    ;(async () => {
      try {
        axe = (await import('axe-core')).default
        const res = await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a','wcag2aa'] } })
        setViolations(res.violations || [])
      } catch {
        // ignore
      }
    })()
    function onKey(e: KeyboardEvent) {
      if (e.key === '`') setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!import.meta.env.DEV || violations.length === 0 || !open) return null
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, width: 360, maxHeight: '60vh', overflow: 'auto', background: '#111827', color: 'white', borderRadius: 12, padding: 12, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,.3)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>A11y violations (dev only)</div>
      <ul style={{ fontSize: 12, lineHeight: 1.4 }}>
        {violations.map((v) => (
          <li key={v.id} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{v.id} — {v.impact}</div>
            <div style={{ opacity: .9 }}>{v.description}</div>
          </li>
        ))}
      </ul>
      <div style={{ opacity: .8, fontSize: 12 }}>Press ` to toggle</div>
    </div>
  )
}


