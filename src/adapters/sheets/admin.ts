import { ENV } from '../../libs/env'

export type TranslateInput = { token: string; sourceLang: string; targetLang: string; texts: string[] }
export type TranslateResult = { items: Array<{ src: string; dst: string }> }

export async function adminBulkTranslate(input: Omit<TranslateInput, 'token'>): Promise<TranslateResult | null> {
  if (!ENV.SHEETS_UI_URL || !ENV.SHEETS_ADMIN_TOKEN) return null
  try {
    const url = new URL(ENV.SHEETS_UI_URL)
    url.searchParams.set('api', 'admin.translate')
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, token: ENV.SHEETS_ADMIN_TOKEN }),
    })
    const json = await res.json()
    return json as TranslateResult
  } catch {
    return null
  }
}


