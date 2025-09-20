import { db } from '../../libs/firebase'
import { doc, serverTimestamp, collection, Timestamp, query, where, orderBy, limit, getDocs, getDoc, writeBatch } from 'firebase/firestore'
import { typingConfig } from '../typing/config'
import type { LangKey } from '../typing/config'
import gardenConfig from '../garden/config'

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }

function formatDateKey(ms: number = Date.now()) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = `${d.getMonth()+1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${dd}`
}

async function getTodayAttemptEp(uid: string): Promise<number> {
  const today = formatDateKey()
  const start = new Date(today + 'T00:00:00')
  const q = query(collection(db, 'economyLogs'), where('uid', '==', uid), where('ts', '>=', Timestamp.fromDate(start)), orderBy('ts', 'desc'), limit(200))
  const snaps = await getDocs(q)
  let sum = 0
  snaps.docs.forEach(d => { const v = d.data() as any; if (v.type === 'earn' && v.source === 'attempt') sum += Number(v.delta || 0) })
  return sum
}

export async function applyAttemptRewards(params: {
  uid: string
  lang: string
  durationSec: number
  raw: number // en: WPM, zh: CPM
  adj: number
  accuracy: number
  correctChars?: number
  totalChars?: number
  totalQChars?: number
}) {
  const { uid, lang, durationSec, raw, adj, accuracy, correctChars, totalChars, totalQChars } = params
  const minutes = Math.max(durationSec, 1) / 60
  const langKey = (['en-US','zh-TW','zh-CN'].includes(lang) ? lang : 'en-US') as LangKey
  const base = typingConfig.baseByLang[langKey]

  // Target depends on profile.grade; fetch inside transaction later. We precompute EP formula parts here.
  const todayEarned = await getTodayAttemptEp(uid)
  const remainingCap = Math.max(0, typingConfig.dailyEpCap - todayEarned)

  // 以批次寫入取代交易，避免「reads before writes」限制導致失敗；獎勵計算對一致性要求低
  const profileRef = doc(db, 'profiles', uid)
  const profileSnap = await getDoc(profileRef)
  const profile = (profileSnap.exists() ? profileSnap.data() : {}) as any
    const grade: number = Number(profile.grade || 3)
    const target = typingConfig.targetByGrade[langKey]?.[grade as 1|2|3|4|5|6] || 20

    const epUncapped = base * minutes * clamp(adj / target, 0, 2) * (0.5 + 0.5 * accuracy)
    // 鼓勵性規則：
    // - 快速練習（≥5s 且 acc≥0.3）至少給 1 點，避免孩子灰心
    // - 合格嘗試（≥30s 且 acc≥0.5）至少給 1 點；其餘採四捨五入
    let epRounded = Math.round(epUncapped)
    if (epRounded <= 0) {
      if (durationSec >= 30 && accuracy >= 0.5) epRounded = 1
      else if (durationSec >= 5 && accuracy >= 0.3) epRounded = 1
    }
    const ep = Math.min(remainingCap, Math.max(0, epRounded))

  // boosters（讀取存貨）
  const invRef = doc(db, 'inventory', uid)
  const invSnap = await getDoc(invRef)
    const inv = invSnap.exists() ? invSnap.data() as any : {}
    const nowMs = Date.now()
    const fertUntil = inv.fertilizerActiveUntil?.toMillis ? inv.fertilizerActiveUntil.toMillis() : Number(inv.fertilizerActiveUntil || 0)
    const waterUntil = inv.waterActiveUntil?.toMillis ? inv.waterActiveUntil.toMillis() : Number(inv.waterActiveUntil || 0)
    const fertilizerToday = fertUntil > nowMs ? 1 : 0
    const waterToday = waterUntil > nowMs ? 1 : 0
    const gp = Math.floor(ep * (1 + 0.2 * fertilizerToday + 0.1 * waterToday))

  // 準備批次
  const batch = writeBatch(db)

  // Update profile points/xp
  const newPoints = Number(profile.points || 0) + ep
  const newXp = Number(profile.xp || 0) + ep
  batch.set(profileRef, { points: newPoints, xp: newXp, updatedAt: serverTimestamp() }, { merge: true })

  // Update tree stage/progress
  const treeRef = doc(db, 'trees', uid)
  const treeSnap = await getDoc(treeRef)
    const tree = (treeSnap.exists() ? treeSnap.data() : {}) as any
    const gpTotal = Number(tree.gpTotal || 0) + gp
    // track today's GP for fruits rule
    const todayKey = formatDateKey()
    const dailyDate = tree.dailyDate || todayKey
    const prevDailyGp = Number(tree.dailyGp || 0)
    const dailyGp = (dailyDate === todayKey ? prevDailyGp + gp : gp)
    let stage = tree.stage || 1
    if (gpTotal >= gardenConfig.stages.s5) stage = 5
    else if (gpTotal >= gardenConfig.stages.s4) stage = 4
    else if (gpTotal >= gardenConfig.stages.s3) stage = 3
    else if (gpTotal >= gardenConfig.stages.s2) stage = 2
    else stage = 1

    if (!treeSnap.exists()) {
      batch.set(treeRef, {
        uid,
        seed: Math.floor(Math.random() * 1e9),
        dna: { angle: 22, branchVar: 0.3, leafHue: 120, fruitHue: 12 },
        stage,
        gpTotal,
        dailyGp,
        dailyDate: todayKey,
        lastActiveDate: formatDateKey(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } else {
      batch.update(treeRef, { stage, gpTotal, dailyGp, dailyDate: todayKey, lastActiveDate: formatDateKey(), updatedAt: serverTimestamp() })
    }

  // Economy log
  const logRef = collection(db, 'economyLogs')
  batch.set(doc(logRef), { uid, ts: serverTimestamp(), type: 'earn', source: 'attempt', delta: ep, balanceAfter: newPoints, durationSec, raw, adj, accuracy, correctChars, totalChars, totalQChars })

  await batch.commit()
}


