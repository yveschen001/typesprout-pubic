export function inferCountryIso2(): string {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale
    const seg = loc.split('-')[1]
    if (seg && seg.length === 2) return seg.toUpperCase()
  } catch {}
  return 'US'
}

export const commonCountries: Array<{ code: string; name: string }> = [
  { code: 'US', name: 'United States' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'SG', name: 'Singapore' },
  { code: 'KR', name: 'Korea' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
]

// 完整 ISO 3166-1 alpha-2 代碼表（依官方列表；保留地區/特殊行政區在內）
export const iso2CountryCodes: string[] = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ',
  'VA','VC','VE','VG','VI','VN','VU',
  'WF','WS',
  'YE','YT',
  'ZA','ZM','ZW'
]

export function getAllCountries(locale?: string): Array<{ code: string; name: string }> {
  const loc = locale || (typeof navigator !== 'undefined' ? navigator.language : 'en')
  let dn: Intl.DisplayNames | null = null
  try { dn = new Intl.DisplayNames([loc], { type: 'region' }) } catch { dn = null }
  const arr = iso2CountryCodes.map((code) => {
    const name = dn?.of(code) || code
    return { code, name }
  })
  // 依 ISO2 代碼排序（英文字母序），避免不同語系造成的視覺順序差異
  return arr.sort((a, b) => String(a.code).localeCompare(String(b.code)))
}


