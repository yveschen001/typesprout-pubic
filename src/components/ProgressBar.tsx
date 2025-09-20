import React from 'react'

export default function ProgressBar({ percent, label, color, striped }: { percent: number; label?: string; color?: string; striped?: boolean }) {
  const p = Math.max(0, Math.min(100, percent))
  const barColor = color || 'var(--color-primary,#16a34a)'
  const stripedStyle = striped
    ? { backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0, rgba(255,255,255,.25) 10px, transparent 10px, transparent 20px)` }
    : undefined
  return (
    <div aria-label={label || 'progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} role="progressbar" className="h-2 bg-[var(--color-border,#e5e7eb)] rounded-lg">
      <div className="h-2 rounded-lg" style={{ width: `${p}%`, background: barColor, ...(stripedStyle||{}) }} />
    </div>
  )
}


