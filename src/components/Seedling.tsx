import { useEffect, useId, useRef } from 'react'

type Props = {
  className?: string
  stage?: 1|2|3|4|5
  // 0~1 加成強度，越高葉子越翠綠
  leafBoost?: number
}

// 素描風格 SVG 樹苗（高對比、兒童友善），載入時做輕量 scale+fade 動畫
export default function Seedling({ className, stage = 1, leafBoost = 0 }: Props) {
  const ref = useRef<SVGSVGElement | null>(null)
  const uid = useId()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'scale(0.96)'
    el.style.transition = 'opacity 420ms ease, transform 480ms ease'
    requestAnimationFrame(() => {
      el.style.opacity = '1'
      el.style.transform = 'scale(1)'
    })
  }, [])
  const scale = stage>=5?1.2: stage>=3?1.0: 0.88
  // 計算葉片顏色：基準綠 -> 更亮更飽和的綠
  function mix(c1: string, c2: string, t: number) {
    const n1 = c1.replace('#','')
    const n2 = c2.replace('#','')
    const r1 = parseInt(n1.substring(0,2),16), g1 = parseInt(n1.substring(2,4),16), b1 = parseInt(n1.substring(4,6),16)
    const r2 = parseInt(n2.substring(0,2),16), g2 = parseInt(n2.substring(2,4),16), b2 = parseInt(n2.substring(4,6),16)
    const r = Math.round(r1 + (r2-r1)*t)
    const g = Math.round(g1 + (g2-g1)*t)
    const b = Math.round(b1 + (b2-b1)*t)
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
  }
  const t = Math.max(0, Math.min(1, leafBoost))
  const leafTop = mix('#16a34a', '#22c55e', t)     // 綠 -> 更亮綠
  const leafBottom = mix('#065f46', '#059669', t)  // 深綠 -> 清亮深綠
  return (
    <svg ref={ref} viewBox="0 0 240 200" aria-hidden="true" className={className} role="img">
      <title>Seedling</title>
      <desc>A friendly seedling illustration for children</desc>
      <defs>
        <filter id="sketch" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" result="noise"/>
          <feColorMatrix type="saturate" values="0"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
        <linearGradient id={`leafGrad-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={leafTop} />
          <stop offset="100%" stopColor={leafBottom} />
        </linearGradient>
        <linearGradient id="stemGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <radialGradient id="bgHalo" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ecfeff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform={`scale(${scale}) translate(${(1-scale)*120}, ${(1-scale)*100})`}>
        <circle cx="120" cy="100" r="92" fill="url(#bgHalo)" />
        {/* ground shadow */}
        <ellipse cx="120" cy="150" rx="54" ry="14" fill="#94a3b8" opacity=".18" />
        {/* stem/trunk: 階段越高越粗、越長 */}
        {stage < 4 && (
          <path d="M122 148 C122 126 116 110 114 92 C114 78 124 68 138 64" fill="none" stroke="url(#stemGrad)" strokeWidth="6" strokeLinecap="round" filter="url(#sketch)" />
        )}
        {stage >= 4 && (
          <>
            <path d="M122 150 C122 120 120 98 122 78 C122 62 128 56 148 52" fill="none" stroke="url(#stemGrad)" strokeWidth="7" strokeLinecap="round" filter="url(#sketch)" />
            {/* small branch */}
            <path d="M132 105 C144 100 154 94 162 86" fill="none" stroke="url(#stemGrad)" strokeWidth="4" strokeLinecap="round" filter="url(#sketch)" />
          </>
        )}
        {/* base leaves */}
        <path d="M98 90 C72 86 56 72 54 58 C78 58 100 68 104 84 C102 88 100 90 98 90 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
        <path d="M140 84 C166 82 188 70 192 56 C170 54 148 60 136 74 C136 78 138 82 140 84 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
        {/* extra leaves by stage */}
        {stage >= 2 && (
          <>
            <path d="M106 96 C90 96 80 92 76 86 C90 86 100 90 106 94 C106 95 106 95.5 106 96 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
            <path d="M136 94 C154 94 166 90 170 84 C156 84 144 88 138 92 C138 93 137.8 93.5 136 94 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
          </>
        )}
        {stage >= 3 && (
          <>
            <path d="M112 76 C96 74 86 66 84 60 C98 60 110 64 114 70 C114 72 113 74 112 76 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
            <path d="M148 72 C164 70 178 62 180 56 C168 56 154 60 148 66 C148 68 148 70 148 72 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
          </>
        )}
        {stage >= 4 && (
          <>
            <path d="M160 96 C178 94 192 86 196 80 C182 80 168 86 160 92 C160 94 160 95 160 96 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
            <path d="M126 110 C112 110 102 106 98 100 C110 100 120 104 126 108 C126 109 126 109.5 126 110 Z" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
          </>
        )}
        {stage >= 5 && (
          <>
            {/* simple canopy */}
            <g opacity="0.9">
              <ellipse cx="160" cy="70" rx="34" ry="22" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
              <ellipse cx="128" cy="58" rx="30" ry="20" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
              <ellipse cx="98" cy="72" rx="28" ry="18" fill={`url(#leafGrad-${uid})`} filter="url(#sketch)" />
            </g>
          </>
        )}
      </g>
    </svg>
  )
}


