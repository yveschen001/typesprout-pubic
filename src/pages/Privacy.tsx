export default function Privacy() {
  return (
    <div className="max-w-[960px] mx-auto px-4">
      <h2 className="text-xl font-semibold mb-3">隱私權政策</h2>
      <p className="text-[var(--color-muted,#6b7280)] mb-2">我們重視兒童與家長的隱私。僅在必要時收集最少量資料，例如登入資訊與練習成績，並採取合理且合規的安全措施保存。</p>
      <p className="text-[var(--color-muted,#6b7280)] mb-2">我們不販售個人資料；你可依需求請求查詢或刪除個人資料。</p>
      <details className="mt-2">
        <summary className="cursor-pointer select-none">？ 我們會收集什麼資料？</summary>
        <div className="mt-2 text-sm text-[var(--color-muted,#6b7280)]">僅包含必要的登入識別（如 UID、暱稱、頭像）與打字練習結果（時間、速度、正確率等統計），用於學習回饋與排行榜。無廣告個資販售。</div>
      </details>
      <p className="text-[var(--color-muted,#6b7280)] mt-3">聯絡信箱：privacy@typesprout.example</p>
    </div>
  )
}


