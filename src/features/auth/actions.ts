import { auth, db, googleProvider } from '../../libs/firebase'
import { getRedirectResult, signInWithRedirect, signInWithPopup, setPersistence, browserLocalPersistence, signOut, type User } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

async function ensureProfile(u: User) {
  const ref = doc(db, 'profiles', u.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: u.displayName || '',
      xp: 0,
      level: 1,
      streakDays: 0,
      langPref: 'en-US',
      gender: 'U',
      dobYM: '',
      role: 'student',
      points: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }
}

export async function handleRedirectResult() {
  const res = await getRedirectResult(auth).catch(() => null)
  if (res?.user) await ensureProfile(res.user)
}

export async function signInWithGoogleRedirect() {
  try {
    await setPersistence(auth, browserLocalPersistence)
  } catch {}
  try {
    // 先嘗試彈窗（體驗較好），失敗再改用 redirect
    const res = await signInWithPopup(auth, googleProvider)
    if (res?.user) await ensureProfile(res.user)
  } catch (e: any) {
    const msg = String((e && e.code) || '')
    if (/popup/i.test(msg)) {
      await signInWithRedirect(auth, googleProvider)
      return
    }
    throw e
  }
}

export async function signOutGoogle() {
  await signOut(auth)
}


