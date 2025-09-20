import { describe, it, expect } from 'vitest'
import { winsorize, average } from './winsorize'

describe('winsorize', () => {
  it('clamps extremes at given quantiles', () => {
    const vals = [1, 2, 3, 100]
    const w = winsorize(vals, 0.05, 0.95)
    expect(w[0]).toBeGreaterThanOrEqual(1)
    expect(w[3]).toBeLessThanOrEqual(100)
  })
  it('average works with winsorized values', () => {
    const vals = [10, 10, 10, 1000]
    const w = winsorize(vals, 0.05, 0.95)
    const a = average(w)
    expect(a).toBeGreaterThan(10)
    expect(a).toBeLessThan(1000)
  })
})


