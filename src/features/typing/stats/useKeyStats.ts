import { useMemo, useRef } from 'react'

export type KeyStats = {
  hits: number
  misses: number
  sumLatencyMs: number
  lastDownAt?: number
}

export function useKeyStats() {
  const map = useRef<Map<string, KeyStats>>(new Map())
  const STORAGE_KEY = 'typesprout_keystats_v1'

  function readPersisted(): Record<string, { hits: number; misses: number }> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      const obj = JSON.parse(raw) as Record<string, { hits: number; misses: number }>
      return obj && typeof obj === 'object' ? obj : {}
    } catch {
      return {}
    }
  }

  function writePersisted(next: Record<string, { hits: number; misses: number }>) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  function onKeyDown(code: string) {
    const s = map.current.get(code) || { hits: 0, misses: 0, sumLatencyMs: 0 }
    s.lastDownAt = performance.now()
    map.current.set(code, s)
  }
  function onKeyUp(code: string, correct: boolean) {
    const s = map.current.get(code) || { hits: 0, misses: 0, sumLatencyMs: 0 }
    if (correct) s.hits += 1; else s.misses += 1
    if (s.lastDownAt) s.sumLatencyMs += performance.now() - s.lastDownAt
    s.lastDownAt = undefined
    map.current.set(code, s)
  }

  const api = useMemo(() => ({
    onKeyDown,
    onKeyUp,
    getErrRateByKey: (code: string) => {
      const s = map.current.get(code)
      const total = (s?.hits || 0) + (s?.misses || 0)
      return total > 0 ? (s!.misses / total) : 0
    },
    getLatencyZ: (code: string) => {
      // simple z-score proxy against global average
      let sum = 0, cnt = 0
      map.current.forEach((v) => { if ((v.hits+v.misses)>0) { sum += (v.sumLatencyMs / Math.max(1, v.hits+v.misses)); cnt++ } })
      const globalAvg = cnt>0 ? sum/cnt : 1
      const s = map.current.get(code)
      const avg = s && (s.hits + s.misses) > 0 ? (s.sumLatencyMs / Math.max(1, s.hits + s.misses)) : globalAvg
      return (avg - globalAvg) / (globalAvg || 1)
    },
    // 將本場統計合併到本機持久化（最近累積）
    persistSnapshot: () => {
      const persisted = readPersisted()
      map.current.forEach((v, k) => {
        const p = persisted[k] || { hits: 0, misses: 0 }
        p.hits += v.hits
        p.misses += v.misses
        persisted[k] = p
      })
      writePersisted(persisted)
    },
    // 回傳『最近累積（含本場）』的錯誤率地圖
    getAggregatedErrMap: () => {
      const persisted = readPersisted()
      const out: Record<string, number> = {}
      const keys = new Set<string>([...Object.keys(persisted), ...Array.from(map.current.keys())])
      keys.forEach((k) => {
        const p = persisted[k] || { hits: 0, misses: 0 }
        const s = map.current.get(k) || { hits: 0, misses: 0, sumLatencyMs: 0 }
        const hits = p.hits + s.hits
        const misses = p.misses + s.misses
        const total = hits + misses
        out[k] = total > 0 ? (misses / total) : 0
      })
      return out
    },
    dump: () => map.current,
  }), [])

  return api
}

export type UseKeyStats = ReturnType<typeof useKeyStats>


