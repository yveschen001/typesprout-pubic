import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'
import Button from '../components/Button'
// KeyboardHeatmap removed per request
import SpeedChart from '../components/metrics/SpeedChart'
import AccuracyChart from '../components/metrics/AccuracyChart'
import ChartSection from '../components/metrics/ChartSection'
import { useAuth } from '../features/auth/hooks'
import { useKeyStats } from '../features/typing/stats/useKeyStats'
import { db } from '../libs/firebase'
import { addDoc, collection, serverTimestamp, Timestamp, doc, setDoc, increment, getDoc, getDocs, where, orderBy, query } from 'firebase/firestore'
import { applyAttemptRewards } from '../features/gamification/engine'
import type { ChangeEvent, CompositionEvent } from 'react'
import { fetchContent } from '../adapters/sheets/content'
import type { StructuredText } from '../adapters/sheets/parse'
import { getAttemptsWindow } from '../adapters/firestore/stats'
import { useTranslation } from 'react-i18next'
import { typingConfig } from '../features/typing/config'
import type { Timestamp as FBTimestamp } from 'firebase/firestore'

// removed legacy useTick (switched to rAF millisecond timer)

function hash32(s: string){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0 } return String(h) }

type QRec = { text: string; allowed: number; spent: number; mistakes: number }
type SheetItem = { id?: string; text?: string; structured?: StructuredText; grade_min?: number; grade_max?: number }
type KeyStat = { h: number; m: number }
type AttemptRow = { adjWpm?: number; accuracy?: number; ts?: Date | FBTimestamp | number; keystats?: Record<string, KeyStat> }

