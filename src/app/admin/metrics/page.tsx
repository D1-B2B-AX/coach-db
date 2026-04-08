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
    scheduleProvision: {
      sentCount: number
      samsungCount: number
      afterCount: number
      nonSamsungCompleted: number
      beforeRate: number | null
      afterRate: number | null
    }
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
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */
const CARD = 'bg-white rounded-lg border border-gray-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6'

/* ------------------------------------------------------------------ */
/*  Skeleton helpers                                                   */
/* ------------------------------------------------------------------ */
function Bone({ className }: { className?: string }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className ?? ''}`} />
}

/* ------------------------------------------------------------------ */
/*  Zone-structured Skeleton Loader                                    */
/* ------------------------------------------------------------------ */
function PageSkeleton() {
  return (
    <>
      {/* Zone 2 Skeleton: Samsung full-width card */}
      <div className={`${CARD} mt-6`}>
        <Bone className="h-4 w-36 mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <Bone className="h-4 w-20 mb-3" />
            <Bone className="h-2 w-full mb-3 rounded-full" />
            <Bone className="h-3 w-40" />
          </div>
          <div>
            <Bone className="h-4 w-20 mb-3" />
            <Bone className="h-2 w-full mb-3 rounded-full" />
            <Bone className="h-3 w-40" />
          </div>
        </div>
      </div>

      {/* Zone 3 Skeleton: Heatmap full-width card */}
      <div className={`${CARD} mt-6`}>
        <Bone className="h-4 w-28 mb-4" />
        <div className="space-y-2.5">
          <Bone className="h-5 w-full" />
          <Bone className="h-5 w-full" />
          <Bone className="h-5 w-[85%]" />
        </div>
      </div>

      {/* Zone 4 Skeleton: section label + 3-col grid */}
      <div className="mt-10">
        <Bone className="h-3 w-16 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className={CARD}>
            <Bone className="h-4 w-28 mb-4" />
            <Bone className="h-3 w-full mb-2" />
            <Bone className="h-3 w-full mb-2" />
            <Bone className="h-3 w-full mb-2" />
            <Bone className="h-3 w-3/4" />
          </div>
          <div className={CARD}>
            <Bone className="h-4 w-28 mb-3" />
            <Bone className="h-8 w-20 mb-2" />
            <Bone className="h-3 w-24" />
          </div>
          <div className={CARD}>
            <Bone className="h-4 w-28 mb-3" />
            <Bone className="h-8 w-20 mb-2" />
            <Bone className="h-3 w-24" />
          </div>
        </div>
      </div>
    </>
  )
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
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-gray-800 mb-4">일별 입력수 추이</h3>
      <div className="overflow-x-auto -mx-2">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left py-1.5 pr-3 text-gray-500 font-medium sticky left-0 bg-white z-10 min-w-[76px]" />
              {data.map((pt) => (
                <th key={pt.day} className="text-center py-1.5 px-1 text-gray-400 font-normal w-[30px] min-w-[30px]">
                  {pt.day}
                </th>
              ))}
              <th className="text-right py-1.5 pl-3 text-gray-500 font-medium min-w-[44px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const max = Math.max(...row.values, 1)
              return (
                <tr key={row.label}>
                  <td className="py-2 pr-3 font-medium whitespace-nowrap sticky left-0 bg-white z-10 text-xs" style={{ color: row.hue }}>{row.label}</td>
                  {row.values.map((v, i) => (
                    <td
                      key={i}
                      className="text-center px-1 h-[30px] w-[30px] min-w-[30px] rounded-sm"
                      style={v > 0 ? { backgroundColor: row.hue + String(Math.min(Math.round(15 + (v / max) * 70), 85)).padStart(2, '0') } : undefined}
                    >
                      <span className={v > 0 ? 'text-gray-800 font-medium' : 'text-gray-300'}>{v}</span>
                    </td>
                  ))}
                  <td className="text-right py-2 pl-3 font-semibold text-gray-600 whitespace-nowrap text-xs">{row.suffix}</td>
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
        className="mt-3 text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
      >
        수동 입력
      </button>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="grid grid-cols-2 gap-3">
        {channels.map((ch) => (
          <div key={ch.key} className="flex items-center gap-2">
            <label className="text-xs text-gray-600 w-16 shrink-0 truncate">{ch.label}</label>
            <input
              type="number"
              min={0}
              value={values[ch.key] ?? 0}
              onChange={(e) => setValues((v) => ({ ...v, [ch.key]: Number(e.target.value) || 0 }))}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 w-20 text-right text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
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

  const hasSamsung = data ? data.metrics.samsungSchedule.length > 0 : false
  const hasDailyTrend = data ? data.dailyTrend.length > 0 : false

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">

      {/* ================================================================ */}
      {/*  Zone 1: Header Band (no card frame)                             */}
      {/*  bg-gray-50 rounded-xl, no border/shadow                        */}
      {/* ================================================================ */}
      <div className="bg-gray-50 rounded-xl px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

          {/* Left: title + year-month + "in progress" badge */}
          <div className="flex items-baseline gap-3 shrink-0">
            <h1 className="text-lg font-bold text-gray-900">지표 대시보드</h1>
            <span className="text-sm text-gray-500 tabular-nums">{yearMonth}</span>
            {data?.isCurrentMonth && (
              <span className="bg-blue-100 text-blue-700 text-[11px] px-2 py-0.5 rounded-full font-medium leading-tight">
                진행 중
              </span>
            )}
          </div>

          {/* Right: 2 KPI blocks inline, separated by vertical divider */}
          {loading ? (
            /* Skeleton for KPI area inside the band */
            <div className="flex items-start">
              <div className="text-right">
                <div className="bg-gray-200/60 rounded animate-pulse h-3 w-14 mb-2 ml-auto" />
                <div className="bg-gray-200/60 rounded animate-pulse h-8 w-24 mb-1.5" />
                <div className="bg-gray-200/60 rounded animate-pulse h-3 w-16 ml-auto" />
              </div>
              <div className="border-l border-gray-200 pl-6 ml-6 text-right">
                <div className="bg-gray-200/60 rounded animate-pulse h-3 w-14 mb-2 ml-auto" />
                <div className="bg-gray-200/60 rounded animate-pulse h-8 w-24 mb-1.5" />
                <div className="bg-gray-200/60 rounded animate-pulse h-3 w-16 ml-auto" />
              </div>
            </div>
          ) : data ? (
            <div className="flex items-start">
              {/* KPI 1: Schedule Input Rate */}
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">일정 입력률</p>
                <div className="flex items-baseline justify-end gap-2">
                  <span className="text-3xl font-bold text-gray-900 tracking-tight tabular-nums">
                    {formatRate(data.metrics.scheduleInputRate.rate)}
                  </span>
                  <DeltaBadge
                    current={data.metrics.scheduleInputRate.rate}
                    prev={data.metrics.scheduleInputRate.prevMonth}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                  {data.metrics.scheduleInputRate.completed}/{data.metrics.scheduleInputRate.total}명
                </p>
              </div>

              {/* Vertical divider */}
              <div className="border-l border-gray-200 self-stretch mx-6" />

              {/* KPI 2: Schedule Provision Rate */}
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">일정 제공 비율</p>
                <div className="flex items-baseline justify-end gap-2">
                  <span className="text-3xl font-bold text-gray-900 tracking-tight tabular-nums">
                    {formatRate(data.metrics.scheduleProvision.afterRate)}
                  </span>
                  <DeltaBadge
                    current={data.metrics.scheduleProvision.afterRate}
                    prev={data.metrics.scheduleProvision.beforeRate}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-0.5 tabular-nums truncate max-w-[200px]">
                  {data.metrics.scheduleProvision.afterCount}/{data.metrics.scheduleProvision.sentCount}명
                  <span className="text-gray-300 mx-1">&middot;</span>
                  삼전 {data.metrics.scheduleProvision.samsungCount} + 일반 {data.metrics.scheduleProvision.nonSamsungCompleted}
                </p>
              </div>
            </div>
          ) : (
            /* Error / no data fallback: dashes */
            <div className="flex items-start">
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">일정 입력률</p>
                <span className="text-3xl font-bold text-gray-300 tracking-tight">&mdash;</span>
              </div>
              <div className="border-l border-gray-200 self-stretch mx-6" />
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">일정 제공 비율</p>
                <span className="text-3xl font-bold text-gray-300 tracking-tight">&mdash;</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/*  Loading state: Zone 2~4 skeleton                                */}
      {/* ================================================================ */}
      {loading && <PageSkeleton />}

      {/* ================================================================ */}
      {/*  Error state (replaces Zone 2~4)                                 */}
      {/* ================================================================ */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-sm text-red-700 mt-6">
          {error}
        </div>
      )}

      {/* ================================================================ */}
      {/*  Data loaded: Zone 2 ~ Zone 4                                    */}
      {/* ================================================================ */}
      {data && !loading && (
        <>
          {/* ============================================================ */}
          {/*  Zone 2: Samsung Progress                                     */}
          {/*  Full-width single card. DS|DX side-by-side on lg.           */}
          {/*  Hidden entirely when samsungSchedule is empty.              */}
          {/* ============================================================ */}
          {hasSamsung && (
            <div className={`${CARD} mt-6`}>
              <h3 className="text-sm font-semibold text-gray-800 mb-5">삼전 일정 입력 현황</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.metrics.samsungSchedule.map((item) => (
                  <div key={item.type}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{item.type}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0 ml-2">
                        {item.rate !== null ? `${item.rate}%` : 'N/A'}
                        <span className="text-xs font-normal text-gray-400 ml-1.5">{item.completed}/{item.total}명</span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2.5">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${item.rate ?? 0}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span className="text-green-600">완료 {item.completed}</span>
                      <span className="text-amber-600">접속만 {item.accessedOnly}</span>
                      <span className="text-red-500">미확인 {item.unvisited}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  Zone 3: Daily Trend Heatmap                                  */}
          {/*  Full-width single card. Hidden when dailyTrend is empty.    */}
          {/* ============================================================ */}
          {hasDailyTrend && (
            <div className="mt-6">
              <DailyHeatmap data={data.dailyTrend} samsung={data.metrics.samsungSchedule} />
            </div>
          )}

          {/* ============================================================ */}
          {/*  Zone 4: Auxiliary Metrics                                     */}
          {/*  Section label + 3-column uniform grid                        */}
          {/*  Wider gap from Zone 3 (mt-10) to signal section change       */}
          {/* ============================================================ */}
          <div className="mt-10">
            <p className="text-xs font-medium text-gray-400 tracking-wider uppercase mb-4">
              보조 지표
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">

              {/* Card: External Hire Channels (monthly trend table) */}
              <div className={CARD}>
                <h3 className="text-sm font-semibold text-gray-800 mb-4">외부 채널 모집 현황</h3>
                {data.metrics.externalHireHistory.months.length > 0 ? (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 pr-2 text-gray-500 font-medium sticky left-0 bg-white z-10">채널</th>
                          {data.metrics.externalHireHistory.months.map((m) => (
                            <th
                              key={m}
                              className={`text-right py-2 px-1.5 font-medium tabular-nums ${
                                m === yearMonth ? 'text-blue-600' : 'text-gray-500'
                              }`}
                            >
                              {parseInt(m.split('-')[1])}월
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.metrics.externalHireHistory.channels.map((ch) => (
                          <tr key={ch.key} className="border-b border-gray-50">
                            <td className="py-2 pr-2 text-gray-700 sticky left-0 bg-white z-10 truncate max-w-[80px]">{ch.label}</td>
                            {ch.values.map((v, i) => (
                              <td
                                key={i}
                                className={`text-right py-2 px-1.5 tabular-nums ${
                                  data.metrics.externalHireHistory.months[i] === yearMonth
                                    ? 'font-semibold text-gray-900'
                                    : 'text-gray-600'
                                }`}
                              >
                                {v !== null ? v : <span className="text-gray-300">-</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t border-gray-200">
                          <td className="py-2 pr-2 text-gray-700 font-medium sticky left-0 bg-white z-10">합계</td>
                          {data.metrics.externalHireHistory.months.map((m, mi) => {
                            const vals = data.metrics.externalHireHistory.channels.map((ch) => ch.values[mi])
                            const hasAny = vals.some((v) => v !== null)
                            const sum = hasAny ? vals.reduce<number>((s, v) => s + (v ?? 0), 0) : null
                            return (
                              <td
                                key={m}
                                className={`text-right py-2 px-1.5 font-semibold tabular-nums ${
                                  m === yearMonth ? 'text-blue-600' : 'text-gray-700'
                                }`}
                              >
                                {sum !== null ? sum : <span className="text-gray-300">-</span>}
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-4">이번 달부터 기록이 시작됩니다</p>
                )}
                <ExternalHireForm
                  channels={data.metrics.externalHireRate.channels}
                  yearMonth={yearMonth}
                  onSaved={() => fetchData(yearMonth)}
                />
              </div>

              {/* Card: Coach Pool Average */}
              <div className={CARD}>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">매니저당 평균 코치 pool</h3>
                {data.metrics.coachPoolByManager.managers.length > 0 ? (
                  (() => {
                    const mgrs = data.metrics.coachPoolByManager.managers
                    const avg = mgrs.reduce((s, m) => s + m.uniqueCoaches, 0) / mgrs.length
                    const prevAvg = mgrs.filter(m => m.prevMonth !== null).length > 0
                      ? mgrs.reduce((s, m) => s + (m.prevMonth ?? 0), 0) / mgrs.filter(m => m.prevMonth !== null).length
                      : null
                    const delta = prevAvg !== null ? avg - prevAvg : null
                    return (
                      <>
                        <p className="text-2xl font-bold text-gray-900 tracking-tight mt-1">
                          {avg.toFixed(1)}
                          <span className="text-sm font-medium text-gray-500 ml-1">명</span>
                        </p>
                        <div className="mt-1.5">
                          {prevAvg !== null && delta !== null ? (
                            <p className="text-sm">
                              <span className="text-gray-400 tabular-nums">{prevAvg.toFixed(1)}명 →</span>
                              <span className={`ml-1 font-medium tabular-nums ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(1)}명
                              </span>
                            </p>
                          ) : (
                            <span className="text-sm text-gray-400">&mdash;</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-2 truncate">
                          {mgrs.length}명 매니저 · 총 {mgrs.reduce((s, m) => s + m.uniqueCoaches, 0)}명 코치
                        </p>
                      </>
                    )
                  })()
                ) : (
                  <p className="text-sm text-gray-400 mt-2">데이터 없음</p>
                )}
              </div>

              {/* Card: Scouting Response Rate */}
              <div className={CARD}>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                  섭외 응답률
                  <span className="text-xs font-normal text-gray-400 ml-1">(수락+거절)</span>
                </h3>
                <p className="text-2xl font-bold text-gray-900 tracking-tight mt-1">
                  {formatRate(data.metrics.scoutingResponseRate.rate)}
                </p>
                <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                  {data.metrics.scoutingResponseRate.responded} / {data.metrics.scoutingResponseRate.requested}건
                </p>
                <div className="mt-1.5">
                  <DeltaBadge
                    current={data.metrics.scoutingResponseRate.rate}
                    prev={data.metrics.scoutingResponseRate.prevMonth}
                  />
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  )
}
