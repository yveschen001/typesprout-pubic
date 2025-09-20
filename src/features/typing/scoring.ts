export function computeRawWpm(charsTyped: number, minutes: number): number {
  if (minutes <= 0) return 0
  return (charsTyped / 5) / minutes
}

export function computeCpm(chineseChars: number, minutes: number): number {
  if (minutes <= 0) return 0
  return chineseChars / minutes
}

export function computeAccuracy(correctChars: number, totalChars: number): number {
  if (totalChars <= 0) return 0
  const acc = correctChars / totalChars
  return Math.max(0, Math.min(1, acc))
}

export function computeAdjusted(rawOrCpm: number, accuracy: number): number {
  return rawOrCpm * Math.max(0, Math.min(1, accuracy))
}

export function isExtreme(lang: string, rawWpmOrCpm: number): boolean {
  const isZh = lang.startsWith('zh')
  return isZh ? rawWpmOrCpm > 400 : rawWpmOrCpm > 200
}


