import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { defaultLang } from '../config/app'
import { fetchUI } from '../adapters/sheets/ui'

const resources = {
  'en-US': {
    translation: {
      nav: { home: 'Home', practice: 'Practice', test: 'Test', leaderboard: 'Leaderboard', profile: 'Profile', garden: 'Garden' },
      auth: { signIn: 'Sign in with Google', signOut: 'Sign out' },
      home: {
        title: 'TypeSprout — Kids Typing & Tree Growth',
        heroTitle: 'Kids type, the seedling grows.',
        heroSubtitle: 'Every keystroke becomes energy to water your tree. Multi-language support helps build correct typing habits and focus.',
        ctaPractice: 'Start Practice',
        ctaTest: 'Take Test',
        privacyNote: 'We do not collect personal data; statistics are anonymized for ranking and learning feedback only.',
        cards: {
          players: 'Players',
          avgAdj: 'Avg Composite (30d)',
          totalChars: 'Total Chars (30d)',
          meVsSite: 'Me vs Site (30d)'
        },
        tabs: { visitors: 'Visitors', leader: 'Leaderboard (preview)' },
        visitorsDesc: 'Country distribution of site visitors and players (anonymous).',
        leaderEmpty: 'No data yet',
        leaderViewFull: 'View full leaderboard',
        aboutTitle: 'About TypeSprout',
        aboutBody: 'TypeSprout is a typing practice and growth website for grades 1–6 with zh‑TW / zh‑CN / en‑US support, aiming to offer a safe and friendly environment for kids worldwide to practice input, understanding, and expression.'
      },
      test: {
        title: 'Typing Test',
        labels: {
          duration: 'Duration',
          questions: 'Questions',
          allowBackspace: 'Allow backspace',
          enMode: 'EN mode',
          typingLang: 'Typing language',
          left: 'Left'
        },
        fields: { question: 'Question', input: 'Input' },
        metricsTip: 'WPM: words per minute (Chinese uses CPM = chars/min). Acc: accuracy = correct / total. Composite = WPM/CPM × Acc. Tip: stabilize accuracy ≥90% first, then increase speed.',
        shortcuts: 'Shortcuts: Space start/pause · R reset · F focus input',
        finished: 'Finished',
        saveAndView: 'Save & View Result',
        signInToSave: 'Sign in to save',
        tryAgain: 'Try again',
        insightsSummary: 'Insights (keyboard heatmap, speed and accuracy trends)',
        heatmapNote: 'Colors now use green→yellow→red. Redder = higher error rate. The box hints the next key. Focus on red/yellow keys and practice slowly to reduce errors.',
        promptStart: 'Press Start and type. Paste is disabled.',
        promptBegin: 'Press Start to begin.',
        promptFinished: 'Finished! Press "Save & View Result" to submit.',
        promptTimeup: 'Time up! Press "Save & View Result" to submit.'
      }
    },
  },
  'zh-TW': {
    translation: {
      nav: { home: '首頁', practice: '練習', test: '測驗', leaderboard: '排行榜', profile: '個人', garden: '種樹' },
      auth: { signIn: '使用 Google 登入', signOut: '登出', loading: '載入中…' },
      home: {
        title: 'TypeSprout — 兒童打字與種樹成長',
        heroTitle: '孩子打字，樹苗長高。',
        heroSubtitle: '每次輸入都會化成能量澆灌你的樹，支援多語系，建立正確打字習慣與專注力。',
        ctaPractice: '立即開始練習',
        ctaTest: '進行測驗',
        privacyNote: '不蒐集個資；統計數據僅用於匿名排行與學習回饋。',
        cards: {
          players: '玩家數',
          avgAdj: '平均綜合分數（30 天）',
          totalChars: '總字數（30 天）',
          meVsSite: '我 vs 全站（30 天）'
        },
        tabs: { visitors: '訪客分佈', leader: '排行榜預覽' },
        visitorsDesc: '網站訪客與玩家的國家分佈（匿名統計）。',
        leaderEmpty: '暫無資料',
        leaderViewFull: '查看完整排行',
        aboutTitle: '關於 TypeSprout',
        aboutBody: 'TypeSprout 是面向 1–6 年級兒童的打字練習與成長網站，支援多語系（zh‑TW / zh‑CN / en‑US），希望讓全世界的小朋友都能在安全與友善的環境練習輸入、理解與表達。'
      },
      test: {
        title: '打字測驗',
        labels: {
          duration: '時長',
          questions: '題數',
          allowBackspace: '允許退格',
          enMode: '英文模式',
          typingLang: '輸入語言',
          left: '倒數'
        },
        fields: { question: '題目', input: '輸入' },
        metricsTip: 'WPM：每分鐘英文詞數（中文用 CPM＝每分鐘字數）。正確率＝正確/總字。綜合分數＝WPM/CPM × 正確率。先把正確率穩定到 90% 以上，再慢慢變快。',
        shortcuts: '快捷鍵：空白鍵 開始/暫停 · R 重置 · F 聚焦輸入',
        finished: '完成',
        saveAndView: '儲存並查看結果',
        signInToSave: '登入後可儲存',
        tryAgain: '再試一次',
        insightsSummary: '深入分析（速度與正確率趨勢）',
        heatmapNote: '',
        promptStart: '按下 Start 後輸入文字。禁止貼上。',
        promptBegin: '按 Start 開始。',
        promptFinished: '完成！按「儲存並查看結果」送出。',
        promptTimeup: '時間到！按「儲存並查看結果」送出。'
      }
    },
  },
  'zh-CN': {
    translation: {
      nav: { home: '首页', practice: '练习', test: '测验', leaderboard: '排行榜', profile: '个人', garden: '种树' },
      auth: { signIn: '使用 Google 登录', signOut: '登出' },
      home: {
        title: 'TypeSprout — 儿童打字与种树成长',
        heroTitle: '孩子打字，树苗长高。',
        heroSubtitle: '每次输入都会化成能量浇灌你的树，支持多语言，建立正确打字习惯与专注力。',
        ctaPractice: '立即开始练习',
        ctaTest: '进行测验',
        privacyNote: '不收集个人信息；统计数据仅用于匿名排行与学习反馈。',
        cards: { players: '玩家数', avgAdj: '平均综合分数（30 天）', totalChars: '总字数（30 天）', meVsSite: '我 vs 全站（30 天）' },
        tabs: { visitors: '访客分布', leader: '排行榜预览' },
        visitorsDesc: '网站访客与玩家的国家分布（匿名统计）。',
        leaderEmpty: '暂无数据',
        leaderViewFull: '查看完整排行',
        aboutTitle: '关于 TypeSprout',
        aboutBody: 'TypeSprout 面向 1–6 年级儿童，支持 zh‑TW / zh‑CN / en‑US，提供安全友好的练习环境。'
      },
      test: {
        title: '打字测验',
        labels: { duration: '时长', questions: '题数', allowBackspace: '允许退格', enMode: '英文模式', typingLang: '输入语言', left: '倒计时' },
        fields: { question: '题目', input: '输入' },
        metricsTip: 'WPM：每分钟英文词数（中文用 CPM）。正确率＝正确/总字。综合分数＝WPM/CPM × 正确率。建议先稳定正确率≥90%。',
        shortcuts: '快捷键：Space 开始/暂停 · R 重置 · F 聚焦输入',
        finished: '完成',
        saveAndView: '保存并查看结果',
        signInToSave: '登录后可保存',
        tryAgain: '再试一次',
        insightsSummary: 'Insights（键盘错误热点、速度与正确率趋势）',
        heatmapNote: '綠→黃→紅；越紅代表錯誤率越高。方框提示下一個鍵。',
        promptStart: '按 Start 后输入文字。禁止粘贴。',
        promptBegin: '按 Start 开始。',
        promptFinished: '完成！按“保存并查看结果”提交。',
        promptTimeup: '时间到！按“保存并查看结果”提交。'
      }
    },
  },
}

export function initI18n(defaultLng: string = defaultLang) {
  if (!i18n.isInitialized) {
    i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: defaultLng,
        fallbackLng: 'en-US',
        load: 'currentOnly',
        interpolation: { escapeValue: false },
        supportedLngs: ['en-US','zh-TW','zh-CN','es-MX','pt-BR','ja-JP','ko-KR','fr-FR','de-DE','it-IT','id-ID','vi-VN','th-TH','ru-RU','ar-SA','fil-PH','nl-NL','pl-PL','sv-SE','nb-NO','da-DK','fi-FI','ro-RO','el-GR','cs-CZ','hu-HU','uk-UA','ms-MY','hi-IN','bn-BD','he-IL','fa-IR','ur-PK','tr-TR'],
      })
    // try load UI strings from Sheets (non-blocking)
    void (async () => {
      try {
        const ui = await fetchUI(defaultLng)
        if (ui) {
          i18n.addResourceBundle(ui.lang, 'translation', ui.dict, true, true)
        }
      } catch {}
    })()
  }
  else {
    // already initialized → ensure language matches current route/default
    try { void i18n.changeLanguage(defaultLng) } catch {}
  }
  return i18n
}

export default i18n


