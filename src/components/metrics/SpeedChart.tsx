import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import HelpTip from '../Tooltip'

export default function SpeedChart({ data }: { data: Array<{ i: number; adj: number; ts?: Date }> }) {
  const lastIndex = data.length - 1
  const lastVal = lastIndex >= 0 ? data[lastIndex].adj : 0
  const prevVal = lastIndex > 0 ? data[lastIndex - 1].adj : lastVal
  const improving = lastVal >= prevVal
  let maxIndex = 0
  for (let i = 1; i < data.length; i++) if (data[i].adj > data[maxIndex].adj) maxIndex = i
  const maxVal = data.length ? data[maxIndex].adj : 0

  return (
    <div role="img" aria-label="綜合分數趨勢圖：線越高代表表現越好">
      <div className="text-[12px] text-[var(--color-muted,#6b7280)] mb-1 inline-flex items-center gap-1">
        綜合分數（正確速度）<HelpTip label="縱軸：綜合分數（越高越好）；橫軸：時間順序。綠線表示只計正確字的速度，綜合了速度與正確率。" />
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <XAxis dataKey="i" hide />
          <YAxis width={30} />
          <Tooltip labelFormatter={(i:number)=>{
            const d = (data[i] && data[i].ts) ? data[i].ts as Date : undefined
            return d ? d.toLocaleString() : `第 ${i+1} 筆`
          }} formatter={(v:number)=>[`綜合分數 ${Number(v).toFixed(2)}`, '']} />
          <Line type="monotone" dataKey="adj" stroke="#16a34a" dot={false} />
          {data.length > 0 && (
            <>
              <ReferenceDot x={data[maxIndex].i} y={maxVal} r={4} stroke="#14532d" fill="#16a34a" isFront label={{ position: 'top', value: `這裡最高 ${maxVal.toFixed(1)}` }} />
              <ReferenceDot x={data[lastIndex].i} y={lastVal} r={4} stroke="#1f2937" fill="#10b981" isFront label={{ position: 'top', value: `最近 ${lastVal.toFixed(1)} ${improving ? '↑' : '↓'}` }} />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}


