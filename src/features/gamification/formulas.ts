import { typingConfig } from '../typing/config'
import type { LangKey } from '../typing/config'

export function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }

export function computeEP(params: { lang: LangKey; grade: 1|2|3|4|5|6; minutes: number; adj: number; accuracy: number }) {
  const { lang, grade, minutes, adj, accuracy } = params
  const base = typingConfig.baseByLang[lang]
  const target = typingConfig.targetByGrade[lang][grade]
  const ep = base * minutes * clamp(adj / target, 0, 2) * (0.5 + 0.5 * accuracy)
  return Math.max(0, Math.floor(ep))
}

export function computeGP(ep: number, boosters: { fertilizer: boolean; water: boolean }) {
  const bonus = (boosters.fertilizer ? 0.2 : 0) + (boosters.water ? 0.1 : 0)
  return Math.max(0, Math.floor(ep * (1 + bonus)))
}

export function computeFruits(dailyGP: number, streakDays: number) {
  const streakFactor = Math.min((streakDays / 7) * 0.1, 0.3)
  return Math.floor((dailyGP / 100) * (1 + streakFactor))
}

export function shouldWither(lastActiveDateISO: string, nowMs: number = Date.now()) {
  const last = new Date(lastActiveDateISO || new Date(nowMs).toLocaleDateString('en-CA'))
  const days = Math.floor((nowMs - last.getTime()) / (24*60*60*1000))
  return days >= 7
}

export function canRevive(waterCount: number, todayTestSeconds: number) {
  return waterCount >= 3 && todayTestSeconds >= 60
}


