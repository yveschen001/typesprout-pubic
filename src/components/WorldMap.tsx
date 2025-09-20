import { memo, useEffect, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps'
import { geoCentroid, geoPath } from 'd3-geo'

type CountryCounts = Record<string, number>

export type WorldMapProps = {
  counts: CountryCounts
  focusIso2?: string
}

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

function colorFor(count: number): string {
  if (count <= 0) return '#e5e7eb'
  if (count < 5) return '#c7e9c0'
  if (count < 20) return '#74c476'
  return '#238b45'
}

function iso2Of(props: Record<string, any>): string | undefined {
  const a = props.ISO_A2_EH || props.ISO_A2 || props.iso_a2 || props.iso2 || props.code
  if (typeof a === 'string' && a.length === 2) return a.toUpperCase()
  return undefined
}

const fallbackCenters: Record<string, [number, number]> = {
  TW: [121, 23.5],
  US: [-98, 39],
  JP: [138, 36],
  CN: [103, 35],
  HK: [114.1, 22.4],
  SG: [103.8, 1.35],
  KR: [128, 36],
  GB: [-1.5, 52],
  FR: [2.2, 46.2],
  DE: [10.4, 51],
}

export default memo(function WorldMap({ counts, focusIso2 }: WorldMapProps) {
  const [zoom, setZoom] = useState(1.8)
  const [center, setCenter] = useState<[number, number]>([0, 20])
  const [focusCenter, setFocusCenter] = useState<[number, number] | null>(null)
  const geosRef = useRef<any[]>([])
  function zoomIn() { setZoom((z) => Math.min(5, z + 0.4)) }
  function zoomOut() { setZoom((z) => Math.max(1, z - 0.4)) }

  function adjustToFocus(){
    const geographies = geosRef.current
    if (!geographies || geographies.length === 0 || !focusIso2) return
    const target = geographies.find((g: any) => iso2Of(g.properties as any) === focusIso2)
    if (target) {
      const c = geoCentroid(target)
      setCenter([c[0], c[1]])
      try{
        const path = geoPath()
        // @ts-ignore
        const bounds = path.bounds(target)
        const dx = Math.abs(bounds[1][0] - bounds[0][0])
        const dy = Math.abs(bounds[1][1] - bounds[0][1])
        const maxDim = Math.max(dx, dy)
        const k = Math.min(5, Math.max(1.6, 180 / (maxDim || 1)))
        setZoom(k)
      }catch{ setZoom(2.4) }
      setFocusCenter([c[0], c[1]])
    } else {
      const fb = fallbackCenters[focusIso2]
      if (fb){ setCenter(fb); setZoom(2.4); setFocusCenter(fb) }
    }
  }

  // After geographies are available and focusIso2 changes, adjust view.
  // 當 focusIso2 變化時，等待地理資料可用後再對焦
  useEffect(() => {
    if (!focusIso2) return
    let tries = 0
    const t = setInterval(() => { tries++; adjustToFocus(); if (geosRef.current.length>0 || tries>20) clearInterval(t) }, 100)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIso2])
  return (
    <div className="w-full h-[280px] relative">
      <ComposableMap projectionConfig={{ scale: 135 }} width={800} height={400} style={{ width: '100%', height: '100%' }}>
        <ZoomableGroup zoom={zoom} center={center} onMoveEnd={(pos) => { setZoom(pos.zoom); setCenter(pos.coordinates as [number, number]) }}>
          <Geographies geography={geoUrl}>
            {({ geographies }) => {
              // save geographies for effect-based viewport adjustment
              geosRef.current = geographies
              return geographies.map((geo) => {
                const code = iso2Of(geo.properties as any) as string | undefined
                const c = counts[code] || 0
                const isFocus = code === focusIso2
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{ default: { outline: 'none' }, hover: { outline: 'none' }, pressed: { outline: 'none' } }}
                    fill={colorFor(c)}
                    stroke={isFocus ? '#ef4444' : '#fff'}
                    strokeWidth={isFocus ? 0.8 : 0.3}
                  />
                )
              })
            }}
          </Geographies>
          {focusCenter && (
            <>
              <Marker coordinates={focusCenter}>
                <circle r={4.8} fill="#ef4444" stroke="#fff" strokeWidth={1.2} />
              </Marker>
              <Marker coordinates={[focusCenter[0]+2, focusCenter[1]-1]}>
                <text textAnchor="start" style={{ fontSize: 10, fill: '#111827', fontWeight: 600 }}>{focusIso2}</text>
              </Marker>
            </>
          )}
        </ZoomableGroup>
      </ComposableMap>
      {/* 圖例 */}
      <div className="absolute left-2 top-2 bg-white/85 rounded-md border border-[var(--color-border,#e5e7eb)] text-[11px] px-2 py-1">
        <div className="mb-1">Players</div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded" style={{ background: '#c7e9c0' }} /> <span>1–4</span>
          <span className="inline-block w-4 h-3 rounded ml-2" style={{ background: '#74c476' }} /> <span>5–19</span>
          <span className="inline-block w-4 h-3 rounded ml-2" style={{ background: '#238b45' }} /> <span>20+</span>
        </div>
      </div>
      {/* 控制與提示 */}
      <div className="absolute right-2 top-2 flex flex-col gap-2">
        <button aria-label="Zoom in" onClick={zoomIn} className="w-8 h-8 rounded-md border border-[var(--color-border,#e5e7eb)] bg-white text-sm">+</button>
        <button aria-label="Zoom out" onClick={zoomOut} className="w-8 h-8 rounded-md border border-[var(--color-border,#e5e7eb)] bg-white text-sm">−</button>
      </div>
      <div className="absolute left-2 bottom-2 text-xs text-[var(--color-muted,#6b7280)] bg-white/80 rounded px-2 py-0.5">滾輪縮放 · 拖曳移動</div>
    </div>
  )
})


