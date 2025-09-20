export function winsorize(values: number[], lower = 0.05, upper = 0.95) {
  if (values.length === 0) return [] as number[]
  const sorted = [...values].sort((a,b)=>a-b)
  const loV = sorted[Math.floor(sorted.length * lower)]
  const hiV = sorted[Math.floor(sorted.length * upper)]
  return values.map(v => Math.min(hiV, Math.max(loV, v)))
}

export function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((s,v)=>s+v,0) / values.length
}


