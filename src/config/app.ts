export const supportedLangs = [
  'zh-TW','en-US','es-MX','pt-BR','ja-JP','ko-KR','fr-FR','de-DE','it-IT','id-ID','vi-VN','th-TH','ru-RU','ar-SA','fil-PH','nl-NL','pl-PL','sv-SE','nb-NO','da-DK','fi-FI','ro-RO','el-GR','cs-CZ','hu-HU','uk-UA','ms-MY','hi-IN','bn-BD','he-IL','fa-IR','ur-PK','tr-TR','zh-CN'
] as const
export type Lang = typeof supportedLangs[number]
export const defaultLang: Lang = 'zh-TW'

export function isRtl(lang: string): boolean {
  const code = String(lang||'').toLowerCase()
  return code.startsWith('ar') || code.startsWith('he') || code.startsWith('fa') || code.startsWith('ur')
}


