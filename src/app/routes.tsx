import { lazy, Suspense } from 'react'
import React from 'react'
import type { RouteObject } from 'react-router-dom'
import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom'
import { useAuth } from '../features/auth/hooks'
import { signInWithGoogle } from '../firebase/app'
import Seedling from '../features/seedling/Seedling'
import Button from '../components/Button'
import { usePlantLevel } from '../firebase/usePlantLevel'

const Home = lazy(() => import('../pages/Home'))
const Test = lazy(() => import('../pages/Test'))
const Result = lazy(() => import('../pages/Result'))
const Leaderboard = lazy(() => import('../pages/Leaderboard'))
const Profile = lazy(() => import('../pages/Profile'))
const Garden = lazy(() => import('../pages/Garden'))
const Admin = lazy(() => import('../pages/Admin'))
const NotFound = lazy(() => import('../pages/NotFound'))
const Terms = lazy(() => import('../pages/Terms'))
const Privacy = lazy(() => import('../pages/Privacy'))

export const langChildRoutes: RouteObject[] = [
  { index: true, element: <Suspense fallback={null}><Home /></Suspense>, errorElement: <ErrorView /> },
  { path: 'test', element: <Suspense fallback={null}><Test /></Suspense>, errorElement: <ErrorView /> },
  { path: 'result', element: <Suspense fallback={null}><Result /></Suspense>, errorElement: <ErrorView /> },
  { path: 'leaderboard', element: <Suspense fallback={null}><Leaderboard /></Suspense>, errorElement: <ErrorView /> },
  { path: 'profile', element: <Suspense fallback={null}><Profile /></Suspense>, errorElement: <ErrorView /> },
  { path: 'garden', element: <Suspense fallback={null}><Garden /></Suspense>, errorElement: <ErrorView /> },
  { path: 'seedling', element: <Gate />, errorElement: <ErrorView /> },
  { path: '*', element: <Suspense fallback={null}><NotFound /></Suspense>, errorElement: <ErrorView /> },
]

export const adminRoutes: RouteObject[] = [
  { path: '/admin', element: <Suspense fallback={null}><Admin /></Suspense>, errorElement: <ErrorView /> },
  { path: '/:lang/terms', element: <Suspense fallback={null}><Terms /></Suspense>, errorElement: <ErrorView /> },
  { path: '/:lang/privacy', element: <Suspense fallback={null}><Privacy /></Suspense>, errorElement: <ErrorView /> },
]


function Gate() {
  const { user, loading } = useAuth()
  // 確保 hooks 順序穩定：無論是否登入都先呼叫 usePlantLevel
  const { state, save, loading: saving } = usePlantLevel('default')
  if (loading) return null
  if (!user) {
    return (
      <div className="max-w-[960px] mx-auto px-4">
        <h2 className="h2 mb-3">Seedling</h2>
        <p className="mb-3">請先使用 Google 登入</p>
        <Button onClick={() => { void signInWithGoogle() }}>Sign in with Google</Button>
      </div>
    )
  }
  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="h2 mb-3">Seedling</h2>
      <div className="w-64 h-64">
        <Seedling stage={state.stage} className="w-full h-full" />
      </div>
      <div className="mt-6">
        <div className="text-[var(--color-muted,#6b7280)] mb-2">五階段總覽（便於比對外觀）</div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {[1,2,3,4,5].map((s) => (
            <div key={s} className="p-3 border rounded-[12px] text-center">
              <div className="mx-auto w-32 h-32">
                <Seedling stage={s as 1|2|3|4|5} className="w-full h-full" />
              </div>
              <div className="mt-1 text-sm">階段 {s}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span>階段</span>
          <select className="h-10 rounded-[10px] border px-2" value={state.stage} onChange={(e)=>{ void save({ stage: Number(e.target.value) as 1|2|3|4|5 }) }} disabled={saving}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </label>
        {/* 加成已移除 */}
      </div>
      <div className="mt-2 text-[var(--color-muted,#6b7280)] text-sm">已即時儲存至 Firestore：{`users/{uid}/plants/default`}</div>
    </div>
  )
}


function ErrorView() {
  const err = useRouteError()
  const isResp = isRouteErrorResponse(err as any)
  const message = (() => {
    try {
      if (isResp) return `${(err as any).status} ${(err as any).statusText}`
      if (err && typeof err === 'object' && 'message' in (err as any)) return String((err as any).message)
      return '載入頁面時發生錯誤，請稍後再試。'
    } catch { return '載入頁面時發生錯誤，請稍後再試。' }
  })()
  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <div className="p-4 border rounded-[12px] bg-red-50 border-red-200 text-red-700">
        <div className="font-semibold mb-1">發生錯誤</div>
        <div className="text-sm mb-3">{message}</div>
        <Link to=".." relative="path" className="inline-flex items-center px-3 h-10 rounded-[10px] border bg-white">返回上一頁</Link>
        <span className="mx-2" />
        <Link to="/" className="inline-flex items-center px-3 h-10 rounded-[10px] border bg-white">回到首頁</Link>
      </div>
    </div>
  )
}

