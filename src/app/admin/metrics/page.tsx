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

interface ExternalHireHistory {
  months: string[]
  channels: { key: string; label: string; values: (number | null)[] }[]
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
  inputRate: number | null
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
    externalHireHistory: ExternalHireHistory
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
/*  Daily Heatmap Table                                                */
/* ------------------------------------------------------------------ */
interface HeatmapRow {
  label: string
  hue: string
  values: number[]
  suffix?: string
}

function DailyHeatmap({ data: rawData, samsung }: { data: DailyTrendPoint[]; samsung?: SamsungScheduleItem[] }) {
  // 링크 발송 전 날짜 제외 (3일부터)
  const data = rawData.filter((d) => d.day >= 3)
  if (!data.length) return null

  const rows: HeatmapRow[] = [
    { label: '전체 입력', hue: '#3B82F6', values: data.map((d) => d.scheduleEdits), suffix: `합 ${data.reduce((s, d) => s + d.scheduleEdits, 0)}` },
  ]

  if (samsung && samsung.length > 0) {
    const dsItem = samsung.find((s) => s.type === '삼전 DS')
    const dxItem = samsung.find((s) => s.type === '삼전 DX')
    if (dsItem) {
      const dsDaily = data.map((d, i) => d.dsCompleted - (i > 0 ? data[i - 1].dsCompleted : 0))
      rows.push({ label: 'DS 입력', hue: '#F59E0B', values: dsDaily, suffix: `${data[data.length - 1]?.dsCompleted ?? 0}/${dsItem.total}` })
    }
    if (dxItem) {
      const dxDaily = data.map((d, i) => d.dxCompleted - (i > 0 ? data[i - 1].dxCompleted : 0))
      rows.push({ label: 'DX 입력', hue: '#0EA5E9', values: dxDaily, suffix: `${data[data.length - 1]?.dxCompleted ?? 0}/${dxItem.total}` })
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-base font-semibold text-gray-800 mb-3">일별 입력수 추이</h3>
      <div className="overflow-x-auto">
        <table className="text-[11px]">
          <thead>
            <tr>
              <th className="text-left py-1 pr-2 text-gray-500 font-medium sticky left-0 bg-white z-10 min-w-[72px]" />
              {data.map((pt) => (
                <th key={pt.day} className="text-center py-1 px-[3px] text-gray-400 font-normal min-w-[22px]">
                  {pt.day}
                </th>
              ))}
              <th className="text-right py-1 pl-2 text-gray-500 font-medium min-w-[40px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const max = Math.max(...row.values, 1)
              return (
                <tr key={row.label}>
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap sticky left-0 bg-white z-10" style={{ color: row.hue }}>{row.label}</td>
                  {row.values.map((v, i) => (
                    <td
                      key={i}
                      className="text-center py-1.5 px-[3px]"
                      style={v > 0 ? { backgroundColor: row.hue + String(Math.min(Math.round(15 + (v / max) * 70), 85)).padStart(2, '0') } : undefined}
                    >
                      <span className={v > 0 ? 'text-gray-800 font-medium' : 'text-gray-300'}>{v}</span>
                    </td>
                  ))}
                  <td className="text-right py-1.5 pl-2 font-semibold text-gray-600 whitespace-nowrap">{row.suffix}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
  const yearMonth = getCurrentYearMonth()
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
        <span className="text-sm text-gray-500">{yearMonth}</span>
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

            {/* Card: Daily Heatmap (spans 2 cols) */}
            {data.dailyTrend.length > 0 && (
              <div className="lg:col-span-2">
                <DailyHeatmap data={data.dailyTrend} samsung={data.metrics.samsungSchedule} />
              </div>
            )}
          </div>

          {/* Bottom cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card B: External Hire — monthly trend */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">외부 채널 모집 현황</h3>
              {data.metrics.externalHireHistory.months.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1.5 pr-2 text-gray-500 font-medium">채널</th>
                        {data.metrics.externalHireHistory.months.map((m) => (
                          <th key={m} className={`text-right py-1.5 px-1.5 font-medium ${m === yearMonth ? 'text-blue-600' : 'text-gray-500'}`}>
                            {parseInt(m.split('-')[1])}월
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.metrics.externalHireHistory.channels.map((ch) => (
                        <tr key={ch.key} className="border-b border-gray-50">
                          <td className="py-1.5 pr-2 text-gray-700">{ch.label}</td>
                          {ch.values.map((v, i) => (
                            <td key={i} className={`text-right py-1.5 px-1.5 ${data.metrics.externalHireHistory.months[i] === yearMonth ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                              {v !== null ? v : <span className="text-gray-300">-</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t border-gray-200">
                        <td className="py-1.5 pr-2 text-gray-700 font-medium">합계</td>
                        {data.metrics.externalHireHistory.months.map((m, mi) => {
                          const vals = data.metrics.externalHireHistory.channels.map((ch) => ch.values[mi])
                          const hasAny = vals.some((v) => v !== null)
                          const sum = hasAny ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null
                          return (
                            <td key={m} className={`text-right py-1.5 px-1.5 font-semibold ${m === yearMonth ? 'text-blue-600' : 'text-gray-700'}`}>
                              {sum !== null ? sum : <span className="text-gray-300">-</span>}
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <ExternalHireForm
                channels={data.metrics.externalHireRate.channels}
                yearMonth={yearMonth}
                onSaved={() => fetchData(yearMonth)}
              />
            </div>

            {/* Card C: Coach Pool Average */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-1">매니저당 평균 코치 pool</h3>
              {data.metrics.coachPoolByManager.managers.length > 0 ? (
                <>
                  <p className="text-3xl font-bold text-gray-900">
                    {(
                      data.metrics.coachPoolByManager.managers.reduce(
                        (sum, m) => sum + m.uniqueCoaches,
                        0
                      ) / data.metrics.coachPoolByManager.managers.length
                    ).toFixed(1)}
                    <span className="text-lg font-medium text-gray-500 ml-0.5">명</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {data.metrics.coachPoolByManager.managers.length}명 매니저 · 총 {data.metrics.coachPoolByManager.managers.reduce((s, m) => s + m.uniqueCoaches, 0)}명 코치
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400 mt-2">데이터 없음</p>
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
        </>
      )}
    </div>
  )
}
