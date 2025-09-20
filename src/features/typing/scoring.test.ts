import { describe, it, expect } from 'vitest'
import { computeRawWpm, computeCpm, computeAccuracy, computeAdjusted, isExtreme } from './scoring'

describe('typing scoring', () => {
  it('computes raw wpm', () => {
    expect(computeRawWpm(250, 1)).toBe(50)
  })
  it('computes cpm', () => {
    expect(computeCpm(300, 1)).toBe(300)
  })
  it('accuracy bounded', () => {
    expect(computeAccuracy(90, 100)).toBeCloseTo(0.9)
    expect(computeAccuracy(0, 0)).toBe(0)
  })
  it('adjusted', () => {
    expect(computeAdjusted(60, 0.5)).toBe(30)
  })
  it('extreme filter', () => {
    expect(isExtreme('en-US', 250)).toBe(true)
    expect(isExtreme('zh-TW', 450)).toBe(true)
    expect(isExtreme('en-US', 100)).toBe(false)
  })
})


