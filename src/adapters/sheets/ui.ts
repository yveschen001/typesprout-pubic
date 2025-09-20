import { ENV } from '../../libs/env'
import { UIResponse } from '../../schemas/ui'

function setDeep(obj: any, path: string, value: string) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    if (!(k in cur)) cur[k] = {}
    cur = cur[k]
  }
  cur[parts[parts.length - 1]] = value
}

export async function fetchUI(lang: string): Promise<{ lang: string; dict: Record<string, any> } | null> {
  if (!ENV.SHEETS_UI_URL) return null
  try {
    const url = new URL(ENV.SHEETS_UI_URL)
    url.searchParams.set('type', 'ui')
    url.searchParams.set('lang', lang)
    const res = await fetch(url.toString())
    const json = await res.json()
    const parsed = UIResponse.parse(json)
    const dict: Record<string, any> = {}
    for (const it of parsed.items) setDeep(dict, it.key, it.value)
    return { lang: parsed.lang, dict }
  } catch {
    return null
  }
}


