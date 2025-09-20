import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { db } from '../libs/firebase'
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore'
import { commonCountries, getAllCountries } from '../libs/geo'
import { useAuth } from '../features/auth/hooks'
import { signOutGoogle } from '../features/auth/actions'
import Button from '../components/Button'
import Tooltip from '../components/Tooltip'
import SpeedChart from '../components/metrics/SpeedChart'
import AccuracyChart from '../components/metrics/AccuracyChart'
import ChartSection from '../components/metrics/ChartSection'
import { getAttemptsWindow } from '../adapters/firestore/stats'
import { supportedLangs, isRtl } from '../config/app'

type ProfileDoc = {
  displayName?: string
  grade?: number
  gender?: 'M' | 'F' | 'N' | 'U'
  dobYM?: string
  role?: 'student' | 'teacher' | 'parent' | 'other'
  country?: string
  classCode?: string
  classCodes?: string[]
}

export default function Profile() {
  const { user } = useAuth()
  const { lang } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<ProfileDoc>({})
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<{ xp?: number; points?: number; fruits?: number }>({})
  const [histAdj, setHistAdj] = useState<Array<{ i: number; adj: number }>>([])
  const [histAcc, setHistAcc] = useState<Array<{ i: number; acc: number }>>([])
  // keyboard heatmap removed on profile
  // 放寬：只檢查長度 3–50 且不可含 '/'（Firestore docId 限制）。其他字元不限制；僅做全/半形破折號正規化。
  const CLASS_CODE_REGEX = /^(?=.{3,50}$)(?!.*\/).+$/
  const TEACHER_CLASS_LIMIT = 5
  const [codeStatus, setCodeStatus] = useState<'idle'|'invalid'|'checking'|'available'|'taken'|'mine'|'error'>('idle')
  const [initialCode, setInitialCode] = useState<string>('')
  const [myCodes, setMyCodes] = useState<string[]>([])
  const [showMyCodes, setShowMyCodes] = useState(false)
  const [showJoined, setShowJoined] = useState(false)

  // 計算年齡（以月份精度）；生日格式 YYYY-MM
  function getAgeYears(dobYM?: string): number {
    if (!dobYM) return 0
    const digits = String(dobYM).replace(/[^0-9]/g, '')
    let y = 0
    let mon = 1
    if (/^[0-9]{6,}$/.test(digits)) {
      y = Number(digits.slice(0, 4))
      mon = Number(digits.slice(4, 6)) || 1
    } else {
      const m = /^([0-9]{4})-([0-9]{2})$/.exec(dobYM)
      if (!m) return 0
      y = Number(m[1])
      mon = Number(m[2]) || 1
    }
    mon = Math.min(12, Math.max(1, mon))
    const birth = new Date(y, mon - 1, 1)
    const now = new Date()
    let years = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < 1)) years -= 1
    return Math.max(0, years)
  }
  const ageYears = getAgeYears(form.dobYM)
  const canCreate = form.role === 'teacher' && ageYears >= 21
  // 兩歲以上可選：最大可選月 = 今天往前推 2 年
  const toMonthString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`
  const maxDobMonth = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); return toMonthString(d) })()
  const minDobMonth = '1900-01'

  useEffect(() => {
    async function run() {
      if (!user) return
      const ref = doc(db, 'profiles', user.uid)
      const snap = await getDoc(ref)
      const data = snap.data() as (ProfileDoc & { xp?: number; points?: number }) | undefined
      const joined = (Array.isArray((data as any)?.classCodes) ? (data as any).classCodes as string[] : []);
      const legacy = String((data as any)?.classCode || '').trim();
      const initJoined = joined.length ? joined : (legacy ? [legacy] : [])
      setForm({
        displayName: data?.displayName || user.displayName || '',
        grade: data?.grade,
        gender: (data?.gender as 'M'|'F'|'N'|'U'|undefined) || 'U',
        dobYM: data?.dobYM || '',
        role: (data?.role as 'student'|'teacher'|'parent'|'other'|undefined) || 'student',
        country: data?.country || undefined,
        classCode: (data as any)?.classCode || '',
        classCodes: initJoined
      })
      setInitialCode(String((data as any)?.classCode || ''))
      // 載入 XP/Points 舊統計
      setStats({ xp: data?.xp || 0, points: data?.points || 0, fruits: 0 })
      // 載入果實數
      try {
        const frRef = doc(db, 'fruits', user.uid)
        const frSnap = await getDoc(frRef)
        setStats(s => ({ ...s, fruits: frSnap.exists() ? Number((frSnap.data() as any).total || 0) : 0 }))
      } catch {}
      // Insights：取最近 30 次嘗試
      try{
        const attempts = await getAttemptsWindow({ uid: user.uid, days: 30, sampleLimit: 200 })
        const list = attempts.slice().reverse()
        const toDateSafe = (maybe: unknown): Date | undefined => {
          try {
            if (!maybe) return undefined
            if (typeof maybe === 'number') return new Date(maybe)
            if (maybe && typeof maybe === 'object' && 'toDate' in (maybe as Record<string, unknown>)) {
              const fn = (maybe as { toDate?: () => Date }).toDate
              return typeof fn === 'function' ? fn() : undefined
            }
          } catch {}
          return undefined
        }
        const adj = list.map((r: any, i: number) => ({ i, adj: Number(r.adjWpm || 0), ts: toDateSafe((r as any).ts) }))
        const acc = list.map((r: any, i: number) => ({ i, acc: Math.max(0, Math.min(1, Number(r.accuracy || 0))), ts: toDateSafe((r as any).ts) }))
        setHistAdj(adj); setHistAcc(acc)
      }catch{ setHistAdj([]); setHistAcc([]) }
      // 載入我的班級清單
      try {
        const q = query(collection(db, 'classCodes'), where('owner', '==', user.uid))
        const snaps = await getDocs(q)
        setMyCodes(snaps.docs.map(d => d.id))
      } catch {}
    }
    void run()
  }, [user])

  // 即時檢查班級代碼是否可用
  useEffect(() => {
    let alive = true
    const check = async () => {
      const raw = (form.classCode || '').trim()
      const code = raw.replace(/[－—–]/g, '-')
      if (!code) { if (alive) setCodeStatus('idle'); return }
      if (!CLASS_CODE_REGEX.test(code)) { if (alive) setCodeStatus('invalid'); return }
      if (alive) setCodeStatus('checking')
      try {
        const { getDoc, doc } = await import('firebase/firestore')
        const { db } = await import('../libs/firebase')
        const ref = doc(db, 'classCodes', code)
        const snap = await getDoc(ref)
        if (!alive) return
        if (!snap.exists()) {
          setCodeStatus('available')
        } else {
          const owner = (snap.data() as any)?.owner
          if (user && owner === user.uid) setCodeStatus('mine')
          else setCodeStatus('taken')
        }
      } catch {
        if (alive) setCodeStatus('error')
      }
    }
    const t = setTimeout(check, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [form.classCode, user])

  async function save() {
    if (!user) return
    setLoading(true)
    const ref = doc(db, 'profiles', user.uid)
    await setDoc(ref, { ...form, updatedAt: serverTimestamp() }, { merge: true })
    setLoading(false)
    // 儲存完成提示（無侵入、可存取）
    try {
      const el = document.createElement('div')
      el.role = 'status'
      el.setAttribute('aria-live', 'polite')
      el.textContent = '已儲存'
      el.style.position = 'fixed'
      el.style.right = '16px'
      el.style.bottom = '16px'
      el.style.background = '#111827'
      el.style.color = '#fff'
      el.style.padding = '8px 12px'
      el.style.borderRadius = '8px'
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,.2)'
      document.body.appendChild(el)
      setTimeout(() => { try { document.body.removeChild(el) } catch {} }, 1600)
    } catch {}
  }

  if (!user) return <div className="max-w-[960px] mx-auto px-4">請先登入。</div>

  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-3">個人資料</h2>
      <div className="mb-3 body muted">已登入：{user.email || 'Google 帳號'}</div>
      <div className="flex gap-3 mb-3">
        <div className="p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px]">
          <div className="text-[12px] text-[var(--color-muted,#6b7280)] flex items-center gap-1">經驗值（XP）
            <Tooltip label={`來源：每次測驗。\n計算：base×分鐘×(速度/目標，最多×2)×(0.5+0.5×正確率)。\n上限：每日最多 100；超過不上升。\n說明：提升速度與正確率、並持續練習可更快累積。`}>？</Tooltip>
          </div>
          <div className="text-[20px] font-semibold">{stats.xp ?? '—'}</div>
        </div>
        <div className="p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px]">
          <div className="text-[12px] text-[var(--color-muted,#6b7280)] flex items-center gap-1">點數（Points）
            <Tooltip label={`來源：與 XP 同步增加（1 經驗≈1 點數）。\n轉換：點數會累積為成長值（GP）。\n備註：連續活躍影響果實加成，不影響點數計算。\n查看：明細於『種樹 → 歷程』。`}>？</Tooltip>
          </div>
          <div className="text-[20px] font-semibold">{stats.points ?? '—'}</div>
        </div>
        <div className="p-3 border border-[var(--color-border,#e5e7eb)] rounded-[12px]">
          <div className="text-[12px] text-[var(--color-muted,#6b7280)] flex items-center gap-1">果實（Fruits）
            <Tooltip label={`來源：依當日成長值（GP）與連續活躍天數換算。\n概念：每日 GP 約每 100 可得 1 顆；連續活躍最多再加成 30%。\n條件：需當天有練習累積 GP 才可能獲得。`}>？</Tooltip>
          </div>
          <div className="text-[20px] font-semibold">{stats.fruits ?? 0}</div>
        </div>
      </div>
      <div className="mb-4 text-[12px] text-[var(--color-muted,#6b7280)]">
        點數總額如上；明細請到 <Link to={`/${lang}/garden`} className="underline">種樹</Link> → 歷程 查看。
      </div>
      <div className="grid gap-3 max-w-[560px]">
        
        <label>
          <div className="mb-1 text-[14px] text-[var(--color-muted,#6b7280)]">暱稱</div>
          <input aria-label="Nickname" value={form.displayName || ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="w-full h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" />
        </label>
        <label>
          <div className="mb-1 text-[14px] text-[var(--color-muted,#6b7280)]">國家/地區</div>
          <select aria-label="Country" value={form.country || ''} onChange={(e)=> setForm({ ...form, country: e.target.value || undefined })} className="w-full h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3">
            <option value="">Auto</option>
            {getAllCountries(lang).map(c => (<option key={c.code} value={c.code}>{c.code} — {c.name}</option>))}
            {/* 保留常用國家於頂部（避免排序後不易找到） */}
            {commonCountries.map(c => (<option key={`common-${c.code}`} value={c.code}>{c.code} — {c.name}</option>))}
          </select>
        </label>
        <label>
          <div className="mb-1 text-[14px] text-[var(--color-muted,#6b7280)]">性別</div>
          <select aria-label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'M'|'F'|'N'|'U' })} className="w-full h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3">
            <option value="U">不透露</option>
            <option value="M">男孩</option>
            <option value="F">女孩</option>
            <option value="N">非二元</option>
          </select>
        </label>
        <label>
          <div className="mb-1 text-[14px] text-[var(--color-muted,#6b7280)]">生日（YYYY-MM）</div>
          <input aria-label="DOB" type="month" value={(form.dobYM || '').replace(/[^0-9-]/g,'')} onChange={(e) => setForm({ ...form, dobYM: e.target.value })} min={minDobMonth} max={maxDobMonth} className="w-full h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3" />
        </label>
        <label>
          <div className="mb-1 text-[14px] text-[var(--color-muted,#6b7280)]">角色</div>
          <select aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'student'|'teacher'|'parent'|'other' })} className="w-full h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3">
            <option value="student">學生</option>
            <option value="teacher">老師</option>
            <option value="parent">家長</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label>
          <div className="mb-1 text-[14px] text-[var(--color-muted,#6b7280)]">班級代碼 <Tooltip label="全站唯一（3–50 字；不可包含 /）。用於比賽與排行榜分組；可加入最多 5 個。老師可建立新代碼；建立後會自動加入（已滿 5 不自動）。">？</Tooltip></div>
          <div className="flex flex-wrap gap-2 items-center">
            <input aria-label="班級代碼" value={form.classCode || ''} onChange={(e) => setForm({ ...form, classCode: e.target.value })} placeholder="輸入任意名稱，避免重複即可" className="h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3 w-[220px] sm:w-[260px]" />
            <div className="text-xs min-w-[88px] text-center">
              {codeStatus==='checking' && <span className="text-[var(--color-muted,#6b7280)]">檢查中…</span>}
              {codeStatus==='invalid' && <span className="text-[var(--color-danger,#ef4444)]">長度需 3–50 且不可含 /</span>}
              {codeStatus==='error' && <span className="text-[var(--color-danger,#ef4444)]">檢查失敗（網路/權限）</span>}
              {codeStatus==='taken' && <span className="text-[var(--color-danger,#ef4444)]">已被使用</span>}
              {codeStatus==='mine' && <span className="text-[var(--color-success,#16a34a)]">你已擁有</span>}
              {codeStatus==='available' && <span className="text-[var(--color-success,#16a34a)]">可使用</span>}
            </div>
            {canCreate && (
            <Button variant="outline" onClick={async()=>{
              try{
                if(!user) { alert('請先登入再建立班級。'); return }
                // 僅老師可建立：前端先檢查避免白跑
                try {
                  const me = await getDoc(doc(db,'profiles', user.uid))
                  const role = (me.data() as any)?.role || 'student'
                  if (role !== 'teacher') { alert('僅老師可建立班級代碼。'); return }
                } catch {}
                const code=((form.classCode||'').trim()).replace(/[－—–]/g,'-')
                if(!CLASS_CODE_REGEX.test(code)){ alert('請輸入 3–50 字，且不可包含 /'); return }
                if(codeStatus==='taken'){ alert('這個代碼已被使用，請換一個。'); return }
                // 先檢查老師可建立數量上限
                const { getDocs, query, where, collection, limit: qlimit, runTransaction, doc: fdoc, serverTimestamp } = await import('firebase/firestore')
                const q = query(collection(db,'classCodes'), where('owner','==', user.uid), qlimit(TEACHER_CLASS_LIMIT+1))
                const snaps = await getDocs(q)
                if(snaps.size >= TEACHER_CLASS_LIMIT){ alert(`已達上限（最多 ${TEACHER_CLASS_LIMIT} 個班級）。`); return }
                const ref = fdoc(db,'classCodes',code)
                await runTransaction(db as any, async (tx: any) => {
                  const snap = await tx.get(ref)
                  if (snap.exists()) throw new Error('taken')
                  tx.set(ref, { owner: user.uid, createdAt: serverTimestamp() })
                })
                // 建立後自動加入（若未達 5 個）
                try {
                  const joined = Array.isArray(form.classCodes) ? form.classCodes.slice() : []
                  if (joined.includes(code)) {
                    // 已在清單內
                  } else if (joined.length >= 5) {
                    alert('已建立，但你已加入滿 5 個班級，未自動加入。')
                  } else {
                    const refProfile = fdoc(db,'profiles', user.uid)
                    const next = Array.from(new Set([...joined, code]))
                    await setDoc(refProfile, { classCodes: next, updatedAt: serverTimestamp() }, { merge: true })
                    setForm(s=>({ ...s, classCodes: next }))
                    alert('已建立並自動加入此班級。')
                  }
                } catch {}
                // 更新清單
                try {
                  const q2 = query(collection(db, 'classCodes'), where('owner', '==', user.uid))
                  const snaps2 = await getDocs(q2)
                  setMyCodes(snaps2.docs.map(d => d.id))
                } catch {}
              }catch(e){
                const msg = (e && typeof e==='object' && 'message' in e) ? String((e as {message?:string}).message) : ''
                if (msg==='taken') alert('這個代碼剛被使用，請換一個。')
                else alert(`建立失敗，請稍後再試。${msg?`\n(${msg})`:''}`)
              }
            }}>建立</Button>
            )}
            <Button onClick={async()=>{
              try{
                if(!user) { alert('請先登入後再加入班級。'); return }
                const raw=(form.classCode||'').trim()
                const code=raw.replace(/[－—–]/g,'-')
                if(!CLASS_CODE_REGEX.test(code)){ alert('請輸入 3–50 字，且不可包含 /'); return }
                // 代碼必須存在
                const snap = await getDoc(doc(db,'classCodes', code))
                if(!snap.exists()){ alert('找不到這個班級代碼。'); return }
                const joined = Array.isArray(form.classCodes) ? form.classCodes.slice(0) : []
                if(joined.includes(code)){ alert('你已加入此班級。'); return }
                if(joined.length >= 5){ alert('一次最多加入 5 個班級。'); return }
                const ref = doc(db,'profiles', user.uid)
                const next = Array.from(new Set([...joined, code]))
                await setDoc(ref, { classCodes: next, updatedAt: serverTimestamp() }, { merge: true })
                setForm(s=>({ ...s, classCodes: next }))
                alert('已加入班級。')
              }catch{
                alert('加入失敗，請稍後再試。')
              }
            }}>加入</Button>
          </div>
          
          <div className="mt-2">
            <button
              type="button"
              className="text-[14px] underline text-[var(--color-muted,#6b7280)]"
              onClick={()=> setShowMyCodes(v=>!v)}
              aria-expanded={showMyCodes}
            >
              我的班級（{myCodes.length}/{TEACHER_CLASS_LIMIT}）
            </button>
            {showMyCodes && (
              <div className="mt-2 border border-[var(--color-border,#e5e7eb)] rounded-[12px] p-2">
                {myCodes.length === 0 && (
                  <div className="text-[12px] text-[var(--color-muted,#6b7280)]">尚無班級。建立後會出現在這裡。</div>
                )}
                <div className="flex flex-col gap-2">
                  {myCodes.map(code => (
                    <div key={code} className="flex items-center justify-between gap-2">
                      <div className="font-mono text-[14px] break-all">{code}</div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async()=>{
                            try{
                              await navigator.clipboard.writeText(code)
                              alert('已複製班級代碼到剪貼簿。')
                            }catch{
                              alert('複製失敗，請手動選取複製。')
                            }
                          }}
                        >複製</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async()=>{
                            try{
                              if(!user) return
                              if(!confirm(`確定刪除班級「${code}」？刪除後代碼將釋出，可被他人使用。`)) return
                              await deleteDoc(doc(db,'classCodes', code))
                              setMyCodes(list => list.filter(c => c !== code))
                            }catch{
                              alert('刪除失敗，請稍後再試。')
                            }
                          }}
                        >刪除</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2">
            <button
              type="button"
              className="text-[14px] underline text-[var(--color-muted,#6b7280)]"
              onClick={()=> setShowJoined(v=>!v)}
              aria-expanded={showJoined}
            >
              我加入的班級（{Array.isArray(form.classCodes)?form.classCodes.length:0}/5）
            </button>
            {showJoined && (
              <div className="mt-2 border border-[var(--color-border,#e5e7eb)] rounded-[12px] p-2">
                {(!Array.isArray(form.classCodes) || form.classCodes.length===0) && (
                  <div className="text-[12px] text-[var(--color-muted,#6b7280)]">尚未加入任何班級。</div>
                )}
                <div className="flex flex-col gap-2">
                  {(Array.isArray(form.classCodes)?form.classCodes:[]).map(code => (
                    <div key={code} className="flex items-center justify-between gap-2">
                      <div className="font-mono text-[14px] break-all">{code}</div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async()=>{
                            try{
                              await navigator.clipboard.writeText(code)
                              alert('已複製班級代碼到剪貼簿。')
                            }catch{
                              alert('複製失敗，請手動選取複製。')
                            }
                          }}
                        >複製</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async()=>{
                            try{
                              if(!user) return
                              const next=(Array.isArray(form.classCodes)?form.classCodes:[]).filter(c=>c!==code)
                              await setDoc(doc(db,'profiles', user.uid), { classCodes: next, updatedAt: serverTimestamp() }, { merge: true })
                              setForm(s=>({ ...s, classCodes: next }))
                            }catch{
                              alert('移除失敗，請稍後再試。')
                            }
                          }}
                        >移除</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </label>
        <label>
          <div className="mb-1 text-[14px] text-[var(--color-muted,#6b7280)]">語言</div>
          <select aria-label="Language" value={lang} onChange={(e)=>{ const L=e.target.value; try{ const html=document.documentElement; html.setAttribute('lang', L); html.setAttribute('dir', isRtl(L) ? 'rtl' : 'ltr'); }catch{}; navigate(`/${L}/profile`, { replace: true }) }} className="w-full h-11 rounded-[12px] border border-[var(--color-border,#e5e7eb)] px-3">
            {supportedLangs.map(l => (<option key={l} value={l}>{l}</option>))}
          </select>
        </label>
        <div className="flex gap-3 items-center">
          <Button onClick={() => void save()} disabled={loading}>儲存</Button>
          <Button variant="outline" onClick={() => void signOutGoogle()}>登出</Button>
        </div>
      </div>
      <div className="mt-6">
        <div className="mb-2 text-[var(--color-muted,#6b7280)]">深入分析</div>
        <div className="flex flex-wrap gap-6 items-start">
          <ChartSection topText="上：綜合分數趨勢；下：正確率趨勢。先把正確率拉高，再慢慢變快。">
            <SpeedChart data={histAdj.length ? histAdj : Array.from({length: 20},(_,i)=>({ i, adj: 0 }))} />
            <div className="h-3" />
            <AccuracyChart data={histAcc.length ? histAcc : Array.from({length: 20},(_,i)=>({ i, acc: 0 }))} />
          </ChartSection>
        </div>
      </div>
    </div>
  )
}


