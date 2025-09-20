export const typingConfig = {
  baseByLang: {
    'en-US': 10,
    'zh-TW': 10,
    'zh-CN': 10,
  },
  targetByGrade: {
    'en-US': { 1: 10, 2: 15, 3: 20, 4: 25, 5: 30, 6: 35 },
    'zh-TW': { 1: 60, 2: 70, 3: 80, 4: 100, 5: 110, 6: 120 },
    'zh-CN': { 1: 60, 2: 70, 3: 80, 4: 100, 5: 110, 6: 120 },
  },
  dailyEpCap: 100,
  extremes: { enWpm: 200, zhCpm: 400 },
  humanMaxCpm: 1000,
}

export type LangKey = keyof typeof typingConfig.baseByLang

