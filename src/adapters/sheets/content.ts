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

export async function fetchContent(params: { lang: string; grade?: number; limit?: number; after?: string; signal?: AbortSignal; startPage?: number; pageCount?: number }): Promise<TContentItem[] | null> {
  if (!ENV.SHEETS_CONTENT_URL) {
    markSource('local:no_url')
    return buildLocalFallback({ lang: params.lang, limit: params.limit })
  }
  // 支援本地靜態分頁：/index.json + /<lang>/page-0001.json
  const isLocalIndex = /\.json($|\?)/i.test(ENV.SHEETS_CONTENT_URL) && !/type=/.test(ENV.SHEETS_CONTENT_URL)
  if (isLocalIndex) {
    try {
      const indexUrl = new URL(ENV.SHEETS_CONTENT_URL, location.origin)
      const resIdx = await fetch(indexUrl.toString(), { signal: params.signal })
      const idx = await resIdx.json() as { langs?: string[]; filesPerLang?: Record<string, number>; pageSize?: number }
      const available = new Set<string>(Array.isArray(idx.langs) ? idx.langs as string[] : [])
      const usedLang = params.lang
      if (!available.has(usedLang)) {
        // 嚴格模式：找不到就返回空陣列（由上層顯示錯誤），不做任何語言映射或回退
        console.warn('[content] missing language in index.json:', usedLang)
        markSource('local:lang-missing')
        return []
      }
      const base = indexUrl.toString().replace(/[^/]*$/, '')
      const totalPages = Math.max(1, Number(idx.filesPerLang?.[usedLang] || 1))
      const pageSize = Math.max(1, Number(idx.pageSize || 200))
      const need = Math.max(1, Math.min(params.limit || (pageSize * totalPages), pageSize * totalPages))
      const startPage = Math.max(1, Math.min(Number((params.startPage as number) || Number(params.after) || 1), totalPages))
      const maxPages = Math.max(1, Math.min(Number((params.pageCount as number) || totalPages), totalPages - startPage + 1))
      const out: TContentItem[] = []
      for (let pi = 0; pi < maxPages && out.length < need; pi++) {
        const p = startPage + pi
        const pagePath = `${usedLang}/page-${String(p).padStart(4, '0')}.json`
        const pageUrl = new URL(pagePath, base)
        try {
          const res = await fetch(pageUrl.toString(), { signal: params.signal })
          const js = await res.json() as { items?: Array<Record<string, unknown>> }
          const items = Array.isArray(js.items) ? js.items : []
          for (const raw of items) {
            const it = {
              id: String((raw as any).id ?? ''),
              lang: String((raw as any).lang ?? usedLang),
              text: String((raw as any).text ?? ''),
              type: typeof (raw as any).type === 'string' ? String((raw as any).type) : undefined,
              grade_min: Number.isFinite((raw as any).grade_min) ? Number((raw as any).grade_min) : undefined,
              grade_max: Number.isFinite((raw as any).grade_max) ? Number((raw as any).grade_max) : undefined,
              tags: typeof (raw as any).tags === 'string' ? String((raw as any).tags) : undefined,
            } as TContentItem
            // 本地靜態資料：略過結構化解析以提升首次載入速度
            out.push(it)
            if (out.length >= need) break
          }
        } catch {
          // 某頁失敗則跳過，繼續下一頁
        }
      }
      // 嚴格模式：不做任何前端轉換，資料應該已是最終語言內容
      markSource('local:index')
      return out
    } catch {
      // 退路：直接嘗試抓取第一頁（/lang/page-0001.json），避免 index.json 阻塞
      try {
        const origin = location.origin
        const pageUrl = `${origin}/${params.lang}/page-0001.json`
        const res = await fetch(pageUrl, { signal: params.signal })
        const js = await res.json() as { items?: Array<Record<string, unknown>> }
        const items = Array.isArray(js.items) ? js.items : []
        const lim = Math.max(1, Number(params.limit || 100))
        const out: TContentItem[] = []
        for (const raw of items) {
          out.push({
            id: String((raw as any).id || ''),
            lang: String((raw as any).lang || usedLang),
            text: String((raw as any).text || ''),
            type: typeof (raw as any).type === 'string' ? String((raw as any).type) : undefined,
            grade_min: Number.isFinite((raw as any).grade_min) ? Number((raw as any).grade_min) : undefined,
            grade_max: Number.isFinite((raw as any).grade_max) ? Number((raw as any).grade_max) : undefined,
            tags: typeof (raw as any).tags === 'string' ? String((raw as any).tags) : undefined,
          } as TContentItem)
          if (out.length >= lim) break
        }
        markSource('local:page-fallback')
        return out
      } catch {
        markSource('local:index-error')
        return buildLocalFallback({ lang: params.lang, limit: params.limit })
      }
    }
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


