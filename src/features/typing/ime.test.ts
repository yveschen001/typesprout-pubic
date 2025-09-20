import { describe, it, expect } from 'vitest'

describe('IME composition behavior', () => {
  it('counts only on compositionend (conceptual)', () => {
    // 模擬：在 composition 中間輸入不應影響計數；結束時才採計
    let composing = true
    let value = ''
    function onChange(v: string){ if (!composing) value = v }
    onChange('abc')
    expect(value).toBe('')
    composing = false
    onChange('abc')
    expect(value).toBe('abc')
  })
})


