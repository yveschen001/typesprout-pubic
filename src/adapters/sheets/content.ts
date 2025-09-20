import { ENV } from '../../libs/env'
import { ContentResponse } from '../../schemas/content'
import type { TContentItem } from '../../schemas/content'
import { parseStructuredText } from './parse'

// 本地 fallback：當未設定 VITE_SHEETS_CONTENT_URL 或請求失敗時，
// 以 repo 內的簡易資料生成可用題目，確保離線/未配置也能使用。
// 注意：這僅供開發測試，不代表最終正式題庫。
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import enNgrams from '../../../content/en/ngrams.json'
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import zhCommon from '../../../content/zh/common.json'

function buildLocalFallback(params: { lang: string; limit?: number }): TContentItem[] {
  const out: TContentItem[] = []
  const L = params.lang || 'en-US'
  const lim = Math.max(1, Math.min(500, params.limit || 200))

  if (L.startsWith('zh')) {
    const phrases = Array.isArray((zhCommon as any)?.phrases) ? (zhCommon as any).phrases as string[] : []
    const pool = phrases.length ? phrases : ['你好', '打字練習', '孩子打字，樹苗長高', '<span class="brand-title">TypeSprout</span>']
    for (let i = 0; i < lim; i++) {
      const a = pool[i % pool.length]
      const b = pool[(i + 1) % pool.length]
      const c = pool[(i + 2) % pool.length]
      const text = [a, b, c].join('，')
      out.push({ id: `${L}-local-${i}`, lang: L, text })
    }
  } else {
    const bigrams: Array<[string, number]> = Array.isArray((enNgrams as any)?.bigrams) ? (enNgrams as any).bigrams as Array<[string, number]> : []
    const seeds = bigrams.length ? bigrams.map(([bg]) => bg) : ['th', 'he', 'in', 'er', 're']
    const words = ['Kids', 'Typing', 'Tree', 'Growth', 'Practice', 'Focus']
    for (let i = 0; i < lim; i++) {
      const s1 = seeds[i % seeds.length]
      const s2 = seeds[(i + 3) % seeds.length]
      const text = `${words[i % words.length]} ${words[(i + 1) % words.length]} ${s1}${s2}`
      out.push({ id: `${L}-local-${i}`, lang: L, text })
    }
  }
  return out
}

function markSource(src: string) {
  try { localStorage.setItem('typesprout_last_content_source', src) } catch {}
}

export async function fetchContent(params: { lang: string; grade?: number; limit?: number; after?: string; signal?: AbortSignal }): Promise<TContentItem[] | null> {
  if (!ENV.SHEETS_CONTENT_URL) {
    markSource('local:no_url')
    return buildLocalFallback({ lang: params.lang, limit: params.limit })
  }
  try {
    const url = new URL(ENV.SHEETS_CONTENT_URL)
    url.searchParams.set('type', 'content')
    url.searchParams.set('lang', params.lang)
    if (params.grade) url.searchParams.set('grade', String(params.grade))
    if (params.limit) url.searchParams.set('limit', String(params.limit))
    if (params.after) url.searchParams.set('after', params.after)
    const res = await fetch(url.toString(), { signal: params.signal })
    const json = await res.json()
    const parsed = ContentResponse.parse(json)
    // normalize text into structured form if possible (non-destructive)
    for (const it of parsed.items as any[]) {
      if (typeof it.text === 'string') {
        const st = parseStructuredText(it.text)
        ;(it as any).structured = st
      }
    }
    markSource('remote')
    return parsed.items
  } catch {
    // 自動後備：不中斷使用，並標記來源供 UI 顯示提示
    markSource('local:error')
    return buildLocalFallback({ lang: params.lang, limit: params.limit })
  }
}

// legacy helper removed to avoid duplicate symbol; unified fetchContent above is the only export.


