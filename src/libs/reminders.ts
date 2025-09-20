// Lightweight client-side daily reminder (no backend, no push).
// Stores last practice timestamp and user preference in localStorage,
// shows a Notification (if granted) or an in-app banner on next visit
// when more than threshold hours have passed.

const LS_KEY_PREF = 'typesprout_reminder_pref_v1' // JSON: { enabled: boolean, hour: number }
const LS_KEY_LAST = 'typesprout_last_practice_v1' // number: epoch ms

export type ReminderPref = { enabled: boolean; hour: number }

export function loadReminderPref(): ReminderPref {
  try {
    const raw = localStorage.getItem(LS_KEY_PREF)
    if (!raw) return { enabled: true, hour: 19 }
    const obj = JSON.parse(raw) as Partial<ReminderPref>
    return { enabled: obj.enabled ?? true, hour: Number.isFinite(obj.hour) ? (obj.hour as number) : 19 }
  } catch {
    return { enabled: true, hour: 19 }
  }
}

export function saveReminderPref(pref: ReminderPref) {
  try { localStorage.setItem(LS_KEY_PREF, JSON.stringify(pref)) } catch {}
}

export function markPracticedNow() {
  try { localStorage.setItem(LS_KEY_LAST, String(Date.now())) } catch {}
}

export function getLastPracticeMs(): number | null {
  const v = localStorage.getItem(LS_KEY_LAST)
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function shouldRemind(nowMs = Date.now()): boolean {
  const pref = loadReminderPref()
  if (!pref.enabled) return false
  const last = getLastPracticeMs()
  if (!last) return true
  const diffHrs = (nowMs - last) / 3600000
  if (diffHrs < 24) return false
  const now = new Date(nowMs)
  return now.getHours() >= pref.hour
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try { return await Notification.requestPermission() } catch { return Notification.permission }
}

export function showReminderNotification() {
  if (!('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  try {
    new Notification('來練習幾分鐘吧！', {
      body: '每天練習一點點，小樹就會長大、還能結果！',
      badge: '/icons/badge-72.png',
      icon: '/icons/icon-192.png',
    })
    return true
  } catch {
    return false
  }
}


