import { Link, useParams } from 'react-router-dom'

export default function NotFound() {
  const { lang } = useParams()
  const L = lang || 'en-US'
  return (
    <div className="max-w-[960px] mx-auto px-4 py-10">
      <h2 className="text-xl font-bold mb-2">找不到頁面</h2>
      <p className="text-[var(--color-muted,#6b7280)] mb-4">你要瀏覽的頁面不存在或已移除。</p>
      <Link to={`/${L}/`} className="underline">回到首頁</Link>
    </div>
  )
}


