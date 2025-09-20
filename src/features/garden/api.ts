import { db } from '../../libs/firebase'
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore'
import gardenConfig from './config'

export type GardenState = {
  tree?: { stage: number; gpTotal: number }
  inventory?: { fertilizer?: number; water?: number }
}

export async function loadGarden(uid: string): Promise<GardenState> {
  try {
    const [treeSnap, invSnap] = await Promise.all([
      getDoc(doc(db, 'trees', uid)),
      getDoc(doc(db, 'inventory', uid)),
    ])
    return {
      tree: treeSnap.exists() ? (treeSnap.data() as any) : undefined,
      inventory: invSnap.exists() ? (invSnap.data() as any) : undefined,
    }
  } catch (e: any) {
    // 若缺權或舊資料缺少 uid 欄位，嘗試以當前使用者 uid 初始化並重試
    if (e?.code === 'permission-denied') {
      const treeRef = doc(db, 'trees', uid)
      const invRef = doc(db, 'inventory', uid)
      await Promise.all([
        setDoc(treeRef, { uid, gpTotal: 0, stage: 1, lastActiveDate: new Date().toISOString().slice(0,10), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }),
        setDoc(invRef, { fertilizer: 0, water: 0, updatedAt: serverTimestamp() }, { merge: true }),
      ])
      const [treeSnap2, invSnap2] = await Promise.all([
        getDoc(treeRef),
        getDoc(invRef),
      ])
      return {
        tree: treeSnap2.exists() ? (treeSnap2.data() as any) : undefined,
        inventory: invSnap2.exists() ? (invSnap2.data() as any) : undefined,
      }
    }
    throw e
  }
}

export async function recentEconomyLogs(uid: string, n = 20) {
  const q = query(collection(db, 'economyLogs'), where('uid', '==', uid), orderBy('ts', 'desc'), limit(n))
  const snaps = await getDocs(q)
  return snaps.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
}

export function nextStageTarget(gpTotal: number): { next: number; currentStage: number } {
  const s = gardenConfig.stages
  if (gpTotal >= s.s5) return { next: s.s5, currentStage: 5 }
  if (gpTotal >= s.s4) return { next: s.s5, currentStage: 4 }
  if (gpTotal >= s.s3) return { next: s.s4, currentStage: 3 }
  if (gpTotal >= s.s2) return { next: s.s3, currentStage: 2 }
  return { next: s.s2, currentStage: 1 }
}

export async function harvestToday(uid: string) {
  await runTransaction(db, async (tx) => {
    const treeRef = doc(db, 'trees', uid)
    const treeSnap = await tx.get(treeRef)
    if (!treeSnap.exists()) throw new Error('NO_TREE')
    const tree = treeSnap.data() as any
    const today = new Date().toISOString().slice(0,10)
    if (tree.stage < 5) throw new Error('NOT_FRUIT_STAGE')
    if ((tree.dailyDate || today) !== today) throw new Error('NO_DAILY_GP')
    const dailyGp = Number(tree.dailyGp || 0)
    if (dailyGp <= 0) throw new Error('NO_DAILY_GP')
    // compute fruits
    const streakDays = Number((tree.streakDays || 0))
    const fruits = Math.floor((dailyGp / 100) * (1 + Math.min((streakDays/7)*0.1, 0.3)))
    if (fruits <= 0) throw new Error('NO_FRUITS')
    // write harvest
    const hRef = doc(collection(db, 'harvests'))
    tx.set(hRef, { uid, date: today, fruits, pointsGained: Math.floor(fruits*5), treeSeed: tree.seed || 0 })
    // refund small points and reset daily gp
    const profRef = doc(db, 'profiles', uid)
    const profSnap = await tx.get(profRef)
    const points = Number((profSnap.exists()? (profSnap.data() as any).points : 0) || 0)
    tx.set(profRef, { points: points + Math.floor(fruits*5), updatedAt: serverTimestamp() }, { merge: true })
    tx.update(treeRef, { dailyGp: 0, updatedAt: serverTimestamp() })
    tx.set(doc(collection(db, 'economyLogs')), { uid, ts: serverTimestamp(), type: 'earn', source: 'harvest', delta: Math.floor(fruits*5), balanceAfter: points + Math.floor(fruits*5) })
  })
}

