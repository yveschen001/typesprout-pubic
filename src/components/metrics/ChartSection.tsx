import type { PropsWithChildren } from 'react'

type ChartSectionProps = PropsWithChildren<{
  topText?: string
  bottomText?: string
  className?: string
}>

export default function ChartSection({ topText, bottomText, className, children }: ChartSectionProps) {
  const top = topText || '上：綜合分數趨勢；下：正確率趨勢。先把正確率拉高，再慢慢變快。'
  return (
    <div className={(className?className+' ':'') + 'grow min-w-[280px]'}>
      <div className="mb-1 text-sm text-[var(--color-muted,#6b7280)]">{top}</div>
      {children}
      {bottomText && <div className="mt-2 text-sm text-[var(--color-muted,#6b7280)]">{bottomText}</div>}
    </div>
  )
}


