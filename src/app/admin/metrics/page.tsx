'use client'

import { useState, useEffect, useCallback } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface ChannelCount {
  key: string
  label: string
  count: number
}

interface MetricBase {
  rate: number | null
  prevMonth: number | null
}

interface ScheduleInputRate extends MetricBase {
  completed: number
  total: number
}

interface ExternalHireRate extends MetricBase {
  channels: ChannelCount[]
  externalTotal: number
  scoutingTotal: number
}

interface CoachPoolManager {
  managerId: string
  managerName: string
  uniqueCoaches: number
  prevMonth: number | null
  changeRate: number | null
}

interface CoachPoolByManager {
  managers: CoachPoolManager[]
}

interface ScoutingResponseRate extends MetricBase {
  requested: number
  responded: number
}

interface SamsungScheduleItem {
  type: string
  total: number
  unvisited: number
  accessedOnly: number
  completed: number
  rate: number | null
}

interface DailyTrendPoint {
  date: string
  day: number
  scheduleEdits: number
  scoutingsCreated: number
  dsCompleted: number
  dxCompleted: number
}

interface MetricsData {
  yearMonth: string
  isCurrentMonth: boolean
  metrics: {
    scheduleInputRate: ScheduleInputRate
    externalHireRate: ExternalHireRate
    coachPoolByManager: CoachPoolByManager
    scoutingResponseRate: ScoutingResponseRate
    samsungSchedule: SamsungScheduleItem[]
  }
  dailyTrend: DailyTrendPoint[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatRate(rate: number | null): string {
  if (rate === null || rate === undefined) return 'N/A'
  return `${rate.toFixed(1)}%`
}

function getRecentMonths(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
  }
  return months
}

function getCurrentYearMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/* ------------------------------------------------------------------ */
/*  Delta badge                                                        */
/* ------------------------------------------------------------------ */
function DeltaBadge({ current, prev }: { current: number | null; prev: number | null }) {
  if (current === null || prev === null) {
    return <span className="text-sm text-gray-400">&mdash;</span>
  }
  const diff = +(current - prev).toFixed(1)
  if (diff > 0) {
    return <span className="text-sm text-green-600 font-medium">&#9650; +{diff}%p</span>
  }
  if (diff < 0) {
    return <span className="text-sm text-red-500 font-medium">&#9660; {diff}%p</span>
  }
  return <span className="text-sm text-gray-400">&mdash; 0%p</span>
}

/* ------------------------------------------------------------------ */
/*  Daily Trend Chart                                                  */
/* ------------------------------------------------------------------ */
function DailyChart({ data }: { data: DailyTrendPoint[] }) {
  if (!data.length) return null

  const padX = 40
  const padY = 20
  const padBottom = 32
  const w = 700
  const h = 220
  const plotW = w - padX * 2
  const plotH = h - padY - padBottom

  const maxVal = Math.max(...data.flatMap((d) => [d.scheduleEdits, d.scoutingsCreated]), 1)
  const barGroupW = plotW / data.length
  const barW = Math.max(barGroupW * 0.35, 2)
  const gap = Math.max(barGroupW * 0.05, 1)

  const yStep = maxVal <= 5 ? 1 : Math.ceil(maxVal / 4)
  const yTicks: number[] = []
  for (let v = 0; v <= maxVal; v += yStep) yTicks.push(v)
  if (yTicks[yTicks.length - 1] < maxVal) yTicks.push(maxVal)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-800">일별 추이</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-400" />
            <span className="text-xs text-gray-600">일정 입력</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-violet-400" />
            <span className="text-xs text-gray-600">섭외 발송</span>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 220 }}>
        {yTicks.map((t) => {
          const y = padY + plotH - (t / maxVal) * plotH
          return (
            <g key={t}>
              <line x1={padX} x2={w - padX} y1={y} y2={y} stroke="#E5E7EB" strokeWidth={1} />
              <text x={padX - 6} y={y + 4} textAnchor="end" className="text-[10px]" fill="#9CA3AF">
                {t}
              </text>
            </g>
          )
        })}
        {data.map((pt, i) => {
          const cx = padX + (i + 0.5) * barGroupW
          const schedH = maxVal > 0 ? (pt.scheduleEdits / maxVal) * plotH : 0
          const scoutH = maxVal > 0 ? (pt.scoutingsCreated / maxVal) * plotH : 0
          return (
            <g key={pt.date}>
              <rect
                x={cx - barW - gap / 2}
                y={padY + plotH - schedH}
                width={barW}
                height={Math.max(schedH, 0)}
                fill="#60A5FA"
                rx={1}
              />
              <rect
                x={cx + gap / 2}
                y={padY + plotH - scoutH}
                width={barW}
                height={Math.max(scoutH, 0)}
                fill="#A78BFA"
                rx={1}
              />
              {(pt.day === 1 || pt.day % 5 === 0 || pt.day === data.length) && (
                <text x={cx} y={h - 8} textAnchor="middle" className="text-[10px]" fill="#9CA3AF">
                  {pt.day}일
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Samsung Daily Trend Line Chart                                     */
/* ------------------------------------------------------------------ */
function SamsungDailyChart({
  data,
  samsung,
}: {
  data: DailyTrendPoint[]
  samsung: SamsungScheduleItem[]
}) {
  if (!data.length || !samsung.length) return null

  const dsTotal = samsung.find((s) => s.type === '삼전 DS')?.total ?? 0
  const dxTotal = samsung.find((s) => s.type === '삼전 DX')?.total ?? 0
  const maxTotal = Math.max(dsTotal, dxTotal, 1)

  const padX = 40
  const padY = 16
  const padBottom = 28
  const w = 700
  const h = 180
  const plotW = w - padX * 2
  const plotH = h - padY - padBottom

  const yStep = maxTotal <= 5 ? 1 : Math.ceil(maxTotal / 4)
  const yTicks: number[] = []
  for (let v = 0; v <= maxTotal; v += yStep) yTicks.push(v)
  if (yTicks[yTicks.length - 1] < maxTotal) yTicks.push(maxTotal)

  function toPoints(key: 'dsCompleted' | 'dxCompleted') {
    return data
      .map((pt, i) => {
        const x = padX + ((i + 0.5) / data.length) * plotW
        const y = padY + plotH - (pt[key] / maxTotal) * plotH
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-800">삼전 일정 입력 추이 (누적)</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-amber-500" />
            <span className="text-xs text-gray-600">DS ({dsTotal}명)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-blue-500" />
            <span className="text-xs text-gray-600">DX ({dxTotal}명)</span>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 180 }}>
        {yTicks.map((t) => {
          const y = padY + plotH - (t / maxTotal) * plotH
          return (
            <g key={t}>
              <line x1={padX} x2={w - padX} y1={y} y2={y} stroke="#E5E7EB" strokeWidth={1} />
              <text x={padX - 6} y={y + 4} textAnchor="end" className="text-[10px]" fill="#9CA3AF">
                {t}
              </text>
            </g>
          )
        })}
        {/* DS 목표선 */}
        {dsTotal > 0 && (
          <line
            x1={padX} x2={w - padX}
            y1={padY + plotH - (dsTotal / maxTotal) * plotH}
            y2={padY + plotH - (dsTotal / maxTotal) * plotH}
            stroke="#F59E0B" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
          />
        )}
        {/* DX 목표선 */}
        {dxTotal > 0 && dxTotal !== dsTotal && (
          <line
            x1={padX} x2={w - padX}
            y1={padY + plotH - (dxTotal / maxTotal) * plotH}
            y2={padY + plotH - (dxTotal / maxTotal) * plotH}
            stroke="#3B82F6" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
          />
        )}
        {/* DS line */}
        <polyline points={toPoints('dsCompleted')} fill="none" stroke="#F59E0B" strokeWidth={2} />
        {/* DX line */}
        <polyline points={toPoints('dxCompleted')} fill="none" stroke="#3B82F6" strokeWidth={2} />
        {/* X축 라벨 */}
        {data.map((pt, i) => {
          if (pt.day === 1 || pt.day % 5 === 0 || pt.day === data.length) {
            const x = padX + ((i + 0.5) / data.length) * plotW
            return (
              <text key={pt.day} x={x} y={h - 6} textAnchor="middle" className="text-[10px]" fill="#9CA3AF">
                {pt.day}일
              </text>
            )
          }
          return null
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  External Hire Input Form                                           */
/* ------------------------------------------------------------------ */
function ExternalHireForm({
  channels,
  yearMonth,
  onSaved,
}: {
  channels: ChannelCount[]
  yearMonth: string
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const init: Record<string, number> = {}
    for (const ch of channels) {
      init[ch.key] = ch.count
    }
    setValues(init)
  }, [channels])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/metrics/external-hire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearMonth, channels: values }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setOpen(false)
      onSaved()
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
      >
        수동 입력
      </button>
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="grid grid-cols-2 gap-2">
        {channels.map((ch) => (
          <div key={ch.key} className="flex items-center gap-1.5">
            <label className="text-xs text-gray-600 w-16 shrink-0">{ch.label}</label>
            <input
              type="number"
              min={0}
              value={values[ch.key] ?? 0}
              onChange={(e) => setValues((v) => ({ ...v, [ch.key]: Number(e.target.value) || 0 }))}
              className="border border-gray-300 rounded px-2 py-1 w-20 text-right text-sm"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 hover:text-gray-700 px-2"
        >
          취소
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
export default function AdminMetricsPage() {
  const recentMonths = getRecentMonths(12)
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth())
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async (ym: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/metrics/summary?yearMonth=${ym}`)
      if (!res.ok) throw new Error('데이터를 불러올 수 없습니다')
      const json: MetricsData = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message || '데이터 로드 실패')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(yearMonth)
  }, [yearMonth, fetchData])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">지표 대시보드</h1>
        <select
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {recentMonths.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Card A: Schedule Input Rate (highlighted) */}
            <div className="bg-blue-50/30 rounded-lg shadow-sm border border-blue-200 p-5 relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 rounded-t-lg" />
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-700">일정 입력률</h3>
                {data.isCurrentMonth && (
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                    진행 중
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {formatRate(data.metrics.scheduleInputRate.rate)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data.metrics.scheduleInputRate.completed} / {data.metrics.scheduleInputRate.total} 명
              </p>
              <div className="mt-2">
                <DeltaBadge
                  current={data.metrics.scheduleInputRate.rate}
                  prev={data.metrics.scheduleInputRate.prevMonth}
                />
              </div>
            </div>

            {/* Card A-2: Samsung DS/DX Schedule Rate */}
            {data.metrics.samsungSchedule.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-medium text-gray-700 mb-3">삼전 일정 입력 현황</h3>
                <div className="space-y-3">
                  {data.metrics.samsungSchedule.map((item) => (
                    <div key={item.type}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-800">{item.type}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {item.rate !== null ? `${item.rate}%` : 'N/A'}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${item.rate ?? 0}%` }}
                        />
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span className="text-green-600">완료 {item.completed}</span>
                        <span className="text-amber-600">접속만 {item.accessedOnly}</span>
                        <span className="text-red-500">미확인 {item.unvisited}</span>
                        <span className="text-gray-400 ml-auto">{item.total}명</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Card B: External Hire Rate */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-1">외부 구인 비율</h3>
              <p className="text-3xl font-bold text-gray-900">
                {formatRate(data.metrics.externalHireRate.rate)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data.metrics.externalHireRate.externalTotal} / {data.metrics.externalHireRate.scoutingTotal} 건
              </p>
              <div className="mt-2">
                <DeltaBadge
                  current={data.metrics.externalHireRate.rate}
                  prev={data.metrics.externalHireRate.prevMonth}
                />
              </div>
              {data.metrics.externalHireRate.channels.length > 0 && (
                <div className="mt-3 space-y-0.5">
                  {data.metrics.externalHireRate.channels.map((ch) => (
                    <p key={ch.key} className="text-xs text-gray-500">
                      {ch.label}: {ch.count}건
                    </p>
                  ))}
                </div>
              )}
              <ExternalHireForm
                channels={data.metrics.externalHireRate.channels}
                yearMonth={yearMonth}
                onSaved={() => fetchData(yearMonth)}
              />
            </div>

            {/* Card C: Coach Pool by Manager */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">매니저당 코치 pool</h3>
              <div className="space-y-2">
                {data.metrics.coachPoolByManager.managers.map((mgr) => (
                  <div key={mgr.managerId} className="flex items-center justify-between">
                    <span className="text-sm text-gray-800">{mgr.managerName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{mgr.uniqueCoaches}명</span>
                      {mgr.changeRate !== null && mgr.prevMonth !== null && (
                        <span
                          className={`text-xs ${
                            mgr.uniqueCoaches - mgr.prevMonth > 0
                              ? 'text-green-600'
                              : mgr.uniqueCoaches - mgr.prevMonth < 0
                                ? 'text-red-500'
                                : 'text-gray-400'
                          }`}
                        >
                          {mgr.uniqueCoaches - mgr.prevMonth > 0 ? '+' : ''}
                          {mgr.uniqueCoaches - mgr.prevMonth}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {data.metrics.coachPoolByManager.managers.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">평균</span>
                  <span className="text-sm font-semibold text-gray-700">
                    {(
                      data.metrics.coachPoolByManager.managers.reduce(
                        (sum, m) => sum + m.uniqueCoaches,
                        0
                      ) / data.metrics.coachPoolByManager.managers.length
                    ).toFixed(1)}
                    명
                  </span>
                </div>
              )}
            </div>

            {/* Card D: Scouting Response Rate */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-1">섭외 응답률</h3>
              <p className="text-3xl font-bold text-gray-900">
                {formatRate(data.metrics.scoutingResponseRate.rate)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data.metrics.scoutingResponseRate.responded} / {data.metrics.scoutingResponseRate.requested} 건
              </p>
              <div className="mt-2">
                <DeltaBadge
                  current={data.metrics.scoutingResponseRate.rate}
                  prev={data.metrics.scoutingResponseRate.prevMonth}
                />
              </div>
            </div>
          </div>

          {/* Daily Trend Charts */}
          <div className="space-y-4">
            {data.dailyTrend.length > 0 && <DailyChart data={data.dailyTrend} />}
            {data.dailyTrend.length > 0 && data.metrics.samsungSchedule.length > 0 && (
              <SamsungDailyChart data={data.dailyTrend} samsung={data.metrics.samsungSchedule} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