export async function updateWitheredOrRevive(uid: string, action: 'check'|'revive') {
  await runTransaction(db, async (tx) => {
    const treeRef = doc(db, 'trees', uid)
    const treeSnap = await tx.get(treeRef)
    if (!treeSnap.exists()) return
    const tree = treeSnap.data() as any
    const last = new Date(tree.lastActiveDate || new Date().toISOString().slice(0,10))
    const days = Math.floor((Date.now() - last.getTime()) / (24*60*60*1000))
    if (action === 'check') {
      if (days >= 7 && tree.stage !== 'withered') {
        tx.update(treeRef, { stage: 'withered', updatedAt: serverTimestamp() })
      }
      return
    }
    if (action === 'revive') {
      const invRef = doc(db, 'inventory', uid)
      const invSnap = await tx.get(invRef)
      const inv = invSnap.exists()? invSnap.data() as any : { water: 0 }
      if (Number(inv.water||0) < 3) throw new Error('NEED_3_WATER')
      // Require at least 60s test today
      const today = new Date()
      const start = new Date(today.toISOString().slice(0,10)+'T00:00:00')
      const attemptsQ = query(collection(db, 'attempts'), where('uid','==',uid), where('ts','>=', Timestamp.fromDate(start)))
      const attemptsSnaps = await getDocs(attemptsQ)
      const totalSec = attemptsSnaps.docs.reduce((s, d) => s + Number((d.data() as any).durationSec || 0), 0)
      if (totalSec < 60) throw new Error('NEED_60S_TODAY')
      tx.update(invRef, { water: Number(inv.water)-3, updatedAt: serverTimestamp() })
      tx.update(treeRef, { stage: 3, updatedAt: serverTimestamp() })
    }
  })
}

// 活躍度轉 Stage：最近 5 天活躍日數（0..5）→ Stage 1..5
export function stageFromRecentActivity(activeDaysIn5: number): 1|2|3|4|5 {
  const s = Math.max(1, Math.min(5, Math.floor(activeDaysIn5)))
  return (s as 1|2|3|4|5)
}

// 近 5 天活躍度計算（放寬版）：每天有效輸入>0 分鐘即視為活躍；分鐘數取整
export async function computeRecent5DaysActivity(uid: string): Promise<{ days: { date: string; active: boolean; minutes: number }[]; activeDays: number }>{
  const today = new Date()
  const dates: string[] = []
  for (let i=4; i>=0; i--) {
    const d = new Date(today.getTime() - i*24*60*60*1000)
    dates.push(d.toISOString().slice(0,10))
  }
  const start = new Date(dates[0]+'T00:00:00')
  const q = query(collection(db, 'attempts'), where('uid','==',uid), where('ts','>=', Timestamp.fromDate(start)), orderBy('ts','asc'))
  const snaps = await getDocs(q)
  const byDate = new Map<string, number>()
  for (const s of snaps.docs) {
    const data = s.data() as any
    const ts: Date = data.ts?.toDate?.() ? data.ts.toDate() : (data.ts instanceof Date ? data.ts : new Date())
    const dur = Number(data.durationSec || 0)
    const date = ts.toISOString().slice(0,10)
    byDate.set(date, (byDate.get(date) || 0) + dur)
  }
  const days = dates.map(date => {
    const sec = byDate.get(date) || 0
    const minutes = Math.floor(sec / 60)
    const active = minutes > 0
    return { date, active, minutes }
  })
  const activeDays = days.filter(d => d.active).length
  return { days, activeDays }
}

// 根據近 5 天活躍自動升降，並寫回 users/{uid}/plants/default 與 trees/{uid}
export async function updateStageFromRecentActivity(uid: string): Promise<{ stage: 1|2|3|4|5; days: { date: string; active: boolean; minutes: number }[] }>{
  const { days, activeDays } = await computeRecent5DaysActivity(uid)
  const stage = stageFromRecentActivity(activeDays)
  await runTransaction(db, async (tx) => {
    const treeRef = doc(db, 'trees', uid)
    const fruitsRef = doc(db, 'fruits', uid)
    const awardRef = doc(collection(db, 'fruits', uid, 'awards'), days[days.length-1]?.date || new Date().toISOString().slice(0,10))
    const treeSnap = await tx.get(treeRef)
    const fruitsSnap = await tx.get(fruitsRef)
    const awardSnap = await tx.get(awardRef)
    const prev = treeSnap.exists()? (treeSnap.data() as any) : { stage: 1, gpTotal: 0 }
    if (!treeSnap.exists()) {
      tx.set(treeRef, { uid, stage, gpTotal: 0, updatedAt: serverTimestamp(), lastActiveDate: days[days.length-1]?.date }, { merge: true })
    } else if (Number(prev.stage) !== stage) {
      tx.update(treeRef, { stage, updatedAt: serverTimestamp(), lastActiveDate: days[days.length-1]?.date })
    } else {
      tx.update(treeRef, { updatedAt: serverTimestamp(), lastActiveDate: days[days.length-1]?.date })
    }
    // 果實規則：每 5 天活躍（activeDays===5）發 1 顆果實；同一 5 天窗口僅發一次
    if (activeDays === 5 && !awardSnap.exists()) {
      const currentTotal = fruitsSnap.exists() ? Number((fruitsSnap.data() as any).total || 0) : 0
      tx.set(awardRef, { uid, windowEnd: days[days.length-1]?.date, at: serverTimestamp() })
      tx.set(fruitsRef, { uid, total: currentTotal + 1, updatedAt: serverTimestamp() }, { merge: true })
    }
    const plantRef = doc(db, 'users', uid, 'plants', 'default')
    tx.set(plantRef, { stage, updatedAt: serverTimestamp() }, { merge: true })
  })
  return { stage, days }
}


