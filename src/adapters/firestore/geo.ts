import { db } from '../../libs/firebase'
import { doc, getDoc, writeBatch, increment } from 'firebase/firestore'

export async function ensureUserCountryCount(uid: string) {
  try {
    const profRef = doc(db, 'profiles', uid)
    const profSnap = await getDoc(profRef)
    const country = (profSnap.data() as { country?: string } | undefined)?.country
    if (!country || typeof country !== 'string' || country.length !== 2) return

    const userRef = doc(db, 'metrics_country_users', uid)
    const userSnap = await getDoc(userRef)
    const prev = (userSnap.data() as { last?: string } | undefined)?.last
    if (prev === country) return // already accounted

    const batch = writeBatch(db)
    if (prev && prev !== country) {
      batch.set(doc(db, 'metrics_country', prev.toUpperCase()), { count: increment(-1) }, { merge: true })
    }
    batch.set(doc(db, 'metrics_country', country.toUpperCase()), { count: increment(1) }, { merge: true })
    batch.set(userRef, { last: country.toUpperCase() }, { merge: true })
    await batch.commit()
  } catch {}
}


