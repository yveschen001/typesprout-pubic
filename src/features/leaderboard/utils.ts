export type Attempt = {
  uid: string
  lang: string
  ts: any
  durationSec: number
  accuracy: number
  rawWpm?: number
  cpm?: number
  adjWpm?: number
  classCode?: string
}

export type LeaderboardOptions = {
  lang: string
  gradeFilter?: number
  classCode?: string
  uidToGrade?: Record<string, number>
}

export function filterAttempts(attempts: Attempt[], opts: LeaderboardOptions) {
  const L = opts.lang
  const isZh = L.startsWith('zh')
  
  console.log('filterAttempts: starting with', attempts.length, 'attempts')
  console.log('filterAttempts: opts', opts)
  
  let filtered = attempts
  console.log('filterAttempts: after start', filtered.length)
  
  // 语言过滤
  filtered = filtered.filter(a => a.lang === L)
  console.log('filterAttempts: after lang filter', filtered.length, 'lang:', L)
  
  // 时长和准确率过滤（降低到5秒）
  filtered = filtered.filter(a => {
    const valid = a.durationSec >= 5 && a.accuracy >= 0 && a.accuracy <= 1
    if (!valid) {
      console.log('filterAttempts: filtered out by duration/accuracy:', {
        durationSec: a.durationSec,
        accuracy: a.accuracy,
        uid: a.uid
      })
    }
    return valid
  })
  console.log('filterAttempts: after duration/accuracy filter', filtered.length)
  
  // 速度过滤
  filtered = filtered.filter(a => {
    const raw = isZh ? a.cpm : a.rawWpm
    if (!raw) {
      console.log('filterAttempts: filtered out by missing raw speed:', {
        cpm: a.cpm,
        rawWpm: a.rawWpm,
        isZh,
        uid: a.uid
      })
      return false
    }
    const valid = isZh ? raw <= 400 : raw <= 200
    if (!valid) {
      console.log('filterAttempts: filtered out by speed limit:', {
        raw,
        isZh,
        limit: isZh ? 400 : 200,
        uid: a.uid
      })
    }
    return valid
  })
  console.log('filterAttempts: after speed filter', filtered.length)
  
  // 班级代码过滤
  filtered = filtered.filter(a => (opts.classCode ? a.classCode === opts.classCode : true))
  console.log('filterAttempts: after classCode filter', filtered.length)
  
  // 年级过滤
  filtered = filtered.filter(a => {
    if (!opts.gradeFilter) return true
    const g = opts.uidToGrade?.[a.uid]
    const valid = typeof g === 'number' ? g === opts.gradeFilter : false
    if (!valid) {
      console.log('filterAttempts: filtered out by grade:', {
        uid: a.uid,
        grade: g,
        gradeFilter: opts.gradeFilter,
        uidToGrade: opts.uidToGrade
      })
    }
    return valid
  })
  console.log('filterAttempts: after grade filter', filtered.length)
  
  return filtered
}

import { winsorize, average } from '../../utils/stats/winsorize'

