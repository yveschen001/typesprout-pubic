import React from 'react'

type Variant = 'primary' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const sizeStyle: Record<Size, React.CSSProperties> = {
  sm: { height: 36, padding: '0 12px', fontSize: 14, borderRadius: 8 },
  md: { height: 44, padding: '0 16px', fontSize: 16, borderRadius: 12 },
  lg: { height: 52, padding: '0 20px', fontSize: 18, borderRadius: 16 },
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled,
  className,
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)',
    ...sizeStyle[size],
  }
  // 無障礙對比（AA 4.5:1）- 採用略深綠色底，維持高彩度
  const primary: React.CSSProperties = { background: '#15803d', color: '#fff', fontWeight: 600 }
  const outline: React.CSSProperties = { background: '#fff', color: '#15803d', borderColor: '#15803d' }

  return (
    <button
      {...rest}
      className={(className ? className + ' ' : '') + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-[12px] hover:brightness-110 active:brightness-95'}
      style={{ ...base, ...(variant === 'primary' ? primary : outline), ...(style || {}) }}
    >
      {children}
    </button>
  )
}


