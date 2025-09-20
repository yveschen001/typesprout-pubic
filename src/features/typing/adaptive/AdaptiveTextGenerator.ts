import adaptiveConfig from '../../../config/adaptive'

export type KeyStatsProvider = {
  getErrRateByKey: (k: string) => number
  getLatencyZ: (k: string) => number
}

export class AdaptiveTextGenerator {
  private lang: string
  private baseFreq: Record<string, number>
  private bigrams: Array<[string, number]>
  private stats: KeyStatsProvider

  constructor(params: { lang: string; baseFreq: Record<string, number>; bigrams?: Array<[string, number]>; stats: KeyStatsProvider }) {
    this.lang = params.lang
    this.baseFreq = params.baseFreq
    this.bigrams = params.bigrams || []
    this.stats = params.stats
  }

  private weightFor(key: string): number {
    const base = this.baseFreq[key] ?? 0.0001
    const err = this.stats.getErrRateByKey(key)
    const z = this.stats.getLatencyZ(key)
    const { alpha, beta } = adaptiveConfig
    return base * (1 + alpha * err) * (1 + beta * z)
  }

  generateEnglish(count = 30): string {
    const letters = Object.keys(this.baseFreq)
    const weights = letters.map((k) => this.weightFor(k))
    const pick = () => this.weightedPick(letters, weights)
    const chunks: string[] = []
    let last2 = ''
    for (let i = 0; i < count; i++) {
      let ch = pick()
      // avoid 3 consecutive same
      if (last2[0] === ch && last2[1] === ch) ch = pick()
      chunks.push(ch)
      last2 = (last2 + ch).slice(-2)
      // occasionally insert bigram
      if (Math.random() < adaptiveConfig.english.bigramsWeight && this.bigrams.length > 0) {
        const [bg] = this.bigrams[Math.floor(Math.random() * this.bigrams.length)]
        chunks.push(bg)
      }
    }
    return chunks.join(' ')
  }

  generateChinese(count = 30): string {
    const keys = Object.keys(this.baseFreq)
    const weights = keys.map((k) => this.weightFor(k))
    const pick = () => this.weightedPick(keys, weights)
    const res: string[] = []
    for (let i = 0; i < count; i++) {
      const len = Math.floor(Math.random() * (adaptiveConfig.chinese.maxChunk - adaptiveConfig.chinese.minChunk + 1)) + adaptiveConfig.chinese.minChunk
      let word = ''
      for (let j = 0; j < len; j++) word += pick()
      res.push(word)
    }
    return res.join(' ')
  }

  decayOnSuccess(successKeys: string[]) {
    // Reduce base frequency slightly for recently mastered keys
    successKeys.forEach((k) => {
      if (this.baseFreq[k]) this.baseFreq[k] *= 0.98
    })
  }

  private weightedPick(keys: string[], weights: number[]): string {
    const sum = weights.reduce((s, v) => s + v, 0)
    let r = Math.random() * (sum || 1)
    for (let i = 0; i < keys.length; i++) {
      r -= weights[i]
      if (r <= 0) return keys[i]
    }
    return keys[keys.length - 1]
  }
}

export default AdaptiveTextGenerator


