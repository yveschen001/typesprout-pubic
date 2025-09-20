import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import HelpTip from '../Tooltip'

export default function AccuracyChart({ data }: { data: Array<{ i: number; acc: number; ts?: Date }> }) {
  const lastIndex = data.length - 1
  const lastVal = lastIndex >= 0 ? data[lastIndex].acc : 0
  const prevVal = lastIndex > 0 ? data[lastIndex - 1].acc : lastVal
  const improving = lastVal >= prevVal
  let maxIndex = 0
  for (let i = 1; i < data.length; i++) if (data[i].acc > data[maxIndex].acc) maxIndex = i
  const maxVal = data.length ? data[maxIndex].acc : 0

  return (
    <div role="img" aria-label="正確率趨勢圖：線越高代表越準">
      <div className="text-[12px] text-[var(--color-muted,#6b7280)] mb-1 inline-flex items-center gap-1">
        正確率<HelpTip label="縱軸：正確率（越高代表越準）；橫軸：時間順序。藍線顯示每次測驗的正確率變化。" />
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <XAxis dataKey="i" hide />
          <YAxis width={30} domain={[0,1]} tickFormatter={(v)=>`${Math.round(v*100)}%`} />
          <Tooltip labelFormatter={(i:number)=>{
            const d = (data[i] && data[i].ts) ? data[i].ts as Date : undefined
            return d ? d.toLocaleString() : `第 ${i+1} 筆`
          }} formatter={(v:number)=>`${Math.round(v*100)}%`} />
          <Line type="monotone" dataKey="acc" stroke="#0ea5e9" dot={false} />
          {data.length > 0 && (
            <>
              <ReferenceDot x={data[maxIndex].i} y={maxVal} r={4} stroke="#0c4a6e" fill="#0ea5e9" isFront label={{ position: 'top', value: `這裡最高 ${(maxVal*100).toFixed(0)}%` }} />
              <ReferenceDot x={data[lastIndex].i} y={lastVal} r={4} stroke="#1f2937" fill="#38bdf8" isFront label={{ position: 'top', value: `最近 ${(lastVal*100).toFixed(0)}% ${improving ? '↑' : '↓'}` }} />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}


