import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import { useAuth } from './hooks'
import { handleRedirectResult, signInWithGoogleRedirect, signOutGoogle } from './actions'
import { Link, useParams } from 'react-router-dom'

export default function AuthWidget() {
  const { user, loading } = useAuth()
  const { t } = useTranslation()
  const { lang } = useParams()
  const [imgError, setImgError] = useState(false)
  useEffect(() => { void handleRedirectResult() }, [])
  // 切換使用者或 photoURL 時，重置錯誤狀態以嘗試重新載入
  useEffect(() => { setImgError(false) }, [user?.uid, user?.photoURL])
  if (loading) return <Button disabled>{t('auth.loading')}</Button>
  if (!user) return <Button onClick={() => void signInWithGoogleRedirect()}>{t('auth.signIn')}</Button>
  // 已登入：顯示頭像，點擊進入 Profile（登出放在 Profile 頁）
  const raw = user.photoURL || ''
  const avatar = (!imgError && raw) ? `${raw}${raw.includes('?') ? '&' : '?'}sz=64` : ''
  const name = user.displayName || '個人資料'
  return (
    <Link to={`/${lang || 'en-US'}/profile`} className="flex items-center gap-2">
      {avatar ? (
        <img src={avatar} alt={name} width={36} height={36} className="rounded-full border border-[var(--color-border,#e5e7eb)]" onError={() => setImgError(true)} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-[var(--color-primary,#16a34a)] text-white grid place-items-center font-semibold">{name.slice(0,1)}</div>
      )}
    </Link>
  )
}


