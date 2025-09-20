import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from './app'

export type PlantState = { stage: 1|2|3|4|5 }

export function usePlantLevel(plantId: string = 'default') {
  const [state, setState] = useState<PlantState>({ stage: 1 })
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const uid = auth.currentUser?.uid

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    setError(null)
    try {
      const ref = doc(db, 'users', uid, 'plants', plantId)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data() as Partial<PlantState>
        const st = (Number(data.stage) as 1|2|3|4|5) || 1
        setState({ stage: st })
      } else {
        await setDoc(ref, { stage: 1 })
        setState({ stage: 1 })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load plant')
    } finally {
      setLoading(false)
    }
  }, [uid, plantId])

  const save = useCallback(async (next: Partial<PlantState>) => {
    if (!uid) return
    setLoading(true)
    setError(null)
    try {
      const ref = doc(db, 'users', uid, 'plants', plantId)
      const merged = { ...state, ...next }
      await setDoc(ref, merged, { merge: true })
      setState(merged as PlantState)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save plant')
    } finally {
      setLoading(false)
    }
  }, [uid, plantId, state])

  useEffect(() => { void load() }, [load])

  return { state, loading, error, load, save }
}


