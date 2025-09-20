export function movingAverage(values: number[], windowSize = 7) {
  const result: number[] = []
  for (let i=0;i<values.length;i++){
    const start = Math.max(0, i - windowSize + 1)
    const slice = values.slice(start, i+1)
    const avg = slice.reduce((s,v)=>s+v,0)/slice.length
    result.push(avg)
  }
  return result
}


