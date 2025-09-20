import { useEffect, useMemo, useRef } from 'react'
import stage1 from '../../assets/garden/seedling/seedling-stage1.svg?raw'
import stage2 from '../../assets/garden/seedling/seedling-stage2.svg?raw'
import stage3 from '../../assets/garden/seedling/seedling-stage3.svg?raw'
import stage4 from '../../assets/garden/seedling/seedling-stage4.svg?raw'
import stage5 from '../../assets/garden/seedling/seedling-stage5.svg?raw'
import './seedling.css'

export type SeedlingProps = { stage: 1|2|3|4|5; className?: string }

export default function Seedling({ stage, className }: SeedlingProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const svgStr = useMemo(() => ([stage1, stage2, stage3, stage4, stage5])[Math.min(4, Math.max(0, stage-1))], [stage])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = svgStr
    const svg = host.querySelector('svg') as SVGSVGElement | null
    if (!svg) return
    // 規範尺寸：移除內建寬高、以容器控制；確保等比縮放與不超框
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.display = 'block'
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    svg.classList.remove('boosted')
    if (prefersReduced) return
    // 掛上動畫 class（若節點存在則附加）
    const leaves = svg.querySelector('#leaves') as SVGElement | null
    const trunk = (svg.querySelector('#trunk') || svg.querySelector('#stem')) as SVGElement | null
    const glow = (svg.querySelector('#glow') || svg.querySelector('#lighting')) as SVGElement | null
    if (leaves) leaves.classList.add('wind')
    if (trunk) trunk.classList.add('wind-slow')
    if (glow) glow.classList.add('glow-pulse')
  }, [svgStr])

  return <div ref={hostRef} className={(className?className+' ':'') + 'seedling-host'} aria-hidden="true" />
}


