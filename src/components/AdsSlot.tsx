export default function AdsSlot({ placement }: { placement: 'home' | 'pretest' | 'posttest' }) {
  const enabled = String(import.meta.env.VITE_ADS_ENABLED || 'false') === 'true'
  const childDirected = String(import.meta.env.VITE_ADS_CHILD_DIRECTED || 'true') === 'true'
  if (!enabled) return null
  return (
    <div style={{ marginTop: 12, padding: 12, border: '1px dashed #e5e7eb', borderRadius: 12, color: '#6b7280' }}>
      Ads placeholder ({placement}) — childDirected: {String(childDirected)}
    </div>
  )
}


