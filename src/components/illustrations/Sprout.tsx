// src/components/illustrations/Sprout.tsx
// 稳定開源 sprout 基底（簡化版）+ 生長動畫

type Props = { className?: string }

export default function Sprout({ className = '' }: Props) {
  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 420 240" role="img" xmlns="http://www.w3.org/2000/svg" className="h-auto w-full select-none">
        <defs>
          <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
          <linearGradient id="pot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e5e7eb" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <filter id="blur1"><feGaussianBlur stdDeviation="1.5" /></filter>
        </defs>

        {/* shadow */}
        <ellipse cx="210" cy="150" rx="150" ry="70" fill="#000" opacity="0.08" filter="url(#blur1)" />

        {/* pot */}
        <g transform="translate(110,140)">
          <ellipse cx="100" cy="0" rx="100" ry="14" fill="#cbd5e1" />
          <path d="M10 0h180c0 24-30 44-90 44S10 24 10 0Z" fill="url(#pot)" />
          <ellipse cx="100" cy="-4" rx="82" ry="10" fill="#94a3b8" />
          <ellipse cx="100" cy="-6" rx="74" ry="8" fill="#6b7280" />
        </g>

        {/* stem (stroke-dash growth for stability) */}
        <g transform="translate(210,128)">
          <path d="M0 0 C 0 -10 0 -20 6 -30 C 12 -38 22 -46 28 -52" fill="none" stroke="#22c55e" strokeWidth="6" strokeLinecap="round" strokeDasharray="120" strokeDashoffset="120" className="stemGrow" />
        </g>

        {/* leaves */}
        <g transform="translate(210,92)">
          <path d="M0 0 C -28 -2 -56 10 -74 24 C -56 44 -24 48 0 44 C 8 26 4 12 0 0 Z" fill="url(#leaf)" className="leafLeft" />
          <path d="M2 -2 C 30 -4 58 8 76 22 C 58 42 26 48 4 44 C -2 26 0 10 2 -2 Z" fill="url(#leaf)" className="leafRight" />
        </g>

        <style>
          {`
            @keyframes dash { to { stroke-dashoffset: 0 } }
            @keyframes unfoldL { 0% { transform: translate(-2px,6px) rotate(-10deg) scale(.7); opacity:0 } 60% { opacity:1 } 100% { transform: translate(0,0) rotate(0) scale(1) } }
            @keyframes unfoldR { 0% { transform: translate(2px,6px) rotate(10deg) scale(.7); opacity:0 } 60% { opacity:1 } 100% { transform: translate(0,0) rotate(0) scale(1) } }
            .stemGrow { animation: dash 1.2s ease-out 0.2s forwards }
            .leafLeft { transform-origin: 0px 10px; animation: unfoldL .9s ease-out 1.0s forwards }
            .leafRight { transform-origin: 2px 8px; animation: unfoldR .9s ease-out 1.1s forwards }
          `}
        </style>
      </svg>
    </div>
  )
}


