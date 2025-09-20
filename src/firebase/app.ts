import { auth, db, googleProvider } from '../libs/firebase'
import { setPersistence, browserLocalPersistence, signInWithPopup, signInWithRedirect, type UserCredential } from 'firebase/auth'

export { auth, db }

export async function signInWithGoogle(): Promise<UserCredential> {
  await setPersistence(auth, browserLocalPersistence)
  try {
    return await signInWithPopup(auth, googleProvider)
  } catch (e) {
    return await signInWithRedirect(auth, googleProvider)
  }
}


