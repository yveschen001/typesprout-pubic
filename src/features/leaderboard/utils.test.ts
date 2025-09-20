import { describe, it, expect } from 'vitest'
import { filterAttempts, toTopN } from './utils'

describe('leaderboard filter', () => {
  const attempts = [
    { uid: 'u1', lang: 'en-US', durationSec: 60, accuracy: 0.9, rawWpm: 80, adjWpm: 72 },
    { uid: 'u2', lang: 'en-US', durationSec: 20, accuracy: 0.9, rawWpm: 80, adjWpm: 72 },
    { uid: 'u3', lang: 'en-US', durationSec: 60, accuracy: 0.9, rawWpm: 220, adjWpm: 100 },
    { uid: 'u4', lang: 'en-US', durationSec: 60, accuracy: 0.8, rawWpm: 90, adjWpm: 72, classCode: 'A' },
  ] as any

  it('applies anti-cheat and class filter', () => {
    const filtered = filterAttempts(attempts, { lang: 'en-US', classCode: 'A' })
    expect(filtered.length).toBe(1)
    expect(filtered[0].uid).toBe('u4')
  })

  it('grade filter with uid mapping', () => {
    const filtered = filterAttempts(attempts, { lang: 'en-US', gradeFilter: 3, uidToGrade: { u1: 3, u4: 2 } })
    expect(filtered.length).toBe(1)
    expect(filtered[0].uid).toBe('u1')
  })

  it('toTopN sorts by adj', () => {
    const top = toTopN(filterAttempts(attempts, { lang: 'en-US' }), 1)
    expect(top[0].uid).toBe('u1' /* 72 vs u4=72 tie -> stable order ok */)
  })
})


