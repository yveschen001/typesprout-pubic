export type StructuredText = { q: string; c?: string | string[]; a?: string; e?: string; s?: string }

export function parseStructuredText(text: string | unknown): StructuredText {
  if (typeof text !== 'string') return { q: '' }
  const s = text.trim()
  // fast path
  if (!s) return { q: '' }
  try {
    const obj = JSON.parse(s)
    if (obj && typeof obj === 'object' && 'q' in obj) return obj as StructuredText
  } catch {}
  // Fallback: tolerate pseudo JSON like "{a=..., c=...|...|..., q=...}" → 抽取 q 作為題幹
  if (s.startsWith('{') && s.includes('=')) {
    const m = s.match(/\bq=([^}]*)}/i)
    if (m && m[1]) {
      const q = m[1].trim()
      return { q }
    }
  }
  return { q: s }
}


