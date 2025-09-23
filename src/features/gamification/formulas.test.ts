import { describe, it, expect } from 'vitest'
import { computeEP, computeGP, computeFruits, shouldWither, canRevive } from './formulas'

describe('EP/GP formulas', () => {
  it('computes EP bounded and integer', () => {
    const ep = computeEP({ lang: 'en-US', grade: 3, minutes: 1, adj: 40, accuracy: 0.9 })
    expect(ep).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(ep)).toBe(true)
  })
  it('computes GP with boosters', () => {
    const gp = computeGP(100, { fertilizer: true, water: true })
    expect(gp).toBe(100 * (1 + 0.2 + 0.1))
  })
  it('fruits respects streak cap', () => {
    const f = computeFruits(400, 30)
    expect(f).toBe(Math.floor((400/100) * (1 + 0.3)))
  })
  it('wither and revive rules', () => {
    const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString('en-CA')
    expect(shouldWither(sevenDaysAgo)).toBe(true)
    expect(canRevive(3, 60)).toBe(true)
    expect(canRevive(2, 60)).toBe(false)
  })
})


