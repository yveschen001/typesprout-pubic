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
  console.log('applyAttemptRewards: 开始处理奖励', { uid, lang, durationSec, raw, adj, accuracy, correctChars, totalChars, totalQChars })
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
    // 鼓勵性規則（更新）：
    // - 合格嘗試（≥30s 且 acc≥0.5）至少給 1 點
    // - 短練習階梯：若 acc≥0.3，按『每 10 秒至少 +1 點』計算下限（可累加）
    let epRounded = Math.round(epUncapped)
    const shortFloor = (accuracy >= 0.3) ? Math.floor(durationSec / 10) : 0
    epRounded = Math.max(epRounded, shortFloor)
    if (epRounded <= 0 && durationSec >= 30 && accuracy >= 0.5) epRounded = 1
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
  const logData = { uid, ts: serverTimestamp(), type: 'earn', source: 'attempt', delta: ep, balanceAfter: newPoints, durationSec, raw, adj, accuracy, correctChars, totalChars, totalQChars }
  console.log('applyAttemptRewards: 准备写入 economyLogs', logData)
  batch.set(doc(logRef), logData)

  console.log('applyAttemptRewards: 提交批次写入')
  try {
    await batch.commit()
    console.log('applyAttemptRewards: 批次写入完成')
  } catch (error) {
    console.error('applyAttemptRewards: 批次写入失败', error)
    throw error
  }
}


