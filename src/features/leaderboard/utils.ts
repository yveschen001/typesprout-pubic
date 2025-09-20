export type Attempt = {
  uid: string
  lang: string
  ts: any
  durationSec: number
  accuracy: number
  rawWpm?: number
  cpm?: number
  adjWpm?: number
  classCode?: string
}

export type LeaderboardOptions = {
  lang: string
  gradeFilter?: number
  classCode?: string
  uidToGrade?: Record<string, number>
}

export function filterAttempts(attempts: Attempt[], opts: LeaderboardOptions) {
  const L = opts.lang
  const isZh = L.startsWith('zh')
  return attempts
    .filter(a => a.lang === L)
    .filter(a => a.durationSec >= 30 && a.accuracy >= 0 && a.accuracy <= 1)
    .filter(a => {
      const raw = isZh ? a.cpm : a.rawWpm
      if (!raw) return false
      return isZh ? raw <= 400 : raw <= 200
    })
    .filter(a => (opts.classCode ? a.classCode === opts.classCode : true))
    .filter(a => {
      if (!opts.gradeFilter) return true
      const g = opts.uidToGrade?.[a.uid]
      return typeof g === 'number' ? g === opts.gradeFilter : false
    })
}

import { winsorize, average } from '../../utils/stats/winsorize'

export function toTopN(attempts: Attempt[], n = 20) {
  // compute stable score: take last 10 adjWpm, winsorize(5/95), then average
  function stableScore(uid: string) {
    const recent = attempts.filter(a=>a.uid===uid).sort((a,b)=> (b.ts?.toMillis?.()||0) - (a.ts?.toMillis?.()||0)).slice(0,10)
    const vals = recent.map(a=> Number(a.adjWpm||0)).filter(v=> Number.isFinite(v))
    if (vals.length === 0) return 0
    return average(winsorize(vals, 0.05, 0.95))
  }
  const byUser = Array.from(new Set(attempts.map(a=>a.uid))).map(uid => ({ uid, score: stableScore(uid) }))
  const uidToScore = Object.fromEntries(byUser.map(x=>[x.uid, x.score]))
  return [...attempts]
    .sort((a, b) => (uidToScore[b.uid] || 0) - (uidToScore[a.uid] || 0))
    .slice(0, n)
}


