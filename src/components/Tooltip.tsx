import { useId, useState } from 'react'

type Props = {
  label: string
  children?: React.ReactNode
}

export default function Tooltip({ label, children = '？' }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span aria-describedby={id}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} tabIndex={0}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold cursor-help outline-none focus:ring-2 focus:ring-sky-300 ml-1 align-middle">
        {children}
      </span>
      {open && (
        <div role="tooltip" id={id}
          className="absolute z-10 mt-1 min-w-[180px] max-w-[260px] px-2 py-1 text-xs leading-5 rounded-md border border-[var(--color-border,#e5e7eb)] bg-white shadow-[0_2px_8px_rgba(0,0,0,.08)]" style={{ left: '50%', transform: 'translateX(-50%)' }}>
          {label}
        </div>
      )}
    </span>
  )
}


