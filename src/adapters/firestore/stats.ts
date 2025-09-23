import { db } from '../../libs/firebase'
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore'

// simple in-memory cache with TTL
type CacheEntry<T> = { at: number; data: T }
const cache: Map<string, CacheEntry<unknown>> = new Map()
const TTL_MS = 60 * 1000 // 1 min
function getCache<T>(key: string): T | null {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T
  return null
}
function setCache<T>(key: string, data: T) { cache.set(key, { at: Date.now(), data }) }

// 由於 Firestore 規則通常不允許公開讀取 profiles，
// 這裡避免使用聚合 count；改以 attempts 近 30 天樣本估算去重使用者數。
export async function getTotalUsers(): Promise<number> {
  const key = 'totalUsers'
  const cached = getCache<number>(key)
  if (cached != null) return cached
  try {
    const since = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const q = query(collection(db, 'attempts'), where('ts', '>=', since), orderBy('ts', 'desc'), limit(2000))
    const snaps = await getDocs(q)
    const unique = new Set<string>()
    for (const d of snaps.docs) {
      const data = d.data() as Record<string, unknown>
      const uid = data.uid as string | undefined
      if (uid) unique.add(uid)
    }
    setCache(key, unique.size)
    return unique.size
  } catch {
    return cached ?? 0
  }
}

// 全站歷史玩家總數（近似）：
// 由於無法公開讀 profiles，改以 attempts 全量去重 uid 估算。
// 注意：此方法受限於查詢上限與抽樣；如需更準確，建議改為後台週期彙總到 metrics。
export async function getTotalUsersAllTime(sampleLimit: number = 10000): Promise<number> {
  const key = `totalUsersAll:${sampleLimit}`
  const cached = getCache<number>(key)
  if (cached != null) {
    console.log('getTotalUsersAllTime: using cached value:', cached)
    return cached
  }
  try {
    // Firebase限制最大10000，所以使用Math.min确保不超过限制
    const actualLimit = Math.min(sampleLimit, 10000)
    const q = query(collection(db, 'attempts'), orderBy('ts', 'desc'), limit(actualLimit))
    const snaps = await getDocs(q)
    console.log('getTotalUsersAllTime: fetched attempts:', snaps.docs.length, 'limit:', actualLimit)
    const unique = new Set<string>()
    for (const d of snaps.docs) {
      const data = d.data() as Record<string, unknown>
      const uid = data.uid as string | undefined
      console.log('getTotalUsersAllTime: attempt uid:', uid, 'data:', data)
      if (uid) unique.add(uid)
    }
    console.log('getTotalUsersAllTime: unique users:', unique.size, 'uids:', Array.from(unique))
    setCache(key, unique.size)
    return unique.size
  } catch (error) {
    console.error('getTotalUsersAllTime: error:', error)
    return cached ?? 0
  }
}

export type AttemptsWindow = {
  lang?: string
  days?: number
  sampleLimit?: number
  uid?: string
}

export async function getAttemptsWindow({ lang, days = 7, sampleLimit = 500, uid }: AttemptsWindow) {
  const key = `attempts:${lang||'*'}:${uid||'*'}:${days}:${sampleLimit}`
  const cached = getCache<Record<string, unknown>[]>(key)
  if (cached) return cached
  try {
    const since = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000)
    let q = query(collection(db, 'attempts'), where('ts', '>=', since), orderBy('ts', 'desc'), limit(sampleLimit))
    if (lang) {
      q = query(collection(db, 'attempts'), where('lang', '==', lang), where('ts', '>=', since), orderBy('ts', 'desc'), limit(sampleLimit))
    }
    if (uid) {
      q = query(collection(db, 'attempts'), where('uid', '==', uid), where('ts', '>=', since), orderBy('ts', 'desc'), limit(sampleLimit))
    }
    const snaps = await getDocs(q)
    const rows = snaps.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    setCache(key, rows)
    return rows
  } catch {
    return cached ?? []
  }
}

export function trimmedMean(values: number[], trimRatio = 0.2): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const k = Math.floor(sorted.length * (trimRatio / 2))
  const trimmed = sorted.slice(k, sorted.length - k)
  const sum = trimmed.reduce((s, v) => s + v, 0)
  return sum / Math.max(1, trimmed.length)
}

// 匿名國家統計占位：
// 實作建議：profiles/{uid} 內儲存 country: ISO-3166-1 alpha-2，
// 讀取時僅做聚合計數，不回傳任何個資。
export async function getCountryCounts(): Promise<Record<string, number>> {
  const key = 'countryCounts'
  const cached = getCache<Record<string, number>>(key)
  if (cached) return cached
  try {
    // 先讀彙總 metrics_country（若存在則直接使用），否則退回掃描 profiles
    const aggSnap = await getDocs(query(collection(db, 'metrics_country'), limit(300)))
    const counts: Record<string, number> = {}
    if (!aggSnap.empty) {
      for (const d of aggSnap.docs) {
        const c = d.id.toUpperCase()
        const v = Number((d.data() as Record<string, unknown>)?.count || 0)
        counts[c] = v
      }
    } else {
      const snaps = await getDocs(query(collection(db, 'profiles'), limit(2000)))
      for (const d of snaps.docs) {
        const c = (d.data() as Record<string, unknown>)?.country as string | undefined
        if (!c) continue
        const code = c.toUpperCase()
        counts[code] = (counts[code] || 0) + 1
      }
    }
    setCache(key, counts)
    return counts
  } catch {
    return cached ?? {}
  }
}


