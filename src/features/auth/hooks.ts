import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { db } from '../../libs/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { inferCountryIso2 } from '../../libs/geo'
import { ensureUserCountryCount } from '../../adapters/firestore/geo'
import { auth } from '../../libs/firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u); setLoading(false)
      try {
        if (!u) return
        const ref = doc(db, 'profiles', u.uid)
        const snap = await getDoc(ref)
        const inferred = inferCountryIso2()
        if (!snap.exists()) {
          await setDoc(ref, { createdAt: serverTimestamp(), country: inferred }, { merge: true })
          return
        }
        const data = snap.data() as { country?: string } | undefined
        // 若為 Auto 或空值，回填推測值；若使用者已手選，尊重使用者
        if (!data?.country || data.country === 'Auto') {
          await setDoc(ref, { country: inferred, updatedAt: serverTimestamp() }, { merge: true })
        }
        // 確保國家彙總計數已更新
        await ensureUserCountryCount(u.uid)
      } catch {}
    })
    return () => unsub()
  }, [])
  return { user, loading }
}