export default function Test() {
  const { t } = useTranslation()
  const [text, setText] = useState('Kids Typing & Tree Growth')
  const [input, setInput] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [running, setRunning] = useState(false)
  const [numQuestions, setNumQuestions] = useState(5)
  const [questions, setQuestions] = useState<string[]>([])
  const [qIndex, setQIndex] = useState(0)
  const [allowBackspace, setAllowBackspace] = useState(true)
  // 已移除 EN 模式/輸入語言選項
  const [typingLang] = useState<'auto'|'en'|'zh'>('auto')
  const [perCharSec, setPerCharSec] = useState(5)
  useEffect(() => {
    if (![1,3,5].includes(perCharSec)) setPerCharSec(5)
  }, [perCharSec])
  const allowedMsFor = useCallback((textStr: string) => Math.max(1000, Math.floor(textStr.length * perCharSec * 1000)), [perCharSec])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [leftMs, setLeftMs] = useState(0)
  const [histAdj, setHistAdj] = useState<Array<{ i: number; adj: number }>>([])
  const [histAcc, setHistAcc] = useState<Array<{ i: number; acc: number }>>([])
  // removed keyboard aggregate state
  const [loadingQs, setLoadingQs] = useState(false)
  const [loadError, setLoadError] = useState('')
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const composing = useRef(false)
  const [message, setMessage] = useState(t('test.promptStart'))
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { lang } = useParams()
  const { user } = useAuth()

  const [capsOn, setCapsOn] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [outOfFocus, setOutOfFocus] = useState(false)
  const keyStats = useKeyStats()
  const lastKeyRef = useRef<string>('')
  const composingKeysRef = useRef<string[]>([])
  const prevLenRef = useRef<number>(0)
  // 是否曾有實際輸入（任一題至少輸入 1 字）
  const hasAnyInputRef = useRef<boolean>(false)
  // 游標與已看過集合，推遲到按下 Start 才更新，避免未開始就「換題」
  const cursorKeyRef = useRef<string>('')
  const newCursorRef = useRef<number>(0)
  // 續載控制：下一個要抓的起始頁、避免重複預取的旗標
  const nextStartPageRef = useRef<number>(1)
  const prefetchingRef = useRef<boolean>(false)
  const seenKeyRef = useRef<string>('typesprout_seen_ids')
  const mergedSeenIdsRef = useRef<string[]>([])
  const [userGrade, setUserGrade] = useState<number | null>(null)
  const [gradeScope] = useState<'exact'|'near'|'all'>('exact')
  const [accumTyped, setAccumTyped] = useState(0)
  const [accumCorrect, setAccumCorrect] = useState(0)
  const [records, setRecords] = useState<QRec[]>([])
  const qStartRef = useRef<number>(0)
  const startAtRef = useRef<number>(0)
  const mistakesRef = useRef<number>(0)
  const submittingRef = useRef<boolean>(false)
  const finishedRef = useRef<boolean>(false)
  const answeredCountRef = useRef<number>(0)
  const didNavigateRef = useRef<boolean>(false)
  const sessionTotalRef = useRef<number>(0)
  const [gradeReady, setGradeReady] = useState(false)
  // 防止載入階段多次覆寫（React 18 StrictMode、依賴快速變動）
  const loadSeqRef = useRef(0)
  // 全局統計：本場累計輸入字數（不依賴 setState，避免競態）
  const totalTypedRef = useRef<number>(0)
  const totalMissedRef = useRef<number>(0)
  // 本題起跑（高精度）與總輸入毫秒
  const qStartPerfRef = useRef<number>(0)
  const totalInputMsRef = useRef<number>(0)
  // 本場 token 與逐題 payload
  const sessionTokenRef = useRef<string>('')
  const questionsPayloadRef = useRef<Array<{ qid: string; chars: number; spentMs: number; mistakes: number; fastViolation: boolean; tokenSig: string }>>([])

  // E2E 加速：?e2e=1 時縮短題數為 1 題，便於自動化通關
  useEffect(() => {
    // 預先載入 Result 分頁，避免最後導向時動態匯入偶發失敗
    try { void import('./Result') } catch (e) { if (import.meta.env.DEV) console.warn('prefetch Result failed', e) }
  }, [])

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get('e2e') === '1') setNumQuestions(1)
    } catch (e) { if (import.meta.env.DEV) console.warn('e2e flag parse failed', e) }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        if (!user) { setUserGrade(null); setGradeReady(true); return }
        const ref = doc(db, 'profiles', user.uid)
        const snap = await getDoc(ref)
        const pdata = snap.exists() ? (snap.data() as Record<string, unknown> | undefined) : undefined
        const gRaw = pdata?.grade
        const g = typeof gRaw === 'number' ? gRaw : Number(gRaw ?? NaN)
        setUserGrade(Number.isFinite(g) ? Math.max(1, Math.min(6, g)) : null)
      } catch { setUserGrade(null) }
      finally { setGradeReady(true) }
    })()
  }, [user])

  async function getTodayEarned(uid: string): Promise<number> {
    try {
      const today = new Date().toISOString().slice(0,10)
      const start = new Date(today + 'T00:00:00')
      const q = query(collection(db, 'economyLogs'), where('uid','==', uid), where('ts','>=', Timestamp.fromDate(start)), orderBy('ts','desc'))
      const snaps = await getDocs(q)
      let sum = 0
      snaps.docs.forEach(d => {
        const v = d.data() as { type?: string; source?: string; delta?: number }
        if (v.type==='earn' && v.source==='attempt') sum += Number(v.delta||0)
      })
      return sum
    } catch { return 0 }
  }

  useEffect(() => {
    if (!gradeReady) return
    void (async () => {
      const mySeq = ++loadSeqRef.current
      setLoadingQs(true)
      setLoadError('')
      try {
        // 先用快取（若有）立即上屏，後台再更新
        const cacheKey = `typesprout_qs_cache_${lang || 'en-US'}`
        try {
          const cachedArr = JSON.parse(localStorage.getItem(cacheKey) || '[]') as string[]
          if (Array.isArray(cachedArr) && cachedArr.length > 0 && mySeq === loadSeqRef.current) {
            setQuestions(cachedArr)
            setQIndex(0)
            const first = cachedArr[0] || 'Kids Typing & Tree Growth'
            setText(first)
            setInput(''); setRawInput('')
            setMessage(((lang || 'en-US').startsWith('zh') ? '按下 Start 後，請輸入上方文字。禁止貼上。' : 'Press Start and type the text above. Paste is disabled.'))
            const firstAllowed = allowedMsFor(first)
            setLeftMs(firstAllowed)
            setElapsedMs(0)
            setAccumTyped(0); setAccumCorrect(0)
            setRecords([])
            qStartRef.current = Date.now()
            mistakesRef.current = 0
            totalTypedRef.current = 0
            totalInputMsRef.current = 0
            questionsPayloadRef.current = []
            sessionTotalRef.current = cachedArr.length
            finishedRef.current = false
            const bytes = new Uint8Array(16); crypto.getRandomValues(bytes)
            sessionTokenRef.current = Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
            prevLenRef.current = 0
            qStartPerfRef.current = 0
          }
        } catch (e) { if (import.meta.env.DEV) console.warn('read cache failed', e) }

        // 正式抓取（設置超時，避免卡住）
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1500)
        let items: SheetItem[] | null = null
        try {
          type FetchArgs = { lang: string; grade?: number; limit?: number; after?: string; signal?: AbortSignal }
          // 動態控制抓取上限：以題數的 4 倍為上限，兼顧去重與年級篩選；最少 60，最多 200
          const dynamicLimit = Math.min(200, Math.max(numQuestions * 4, 60))
          // 先載「游標所在頁」的 1 頁（或 60 筆），立即可玩
          const cursorKey = `typesprout_cursor_${lang || 'en-US'}`
          const cur0 = Number(localStorage.getItem(cursorKey) || '0')
          // 從 index.json 讀取實際 pageSize（若取不到，退回 500）
          let pageSize = 500
          try {
            const res = await fetch('/index.json', { signal: controller.signal })
            const idx = await res.json() as { pageSize?: number }
            if (idx && Number(idx.pageSize)) pageSize = Math.max(1, Number(idx.pageSize))
          } catch {}
          const startPage = Math.max(1, Math.floor(cur0 / Math.max(1, pageSize)) + 1)
          items = await (fetchContent as (p: FetchArgs) => Promise<SheetItem[] | null>)({ lang: (lang || 'en-US'), limit: dynamicLimit, startPage, pageCount: 1, signal: controller.signal }) as SheetItem[] | null
          // 背景續載：若需要更多題，從下一頁開始抓 1~2 頁補池（不阻塞 UI）
          try {
            const needMore = dynamicLimit < 150
            if (needMore) {
              const nextStart = startPage + 1
              nextStartPageRef.current = Math.max(nextStartPageRef.current, nextStart)
              setTimeout(() => {
                (fetchContent as any)({ lang: (lang || 'en-US'), limit: 200, startPage: nextStart, pageCount: 2, signal: undefined })
                  .then((more: SheetItem[] | null) => {
                    if (!more || !more.length) return
                    // 合併到快取：沿用下方 cacheKey（只影響下一輪刷新）
                    try {
                      const cacheKey = `typesprout_qs_cache_${lang || 'en-US'}`
                      const cachedArr = JSON.parse(localStorage.getItem(cacheKey) || '[]') as string[]
                      const merge = [...cachedArr, ...more.map((m:any)=> String((m.structured as any)?.q || m.text || ''))]
                      localStorage.setItem(cacheKey, JSON.stringify(merge.slice(0, 800)))
                    } catch {}
                  })
                  .catch(() => {})
              }, 0)
            }
          } catch {}
        } catch (e) {
          if (import.meta.env.DEV) console.error('fetchContent failed', e)
          items = null
        } finally { clearTimeout(timeoutId) }
        if (!items) items = []
        if (!items || !Array.isArray(items) || items.length === 0) {
          const src = (()=>{ try { return localStorage.getItem('typesprout_last_content_source')||'' } catch { return '' } })()
          if (src === 'local:lang-missing') {
            setLoadError(`該語言目前找不到題庫（${lang || 'en-US'}）。請確認 public/${lang || 'en-US'}/page-0001.json 與 index.json 中的 langs / filesPerLang 已註冊。`)
          } else {
            const hint = src.startsWith('remote') ? '遠端資料為空' : '已自動改用本地後備題庫（不影響作答）'
            setLoadError(`取題失敗或資料為空：${hint}。若要使用雲端題庫，請在 GAS 執行「③ 一鍵同步」或檢查 /exec 權限。`)
          }
          setQuestions([]); setQIndex(0); setText('Kids Typing & Tree Growth')
          return
        }
        let list: SheetItem[] = items
        // 自動依使用者年齡/年級過濾：若有年級就取 G、含鄰近（G-1~G+1），否則不過濾
        if (userGrade != null) {
          const g = userGrade
          const lo = Math.max(1, g - 1)
          const hi = Math.min(6, g + 1)
          list = items.filter((it: SheetItem) => {
            const gm = Number(it.grade_min ?? NaN)
            const gx = Number(it.grade_max ?? NaN)
            if (!Number.isFinite(gm) || !Number.isFinite(gx)) return true
            return !(gx < lo || gm > hi)
          })
        }
        // 已看過題庫：本機 + 帳號（若登入）
        const seenKey = 'typesprout_seen_ids'
        const localSeen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || '[]'))
        // 從 profiles.lastSeenIds 讀（若存在）
        let profileSeen: Set<string> = new Set<string>()
        try{
          if (user){
            const ref = doc(db, 'profiles', user.uid)
            const snap = await getDoc(ref)
            const pdata = snap.data() as Record<string, unknown> | undefined
            const arr = (snap.exists() && Array.isArray(pdata?.lastSeenIds)) ? (pdata?.lastSeenIds as unknown as string[]) : []
            profileSeen = new Set(arr)
          }
        }catch(e){ if (import.meta.env.DEV) console.warn('read profileSeen failed', e) }
        const unionSeen = new Set<string>([...Array.from(localSeen), ...Array.from(profileSeen)])
        list = list.filter((it: SheetItem) => typeof it.id === 'string' && !unionSeen.has(String(it.id)))
        // 會話內避免重複：先從未看過池子隨機取樣；若已耗盡，才退回全部池子
        // 保留：若未來需要隨機抽題，可啟用此函數
        // function sample<T>(arr: T[], n: number): T[] {
        //   const a = arr.slice()
        //   for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
        //   return a.slice(0, Math.max(0, Math.min(n, a.length)))
        // }
        // 本場內絕不重複，且在整個題庫跑完之前不重複：採用『游標順序』而非隨機
        // 建立穩定 id：優先使用 it.id；若無，fallback 以文字 hash
        function hash32(s: string){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0 } return String(h) }
        const allWithId: Array<{ id: string; text: string }> = (list as SheetItem[]).map((it: SheetItem) => {
          const st = it.structured as StructuredText | undefined
          const q = st?.q || (typeof it.text === 'string' ? it.text : 'Kids Typing & Tree Growth')
          const sid = typeof it.id === 'string' && it.id.length ? it.id : hash32(q)
          return { id: sid, text: q }
        })
        // 先去重（以 id），維持來源順序
        const seenIds = new Set<string>()
        const uniqueAll: Array<{ id: string; text: string }> = []
        for (const it of allWithId) { if (!seenIds.has(it.id)) { seenIds.add(it.id); uniqueAll.push(it) } }
        // 防呆：若因過濾或已看過導致為空，退回使用「未過濾的原始 items」
        let pool: Array<{ id: string; text: string }> = uniqueAll
        if (pool.length === 0 && (items && items.length)) {
          const alt = (items as SheetItem[]).map((it: SheetItem) => {
            const st = it.structured as StructuredText | undefined
            const q = st?.q || (typeof it.text === 'string' ? it.text : 'Kids Typing & Tree Growth')
            const sid = typeof it.id === 'string' && it.id.length ? it.id : hash32(q)
            return { id: sid, text: q }
          })
          const seen2 = new Set<string>()
          pool = []
          for (const it of alt) { if (!seen2.has(it.id)) { seen2.add(it.id); pool.push(it) } }
        }
        // 游標：同語言持久化；直到走完整個 uniqueAll 前不重複
        const cursorKey = `typesprout_cursor_${lang || 'en-US'}`
        const cur0 = Number(localStorage.getItem(cursorKey) || '0')
        const total = pool.length
        const startIdx = Number.isFinite(cur0) ? Math.max(0, Math.min(cur0, Math.max(0,total-1))) : 0
        const seq: Array<{id:string; text:string}> = []
        for (let i=0;i<Math.min(numQuestions,total);i++) seq.push(pool[(startIdx + i) % total])
        const newCursor = (startIdx + Math.min(numQuestions,total)) % Math.max(1,total)
        // 可選：維持歷史已看過集合（與游標互不衝突）
        const ids = seq.map(it => it.id)
        const merged = Array.from(new Set<string>([...Array.from(unionSeen), ...ids]))
        // 暫存，等使用者按下 Start 再落盤
        cursorKeyRef.current = cursorKey
        newCursorRef.current = newCursor
        seenKeyRef.current = seenKey
        mergedSeenIdsRef.current = merged
        const qs = seq.map(it => it.text)
        try { localStorage.setItem(cacheKey, JSON.stringify(qs)) } catch (e) { if (import.meta.env.DEV) console.warn('write cache failed', e) }
        // 只應用最新載入結果，避免舊請求覆寫造成題目閃爍
        if (mySeq === loadSeqRef.current) {
          setQuestions(qs)
          setQIndex(0)
          const first = qs[0] || 'Kids Typing & Tree Growth'
          setText(first)
          setInput(''); setRawInput('')
          setMessage(((lang || 'en-US').startsWith('zh') ? '按下 Start 後，請輸入上方文字。禁止貼上。' : 'Press Start and type the text above. Paste is disabled.'))
          const firstAllowed = allowedMsFor(first)
          setLeftMs(firstAllowed)
          setElapsedMs(0)
          setAccumTyped(0); setAccumCorrect(0)
          setRecords([])
          qStartRef.current = Date.now()
          mistakesRef.current = 0
          totalTypedRef.current = 0
          totalInputMsRef.current = 0
          questionsPayloadRef.current = []
          sessionTotalRef.current = qs.length
          finishedRef.current = false
          // 建立新的 session token
          const bytes = new Uint8Array(16); crypto.getRandomValues(bytes)
          sessionTokenRef.current = Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
          prevLenRef.current = 0
          qStartPerfRef.current = 0
        }
      } catch {
        setLoadError('取題失敗：請稍後再試，或檢查網路與環境變數設定。')
        setQuestions([]); setQIndex(0); setText('Kids Typing & Tree Growth')
      } finally {
        if (mySeq === loadSeqRef.current) setLoadingQs(false)
      }
    })()
  }, [lang, numQuestions, userGrade, gradeScope, user, gradeReady, allowedMsFor])

  // 難度切換僅影響時間上限，不重新取題；避免載入階段題目閃爍
  useEffect(() => {
    if (!running && text) setLeftMs(allowedMsFor(text))
  }, [perCharSec, text, running, allowedMsFor])

  

  useEffect(() => {
    if (!running) { setOutOfFocus(false); return }
    if (isFocused) { setOutOfFocus(false); return }
    const tmr = setTimeout(() => setOutOfFocus(true), 1000)
    return () => clearTimeout(tmr)
  }, [running, isFocused])

  // 保險機制：倒數歸零時，若尚未提交，立即自動提交並進入下一題
  useEffect(() => {
    if (!running) return
    if (finished || finishedRef.current) return
    if (leftMs <= 0 && !submittingRef.current) {
      startedRef.current = false
      // 讓 0.00 先畫面更新，再於下一個 macrotask 提交
      setTimeout(() => { if (!submittingRef.current) submitRef.current() }, 0)
    }
  }, [leftMs, running, finished])

  const correctCurrent = useMemo(() => {
    let c = 0
    for (let i = 0; i < input.length && i < text.length; i++) if (input[i] === text[i]) c++
    return c
  }, [input, text])
  const totalTypedAll = accumTyped + input.length
  const totalCorrectAll = accumCorrect + correctCurrent
  const minutes = useMemo(() => Math.max(elapsedMs / 1000, 0.01) / 60, [elapsedMs])
  const isZhTyping = useMemo(() => typingLang === 'zh' || (typingLang === 'auto' && (lang || 'en-US').startsWith('zh')), [typingLang, lang])
  const rawBase = isZhTyping ? (totalTypedAll / minutes) : ((totalTypedAll / 5) / minutes)
  const accuracy = useMemo(() => (totalTypedAll ? totalCorrectAll / totalTypedAll : 0), [totalTypedAll, totalCorrectAll])
  const adjWpm = useMemo(() => rawBase * accuracy, [rawBase, accuracy])
  // 顯示倒數：使用「向上取兩位小數」確保在真正歸零前不會顯示 0.00
  const leftSecDisplay = useMemo(() => (Math.max(0, Math.ceil(leftMs / 10) / 100)).toFixed(2), [leftMs])
  // 題目字數統計（方便對帳）
  const totalQCharsAll = useMemo(() => (questions || []).reduce((s, q) => s + ((q?.length) || 0), 0), [questions])
  const cumQChars = useMemo(() => (questions || []).slice(0, Math.min(qIndex + 1, (questions||[]).length)).reduce((s, q) => s + ((q?.length)||0), 0), [questions, qIndex])
  const readyToStart = useMemo(() => {
    if (loadingQs) return false
    if (loadError) return false
    if (!text || text.length === 0) return false
    if ((questions?.length || 0) <= 0) return false
    return allowedMsFor(text) > 0
  }, [loadingQs, loadError, text, questions, allowedMsFor])

  const startedRef = useRef<boolean>(false)
  const lastTickRef = useRef<number | null>(null)
  useEffect(() => { if (running) areaRef.current?.focus() }, [running])

  function handleEnterSubmit(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      // 避免剛按下 Start（可能用 Enter 觸發）導致第一題被立即送出
      if (Date.now() - startAtRef.current < 300) { setMessage('請先開始輸入喔！'); return }
      // 中文輸入組字中：先讓使用者完成候選再提交
      if (composing.current) { setMessage('正在組字，請先確定文字再提交（再按一次 Enter）'); return }
      // 禁止空白提交：需至少輸入 1 個字
      if (input.length === 0) { setMessage('請先輸入至少 1 個字再提交喔！'); return }
      // 若已是最後一題，直接完成並跳 Result
      if (qIndex === questions.length - 1) {
        submitCurrentQuestion()
      } else {
        submitCurrentQuestion()
      }
    }
  }

  const submitCurrentQuestion = useCallback(() => {
    if (finishedRef.current) return
    if (submittingRef.current) return
    submittingRef.current = true
    const effective = (input.length === 0 ? 'x' : input)
    const prev = prevLenRef.current
    for (let i = prev; i < effective.length; i++) {
      const typed = effective[i] || ''
      const expect = text[i] || ''
      const id = typed.length === 1 ? typed.toUpperCase() : typed
      keyStats.onKeyUp(id, typed === expect)
    }
    prevLenRef.current = effective.length

    // 準確率：未輸入完的剩餘字數視為錯字（懲罰未完成）
    const untyped = Math.max(0, text.length - input.length)
    totalTypedRef.current += input.length
    totalMissedRef.current += untyped
    setAccumTyped((v) => v + input.length + untyped)
    setAccumCorrect((v) => v + correctCurrent)
    const spentMs = Math.max(0, Math.round((qStartPerfRef.current>0 ? performance.now() - qStartPerfRef.current : 0)))
    const chars = input.length
    const isZh = isZhTyping
    const localeFactor = isZh ? 1.2 : 1.0
    // 反作弊下限：以每字 60ms 為基準，中文略放寬；最低 200ms，不再強制 600ms
    const minMs = Math.round(Math.max(200, chars * 60 * localeFactor))
    const fastViolation = spentMs < minMs
    const qid = hash32(text)
    const tokenSig = hash32(sessionTokenRef.current + '|' + qid + '|' + String(chars) + '|' + String(spentMs))
    questionsPayloadRef.current.push({ qid, chars, spentMs, mistakes: mistakesRef.current, fastViolation, tokenSig })
    // 僅在『有實際輸入』且『非超快違規』時，才將用時計入有效總時長
    if (!fastViolation && chars > 0) totalInputMsRef.current += spentMs

    // 未輸入的部分視為錯字記入統計
    if (untyped > 0) mistakesRef.current += untyped
    const rec: QRec = { text, allowed: Math.floor(allowedMsFor(text)/1000), spent: Math.floor((chars>0?spentMs:0)/1000), mistakes: mistakesRef.current }
    setRecords((arr) => [...arr, rec])
    // 將本題鍵盤統計合併到『最近累積』，供熱點圖使用
    try { keyStats.persistSnapshot() } catch (e) { if (import.meta.env.DEV) console.warn('persistSnapshot failed', e) }

    // 統一過場效果
    setMessage('… 下一題準備中')
    const advance = () => {
      if (qIndex < questions.length - 1) {
        const next = qIndex + 1
        answeredCountRef.current += 1
        setQIndex(next)
        const nextText = questions[next] || 'Kids Typing & Tree Growth'
        setText(nextText)
        setInput('')
        setRawInput('')
        setLeftMs(allowedMsFor(nextText))
        setMessage('')
        startedRef.current = false
        mistakesRef.current = 0
        prevLenRef.current = 0
        qStartPerfRef.current = 0
      } else {
        // 結束：鎖定完成，停止計時並導向結果
        finishedRef.current = true
        setRunning(false)
        setFinished(true)
        setMessage(t('test.promptFinished'))
        try {
          const hasTyped = (totalTypedRef.current > 0) || questionsPayloadRef.current.some(q => q.chars > 0)
          const effMs = hasTyped ? Math.max(1, totalInputMsRef.current) : 0
          const effMin = effMs / 60000
          const effChars = hasTyped ? totalTypedRef.current : 0
          const effRaw = hasTyped && effMin > 0 ? (isZhTyping ? (effChars / effMin) : ((effChars / 5) / effMin)) : 0
          const accPass = hasTyped ? accuracy : 0
          const effAdj = effRaw * accPass
          const totalQCharsAllNow = questions.reduce((s, q) => s + (q?.length || 0), 0)
          // 僅允許導向一次，避免重入造成循環
          if (!didNavigateRef.current) {
            didNavigateRef.current = true
            setTimeout(() => {
              navigate(`/${lang}/result`, { state: { rawWpm: effRaw, accuracy: accPass, adjWpm: effAdj, durationSec: Number((effMs/1000).toFixed(2)), rawChars: effChars, totalQChars: totalQCharsAllNow, fromTest: true } })
            }, 100)
          }
        } catch (e) { if (import.meta.env.DEV) console.warn('navigate to result failed', e) }
      }
    }
    setTimeout(() => { advance(); submittingRef.current = false }, 200)
  }, [accuracy, isZhTyping, keyStats, lang, navigate, qIndex, questions, text, allowedMsFor, input, accumTyped, correctCurrent, t])

  const submitRef = useRef(submitCurrentQuestion)
  useEffect(() => { submitRef.current = submitCurrentQuestion }, [submitCurrentQuestion])
  useEffect(() => {
    if (!running || finished || finishedRef.current) return
    if (!startedRef.current) return
    let raf = 0
    const tick = (now: number) => {
      const prev = lastTickRef.current ?? now
      const delta = now - prev
      lastTickRef.current = now
      setElapsedMs((v) => v + delta)
      let timeUp = false
      setLeftMs((v) => {
        const nv = v - delta
        if (nv <= 0) { timeUp = true; return 0 }
        return nv
      })
      if (timeUp && !submittingRef.current) {
        startedRef.current = false
        // 等畫面先顯示 0.00 再換題（下一幀）
        requestAnimationFrame(() => { if (!submittingRef.current) submitRef.current() })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, finished])

  // 換題由 rAF tick 內在顯示 0.00 後下一幀觸發；此處不再二次觸發，避免不同步

  useEffect(() => {
    void (async () => {
      try {
        if (!user) { setHistAdj([]); setHistAcc([]); return }
        const rows = await getAttemptsWindow({ uid: user.uid, days: 30, sampleLimit: 200 })
        const list = (rows.slice().reverse() as AttemptRow[])
        const toDateSafe = (v: AttemptRow['ts']): Date | undefined => {
          if (!v) return undefined
          if (v instanceof Date) return v
          if (typeof v === 'number') return new Date(v)
          const maybe = v as { toDate?: () => Date }
          return typeof maybe.toDate === 'function' ? maybe.toDate() : undefined
        }
        const adj = list.map((r, i: number) => ({ i, adj: Number(r.adjWpm || 0), ts: toDateSafe(r.ts) }))
        const acc = list.map((r, i: number) => ({ i, acc: Math.max(0, Math.min(1, Number(r.accuracy || 0))), ts: toDateSafe(r.ts) }))
        setHistAdj(adj); setHistAcc(acc)
      } catch { setHistAdj([]); setHistAcc([]) }
    })()
  }, [user])

  // 續載觸發：剩餘題數低於閾值時，預取下一頁補池
  useEffect(() => {
    if (!questions || questions.length === 0) return
    const remain = Math.max(0, (questions.length - 1) - qIndex)
    const THRESH = 10
    if (remain <= THRESH && !prefetchingRef.current) {
      prefetchingRef.current = true
      try {
        const L = (lang || 'en-US')
        const nextStart = Math.max(1, nextStartPageRef.current)
        ;(fetchContent as any)({ lang: L, limit: 200, startPage: nextStart, pageCount: 1, signal: undefined })
          .then((more: SheetItem[] | null) => {
            if (!more || !more.length) return
            try {
              const cacheKey = `typesprout_qs_cache_${L}`
              const cachedArr = JSON.parse(localStorage.getItem(cacheKey) || '[]') as string[]
              const merge = [...cachedArr, ...more.map((m:any)=> String((m.structured as any)?.q || m.text || ''))]
              localStorage.setItem(cacheKey, JSON.stringify(merge.slice(0, 1000)))
            } catch {}
            nextStartPageRef.current = nextStart + 1
          })
          .finally(() => { prefetchingRef.current = false })
      } catch { prefetchingRef.current = false }
    }
  }, [qIndex, questions, lang])

  const persistAttempt = useCallback(async () => {
    try {
      if (!user) return
      const isZh = isZhTyping
      const effectiveChars = questionsPayloadRef.current.filter(q => !q.fastViolation).reduce((s,q)=>s+q.chars,0)
      const effectiveMs = Math.max(1, totalInputMsRef.current)
      const effectiveMinutes = effectiveMs / 60000
      const raw = isZh ? (effectiveChars / effectiveMinutes) : ((effectiveChars / 5) / effectiveMinutes)
      const acc = accuracy
      const adj = raw * acc
      // 合理性檢查：以人類極限上限過濾（1000 CPM 上限）
      const cps = effectiveChars / Math.max(1, effectiveMs/1000) // 每秒字數
      if (cps * 60 > typingConfig.humanMaxCpm) return // 超過人類極限不寫入
      if (!isZh && raw > 200) return
      if (isZh && raw > 400) return
      const data: {
        uid: string;
        ts: Timestamp;
        lang: string;
        mode: string;
        durationSec: number;
        rawChars: number;
        correctChars: number;
        accuracy: number;
        adjWpm: number;
        nick: string;
        createdAt: unknown;
        sessionToken: string;
        totalInputMs: number;
        totalChars: number;
        questions: Array<{ qid: string; chars: number; spentMs: number; mistakes: number; fastViolation: boolean; tokenSig: string }>;
        classCode?: string;
        keystats?: Record<string, { h: number; m: number }>;
        rawWpm?: number;
        cpm?: number;
      } = {
        uid: user.uid,
        ts: Timestamp.now(),
        lang: lang || 'en-US',
        mode: 'test-perchar',
        durationSec: Number((effectiveMs/1000).toFixed(2)),
        rawChars: effectiveChars,
        correctChars: totalCorrectAll,
        accuracy: Number(acc.toFixed(4)),
        adjWpm: Number(adj.toFixed(2)),
        nick: user.displayName || '',
        createdAt: serverTimestamp(),
        sessionToken: sessionTokenRef.current,
        totalInputMs: Math.round(effectiveMs),
        totalChars: effectiveChars,
        questions: questionsPayloadRef.current,
      }
      // 帶上班級代碼（若設定）供排行榜分班
      try {
        const pref = doc(db, 'profiles', user.uid)
        const psnap = await getDoc(pref)
        const pdata = psnap.data() as Record<string, unknown> | undefined
        const cc = typeof pdata?.classCode === 'string' ? pdata.classCode : undefined
        if (cc) data.classCode = String(cc)
      } catch { void 0 }
      // 附帶本次 keystats 摘要（供長期熱點聚合）
      try {
        const dump = keyStats.dump()
        const ks: Record<string, { h: number; m: number }> = {}
        dump.forEach((v, k) => { const tot = (v.hits||0)+(v.misses||0); if (tot>0) ks[k] = { h: v.hits||0, m: v.misses||0 } })
        data.keystats = ks
      } catch { void 0 }
      if (isZh) data.cpm = Number(raw.toFixed(2)); else data.rawWpm = Number(raw.toFixed(2))
      // 需要 Firestore 規則允許：auth 用戶可寫入 attempts
      const prevEarned = await getTodayEarned(user.uid)
      await addDoc(collection(db, 'attempts'), data)
      await applyAttemptRewards({ uid: user.uid, lang: lang || 'en-US', durationSec: Number((effectiveMs/1000).toFixed(2)), raw, adj, accuracy: acc, correctChars: totalCorrectAll, totalChars: effectiveChars, totalQChars: questionsPayloadRef.current.reduce((s,q)=>s+q.chars,0) })
      // 小提示：提交後以無障礙方式回饋本次獲得
      try {
        // 估算 / 讀取本次點數與今日累計
        let todayAfter = await getTodayEarned(user.uid)
        if (todayAfter < prevEarned) { todayAfter = prevEarned }
        let gained = Math.max(0, Math.round(todayAfter - prevEarned))
        if (gained <= 0) {
          const L = (lang || 'en-US') as keyof typeof typingConfig.baseByLang
          const base = typingConfig.baseByLang[L]
          const minutes = Math.max(effectiveMs/1000,1) / 60
          const gradeTarget = typingConfig.targetByGrade[L]?.[3] || 20
          const est = base * minutes * Math.max(0, Math.min(2, (adj/gradeTarget))) * (0.5 + 0.5 * acc)
          let rounded = Math.round(est)
          if (rounded <= 0) {
            if ((effectiveMs/1000) >= 30 && acc >= 0.5) rounded = 1
            else if ((effectiveMs/1000) >= 5 && acc >= 0.3) rounded = 1
          }
          const capLeft = Math.max(0, typingConfig.dailyEpCap - prevEarned)
          gained = Math.max(0, Math.min(capLeft, rounded))
          todayAfter = Math.min(typingConfig.dailyEpCap, prevEarned + gained)
        }
        const el = document.createElement('div')
        el.role = 'status'
        el.setAttribute('aria-live', 'polite')
        el.textContent = `已記錄：${Math.round(effectiveMs/1000)} 秒，正確率 ${(acc*100).toFixed(0)}%，+${gained} 點｜今日累計 ${todayAfter}/${typingConfig.dailyEpCap}`
        el.style.position = 'fixed'; el.style.right = '16px'; el.style.bottom = '16px'; el.style.background = '#111827'; el.style.color = '#fff'; el.style.padding = '8px 12px'; el.style.borderRadius = '8px'; el.style.boxShadow = '0 2px 8px rgba(0,0,0,.2)'
        document.body.appendChild(el)
        setTimeout(() => {
          try { document.body.removeChild(el) } catch { /* noop */ }
        }, 1600)
      } catch { /* noop */ }
      const profileRef = doc(db, 'profiles', user.uid)
      await setDoc(profileRef, {
        attemptsCount: increment(1),
        lastAttempt: {
          ts: serverTimestamp(),
          lang: lang || 'en-US',
          durationSec: Number((effectiveMs/1000).toFixed(2)),
          rawChars: effectiveChars,
          correctChars: totalCorrectAll,
          accuracy: Number(acc.toFixed(4)),
          adjWpm: Number(adj.toFixed(2)),
          metric: isZh ? 'cpm' : 'wpm',
          raw: Number(raw.toFixed(2)),
        },
        updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch (e: unknown) {
      const msg = (typeof e === 'object' && e && 'message' in e) ? String((e as { message?: unknown }).message) : ''
      if (/Missing or insufficient permissions/i.test(msg)) {
        alert('儲存失敗：Firebase 權限不足。請確認 Firestore 規則允許登入用戶寫入 attempts 與更新 profiles。')
      }
      if (import.meta.env.DEV) console.error('persistAttempt failed', e)
    }
  }, [user, lang, isZhTyping, accuracy, keyStats, totalCorrectAll])

  // 倒數強調：<=10s 轉為警示色
  const dangerLeft = (leftMs/1000) <= 10 && running
  // const dangerAcc = running && accuracy < 0.8 && elapsedSec > 10

  function renderText() {
    const spans: Array<React.ReactNode> = []
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      let cls = ''
      if (i < input.length) {
        cls = input[i] === ch ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)] underline decoration-[var(--color-danger)]'
      } else if (i === input.length && running) {
        cls = 'bg-sky-100 border-b-2 border-sky-400'
      } else {
        cls = 'text-[var(--color-muted,#6b7280)]'
      }
      spans.push(<span key={i} className={cls}>{ch}</span>)
    }
    return <p className="font-mono typing-text break-words">{spans}</p>
  }

  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-3">{t('test.title')}</h2>
      <div className="flex flex-wrap items-center gap-3" aria-keyshortcuts="Space R F Enter">
        <label className="flex items-center gap-2">
          <span>題數</span>
          <select className="h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" value={numQuestions} onChange={(e)=> setNumQuestions(parseInt(e.target.value))}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span>難度</span>
          <select className="h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" value={perCharSec} onChange={(e)=> setPerCharSec(parseInt(e.target.value))}>
            <option value={1}>難</option>
            <option value={3}>中</option>
            <option value={5}>易</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allowBackspace} onChange={(e) => setAllowBackspace(e.target.checked)} /> 允許退格
        </label>
        {/* 相關即時數據已在下方大型倒數與頁腳呈現，避免重複顯示 */}
        {capsOn && <div className="ml-auto px-2 py-1 rounded bg-[var(--color-warning)] text-white">大寫鎖定</div>}
      </div>
      {loadingQs && (<div className="mt-2 px-3 py-2 rounded bg-sky-50 text-sky-700 border border-sky-200" role="status" aria-live="polite">正在載入題目…</div>)}
      {!!loadError && (<div className="mt-2 px-3 py-2 rounded bg-red-50 text-red-600 border border-red-200" role="alert" aria-live="assertive">{loadError}</div>)}
      {/* 將題目/倒數與進度條顯示在輸入框上方 */}
      <div className="mt-3 relative">
        <div className={`absolute right-0 -top-2 font-bold tabular-nums ${dangerLeft ? 'text-[var(--color-danger,#ef4444)]' : 'text-[var(--color-surface-foreground,#111827)]'} text-2xl`} aria-live="polite" role="status">{leftSecDisplay}s</div>
        <div className="text-[var(--color-muted)] text-sm leading-[var(--lh-normal)] text-left">題次 {qIndex+1}/{questions.length||1} · 上限 {(allowedMsFor(text)/1000).toFixed(2)} 秒 · 本題字數 {text.length} · 累計 {cumQChars}/{totalQCharsAll}</div>
        <ProgressBar label="progress" percent={(input.length / text.length) * 100} />
        {/* 題目顯示（移到輸入框上方） */}
        <div className="mt-2" onCopy={(e)=>e.preventDefault()} onCut={(e)=>e.preventDefault()} onContextMenu={(e)=>e.preventDefault()}>
          <div className="text-[var(--color-muted)] text-sm leading-[var(--lh-normal)] mb-1">請照下方文字輸入</div>
          <div className="select-none" draggable={false} aria-label="題目文字（無法選取或複製）">
            {renderText()}
          </div>
        </div>
        <div className="mt-1">
          <div className="relative">
            <textarea
              ref={areaRef}
              rows={4}
              value={rawInput}
              readOnly={!running}
              aria-disabled={!running}
              onBeforeInput={(e) => {
                const anyEvt = e as unknown as { inputType?: string; preventDefault: () => void }
                if (!running) anyEvt.preventDefault()
                if (anyEvt.inputType === 'insertFromPaste') anyEvt.preventDefault()
              }}
              onDrop={(e) => { e.preventDefault() }}
              onFocus={() => { setIsFocused(true); if (running && !startedRef.current) { lastTickRef.current = performance.now(); setElapsedMs(0); setLeftMs(allowedMsFor(text)); startedRef.current = true; qStartPerfRef.current = performance.now() } }}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (!running) { e.preventDefault(); setMessage(t('test.promptBegin')); return }
                if (e.key === 'Enter') { handleEnterSubmit(e); return }
                setCapsOn(e.getModifierState('CapsLock'))
                const id = (e.key.length === 1 ? e.key.toUpperCase() : e.key)
                lastKeyRef.current = id
                keyStats.onKeyDown(id)
                if (composing.current) composingKeysRef.current.push(id)
                if (!allowBackspace && (e.key === 'Backspace' || e.key === 'Delete')) e.preventDefault()
              }}
              onKeyUp={(e) => {
                if (!running) { e.preventDefault(); return }
                setCapsOn(e.getModifierState('CapsLock'))
                if (composing.current) return
                const prev = prevLenRef.current
                const curr = input.length
                if (curr > prev) {
                  hasAnyInputRef.current = true
                  const idx = prev
                  const typed = input[idx] || ''
                  const expect = text[idx] || ''
                  const id = (typed.length === 1 ? typed.toUpperCase() : typed)
                  keyStats.onKeyUp(id, typed === expect)
                  if (typed !== expect) mistakesRef.current += 1
                }
                prevLenRef.current = input.length
              }}
              onCompositionStart={() => { composing.current = true; composingKeysRef.current = [] }}
              onCompositionEnd={(e: CompositionEvent<HTMLTextAreaElement>) => {
                composing.current = false
                const v = (e.target as HTMLTextAreaElement).value
                const prevLen = input.length
                const idx = prevLen
                const committed = v[idx] || ''
                const expect = text[idx] || ''
                const correct = committed === expect
                for (const k of composingKeysRef.current) keyStats.onKeyUp(k, correct)
                composingKeysRef.current = []
                if (!correct) mistakesRef.current += 1
                prevLenRef.current = v.length
                setRawInput(v)
                if (running) setInput(v)
                if (v.length > 0) hasAnyInputRef.current = true
              }}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                const val = e.target.value
                setRawInput(val)
                if (composing.current || !running) return
                setInput(val)
              }}
              className="w-full p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px] font-mono min-h-[120px] focus:outline-none focus:ring-2 focus:ring-sky-400 typing-input"
            />
            {!running && !finished && (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-[12px]">
            <Button disabled={!readyToStart} onClick={() => { if (!readyToStart) return; startAtRef.current = Date.now(); setRunning(true); // 真正開始時才落盤游標與已看過集合
                  try { if (cursorKeyRef.current) localStorage.setItem(cursorKeyRef.current, String(newCursorRef.current)) } catch (e) { if (import.meta.env.DEV) console.warn('save cursor failed', e) }
                  try { if (seenKeyRef.current) localStorage.setItem(seenKeyRef.current, JSON.stringify(mergedSeenIdsRef.current)) } catch (e) { if (import.meta.env.DEV) console.warn('save seenIds failed', e) }
                  try { if (user) void setDoc(doc(db,'profiles',user.uid), { lastSeenIds: mergedSeenIdsRef.current.slice(-1000) }, { merge: true }) } catch (e) { if (import.meta.env.DEV) console.warn('persist profile seenIds failed', e) }
                  setTimeout(() => { areaRef.current?.focus() }, 0); qStartRef.current = Date.now(); mistakesRef.current = 0; hasAnyInputRef.current = false }}>
                  {readyToStart ? '開始' : '載入中…'}
                </Button>
              </div>
            )}
          </div>
          {running && (
            <div className="mt-2 flex items-center gap-3">
              <Button onClick={() => submitCurrentQuestion()}>提交本題（Enter）</Button>
            </div>
          )}
          {/* 右上角已有登入，頁面內不再放次入口 */}
        </div>
      </div>
      <div aria-live="polite" className="mt-2 body muted">{message}</div>
      {(outOfFocus && running) && (
        <div role="status" aria-live="polite" className="mt-2 px-3 py-2 rounded bg-yellow-50 text-[var(--color-warning)] border border-yellow-200">已失焦，請點擊輸入區或按 F 聚焦</div>
      )}
      
      <div className="sticky bottom-0 bg-white py-3 mt-3 border-t border-[var(--color-border,#e5e7eb)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="body muted" aria-live="polite" aria-label="速度與正確率說明">正確率 {(accuracy*100).toFixed(0)}% · 綜合分數 {adjWpm.toFixed(1)}</div>
          <div className="text-[var(--color-muted,#6b7280)] text-sm">Space 開/停 · R 重置 · F 聚焦 · Enter 提交本題</div>
        </div>
      </div>
      {finished && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <strong>{t('test.finished')}</strong>
            <span>正確率 {(accuracy*100).toFixed(0)}%</span>
            <span>綜合分數（正確速度）{adjWpm.toFixed(1)}</span>
            <Button disabled={saving || !user} onClick={async () => { try { setSaving(true); await persistAttempt(); const hasInput = totalTypedRef.current > 0; const effMs = hasInput ? Math.max(1, totalInputMsRef.current) : 0; const effMin = effMs/60000; const effChars = hasInput ? totalTypedRef.current : 0; const effRaw = hasInput ? (isZhTyping ? (effChars/effMin) : ((effChars/5)/effMin)) : 0; const accPass = hasInput ? accuracy : 0; const effAdj = effRaw * accPass; const totalQCharsAllNow = questions.reduce((s, q) => s + (q?.length || 0), 0); navigate(`/${lang}/result`, { state: { rawWpm: effRaw, accuracy: accPass, adjWpm: effAdj, durationSec: Number((effMs/1000).toFixed(2)), rawChars: effChars, totalQChars: totalQCharsAllNow } }); try { (await import('../libs/reminders')).markPracticedNow() } catch { /* ignore */ } } finally { setSaving(false) } }}>送出並查看成績</Button>
            {!user && <span className="text-[var(--color-muted,#6b7280)]">{t('test.signInToSave')}</span>}
            <Button variant="outline" onClick={() => { setInput(''); setRawInput(''); setFinished(false); setMessage(t('test.promptStart')); setQIndex(0); const first = questions[0] || 'Kids Typing & Tree Growth'; setText(first); setLeftMs(allowedMsFor(first)); setElapsedMs(0); setRunning(false); setRecords([]); totalTypedRef.current = 0 }}>{t('test.tryAgain')}</Button>
          </div>
          {records.length>0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm text-[var(--color-muted,#6b7280)]">本場各題統計（用時 / 上限、錯字數）</div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-[var(--color-border,#e5e7eb)]">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">題目（前 24 字）</th>
                    <th className="py-1 pr-2">用時</th>
                    <th className="py-1 pr-2">上限</th>
                    <th className="py-1 pr-2">錯字</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--color-border,#e5e7eb)]">
                      <td className="py-1 pr-2">{i+1}</td>
                      <td className="py-1 pr-2">{r.text.slice(0,24)}{r.text.length>24?'…':''}</td>
                      <td className="py-1 pr-2">{r.spent}s</td>
                      <td className="py-1 pr-2">{r.allowed}s</td>
                      <td className="py-1 pr-2">{r.mistakes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className="mt-6">
        <details>
          <summary className="cursor-pointer select-none">{t('test.insightsSummary')}</summary>
          <div className="mt-3 flex flex-wrap gap-6 items-start">
            <ChartSection topText="上：綜合分數趨勢；下：正確率趨勢。先把正確率穩定到 90% 以上，再慢慢變快。">
              <SpeedChart data={histAdj.length ? histAdj : Array.from({length: Math.min(30, Math.max(1, Math.floor((accumTyped+input.length)/10)))}, (_,i)=>({ i, adj: Math.max(0, Number((adjWpm*(i+1)/(30)).toFixed(2))) }))} />
              <div className="h-3" />
              <AccuracyChart data={histAcc.length ? histAcc : Array.from({length: 30}, (_,i)=>({ i, acc: Math.max(0, Math.min(1, accuracy)) }))} />
            </ChartSection>
          </div>
        </details>
      </div>
    </div>
  )
}