export function toTopN(attempts: Attempt[], n = 20, period: 'today' | 'yesterday' | 'lastWeek' | 'lastMonth' = 'today') {
  // 按用户合并指定时间段的数据
  const userMap = new Map<string, {
    uid: string
    totalDuration: number
    totalChars: number
    avgAccuracy: number
    maxAdjWpm: number
    attempts: Attempt[]
  }>()
  
  // 获取UTC时间范围
  const now = new Date()
  let startDate: string
  let endDate: string
  
  if (period === 'today') {
    // 今天 (本地时间 00:00 到 23:59)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    startDate = today.toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
    endDate = today.toLocaleDateString('en-CA')
  } else if (period === 'yesterday') {
    // 昨天 (本地时间 00:00 到 23:59)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayLocal = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())
    startDate = yesterdayLocal.toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
    endDate = yesterdayLocal.toLocaleDateString('en-CA')
  } else if (period === 'lastWeek') {
    // 上周 (自然周，周一到周日)
    const dayOfWeek = now.getDay() // 0=周日, 1=周一, ..., 6=周六
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 距离本周一的天数
    const thisMonday = new Date(now.getTime() - daysToMonday * 24 * 60 * 60 * 1000)
    const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000)
    const lastSunday = new Date(lastMonday.getTime() + 6 * 24 * 60 * 60 * 1000)
    startDate = lastMonday.toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
    endDate = lastSunday.toLocaleDateString('en-CA')
  } else { // lastMonth
    // 上个月 (自然月，1号到月末)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    startDate = lastMonth.toLocaleDateString('en-CA') // 按照 .cursorrules 規則使用本地時間
    endDate = lastDayOfLastMonth.toLocaleDateString('en-CA')
  }
  
  console.log('toTopN: processing period', period, 'from', startDate, 'to', endDate)
  console.log('toTopN: total attempts to process', attempts.length)
  
  let processedCount = 0
  attempts.forEach(attempt => {
    // 按照 .cursorrules 規則：轉換為本地時間格式進行比較
    // 使用 UTC 時間轉換為本地日期，避免時區轉換問題
    const attemptTs = attempt.ts?.toDate?.() || new Date(attempt.ts)
    const attemptDate = attemptTs.toISOString().slice(0, 10) // 使用 UTC 日期進行比較
    
    // 处理指定时间段的数据（查询已经限制了时间范围，这里做额外检查）
    if (attemptDate < startDate || attemptDate > endDate) {
      console.log('toTopN: skipping attempt from', attemptDate, 'not in range', startDate, 'to', endDate)
      return
    }
    
    processedCount++
    
    const uid = attempt.uid
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        uid,
        totalDuration: 0,
        totalChars: 0,
        avgAccuracy: 0,
        maxAdjWpm: 0,
        attempts: []
      })
    }
    
    const userData = userMap.get(uid)!
    userData.totalDuration += attempt.durationSec || 0
    userData.totalChars += (attempt.rawChars || 0)
    userData.avgAccuracy += attempt.accuracy || 0
    userData.maxAdjWpm = Math.max(userData.maxAdjWpm, attempt.adjWpm || 0)
    userData.attempts.push(attempt)
  })
  
  // 计算平均准确率
  userMap.forEach(userData => {
    if (userData.attempts.length > 0) {
      userData.avgAccuracy = userData.avgAccuracy / userData.attempts.length
    }
  })
  
  console.log('toTopN: processed attempts', processedCount, 'unique users', userMap.size)
  
  // 转换为数组并按综合分数排序
  const userArray = Array.from(userMap.values()).map(userData => {
    // 综合分数 = 最大adjWpm * 平均准确率 * 总时长权重
    const durationWeight = Math.min(userData.totalDuration / 60, 2) // 最多2倍权重
    const score = userData.maxAdjWpm * userData.avgAccuracy * durationWeight
    
    return {
      uid: userData.uid,
      score,
      totalDuration: userData.totalDuration,
      totalChars: userData.totalChars,
      avgAccuracy: userData.avgAccuracy,
      maxAdjWpm: userData.maxAdjWpm,
      attempts: userData.attempts
    }
  })
  
  // 按分数排序
  userArray.sort((a, b) => b.score - a.score)
  
  console.log('toTopN: user merge results:', {
    totalUsers: userArray.length,
    topUsers: userArray.slice(0, 5).map(u => ({
      uid: u.uid,
      score: u.score,
      totalDuration: u.totalDuration,
      maxAdjWpm: u.maxAdjWpm,
      avgAccuracy: u.avgAccuracy
    }))
  })
  
  // 返回前N个用户，每个用户只返回一条记录
  return userArray.slice(0, n).map(userData => {
    // 使用该用户最好的attempt作为代表
    const bestAttempt = userData.attempts.reduce((best, current) => 
      (current.adjWpm || 0) > (best.adjWpm || 0) ? current : best
    )
    
    return {
      ...bestAttempt,
      // 添加合并后的数据
      totalDuration: userData.totalDuration,
      totalChars: userData.totalChars,
      avgAccuracy: userData.avgAccuracy,
      maxAdjWpm: userData.maxAdjWpm,
      mergedScore: userData.score
    }
  })
}


