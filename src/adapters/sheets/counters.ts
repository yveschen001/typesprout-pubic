import { z } from 'zod'

export const CountersSchema = z.object({
  totalUsers: z.number(),
  totalChars: z.number(),
  avgAdjWpm: z.number(),
})

export async function fetchCounters() {
  const url = import.meta.env.VITE_SHEETS_COUNTERS_URL as string | undefined
  if (!url) return null
  const res = await fetch(url)
  const json = await res.json()
  return CountersSchema.parse(json)
}


