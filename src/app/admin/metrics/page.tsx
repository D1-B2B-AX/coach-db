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

interface ExternalHireHistory {
  months: string[]
  channels: { key: string; label: string; values: (number | null)[] }[]
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
  anyMonthEdits: number
  dsCompleted: number
  dxCompleted: number
  inputRate: number | null
}

interface TrendPoint {
  yearMonth: string
  scheduleInputRate: number | null
}

interface WeeklyTrendPoint {
  weekLabel: string
  completedCount: number
  scheduleInputRate: number | null
}

interface MetricsData {
  yearMonth: string
  isCurrentMonth: boolean
  metrics: {
    scheduleInputRate: ScheduleInputRate
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
  trend: TrendPoint[]
  weeklyTrend?: WeeklyTrendPoint[]
}

interface EmailTrackingCoach {
  name: string
  email: string | null
  status: 'not_visited' | 'visited_only' | 'completed'
  latestAccess: string | null
  latestEdit: string | null
  monthsEdited: number
  scheduleCount: number
}

interface EmailTrackingData {
  coaches: EmailTrackingCoach[]
  summary: {
    total: number
    completed: number
    visitedOnly: number
    notVisited: number
  }
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
  const data = rawData
  if (!data.length) return null

  const rows: HeatmapRow[] = [
    { label: '이번 달 입력', hue: '#3B82F6', values: data.map((d) => d.scheduleEdits), suffix: `합 ${data.reduce((s, d) => s + d.scheduleEdits, 0)}` },
    { label: '전체 입력', hue: '#6366F1', values: data.map((d) => d.anyMonthEdits), suffix: `합 ${data.reduce((s, d) => s + d.anyMonthEdits, 0)}` },
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
/*  Trend Line Chart (SVG, last 6 months, 4 metrics)                   */
/* ------------------------------------------------------------------ */
const TREND_COLORS: Record<string, string> = {
  scheduleInputRate: '#3B82F6',
}
const TREND_LABELS: Record<string, string> = {
  scheduleInputRate: '일정 입력률',
}
const TREND_KEYS = ['scheduleInputRate'] as const

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (!trend || trend.length === 0) return null

  const W = 560
  const H = 200
  const PAD_L = 40
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 32
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  // Collect all non-null values to find y range
  const allVals: number[] = []
  for (const pt of trend) {
    for (const k of TREND_KEYS) {
      const v = pt[k]
      if (v !== null && v !== undefined) allVals.push(v)
    }
  }
  const yMin = 0
  const yMax = allVals.length > 0 ? Math.max(Math.ceil(Math.max(...allVals) / 10) * 10, 10) : 100

  function toX(i: number) {
    return PAD_L + (trend.length > 1 ? (i / (trend.length - 1)) * chartW : chartW / 2)
  }
  function toY(v: number) {
    return PAD_T + chartH - ((v - yMin) / (yMax - yMin)) * chartH
  }

  // Build polylines for each metric
  const lines: Array<{ key: string; path: string; points: Array<{ x: number; y: number; val: number }> }> = []
  for (const k of TREND_KEYS) {
    const pts: Array<{ x: number; y: number; val: number }> = []
    trend.forEach((pt, i) => {
      const v = pt[k]
      if (v !== null && v !== undefined) {
        pts.push({ x: toX(i), y: toY(v), val: v })
      }
    })
    if (pts.length > 0) {
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
      lines.push({ key: k, path, points: pts })
    }
  }

  // Y-axis grid lines
  const yTicks: number[] = []
  const step = yMax <= 20 ? 5 : yMax <= 50 ? 10 : 20
  for (let v = yMin; v <= yMax; v += step) yTicks.push(v)

  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-gray-800 mb-4">추이 차트 (최근 6개월)</h3>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3">
        {TREND_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-[3px] rounded-full" style={{ backgroundColor: TREND_COLORS[k] }} />
            {TREND_LABELS[k]}
          </div>
        ))}
      </div>

      {/* SVG Chart */}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[560px]" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD_L} y1={toY(v)} x2={W - PAD_R} y2={toY(v)} stroke="#E5E7EB" strokeWidth="1" />
              <text x={PAD_L - 6} y={toY(v) + 3} textAnchor="end" className="text-[10px] fill-gray-400">{v}</text>
            </g>
          ))}

          {/* X-axis labels */}
          {trend.map((pt, i) => (
            <text key={pt.yearMonth} x={toX(i)} y={H - 6} textAnchor="middle" className="text-[10px] fill-gray-500">
              {parseInt(pt.yearMonth.split('-')[1])}월
            </text>
          ))}

          {/* Lines + dots */}
          {lines.map(({ key, path, points }) => (
            <g key={key}>
              <path d={path} fill="none" stroke={TREND_COLORS[key]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke={TREND_COLORS[key]} strokeWidth="2" />
                  <text x={p.x} y={p.y - 8} textAnchor="middle" className="text-[9px] font-medium" fill={TREND_COLORS[key]}>
                    {p.val.toFixed(1)}
                  </text>
                </g>
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Weekly Trend Mini Chart (SVG bar chart, current month only)        */
/* ------------------------------------------------------------------ */
function WeeklyTrendMiniChart({ weeklyTrend }: { weeklyTrend: WeeklyTrendPoint[] }) {
  if (!weeklyTrend || weeklyTrend.length === 0) return null

  const maxRate = Math.max(...weeklyTrend.map((w) => w.scheduleInputRate ?? 0), 1)
  const barMaxH = 48

  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-gray-800 mb-1">주간 입력률 추이</h3>
      <p className="text-xs text-gray-400 mb-4">현재 월 주 단위 집계</p>
      <div className="flex items-end gap-3">
        {weeklyTrend.map((w) => {
          const rate = w.scheduleInputRate ?? 0
          const h = maxRate > 0 ? Math.max((rate / maxRate) * barMaxH, 2) : 2
          return (
            <div key={w.weekLabel} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <span className="text-[10px] font-medium text-gray-700 tabular-nums">
                {rate.toFixed(1)}%
              </span>
              <div
                className="w-full max-w-[40px] rounded-t-sm bg-blue-400 transition-all"
                style={{ height: `${h}px` }}
              />
              <span className="text-[9px] text-gray-400 truncate w-full text-center">{w.weekLabel}</span>
              <span className="text-[9px] text-gray-400 tabular-nums">{w.completedCount}건</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Email Campaign Tracking                                            */
/* ------------------------------------------------------------------ */
const STATUS_CFG = {
  completed: { label: '입력완료', color: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-500' },
  visited_only: { label: '접속만', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  not_visited: { label: '미접속', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' },
} as const

function fmtDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}

function EmailTrackingSection({ data }: { data: EmailTrackingData }) {
  const { coaches, summary } = data
  const rate = summary.total > 0 ? ((summary.completed / summary.total) * 100).toFixed(1) : '0'

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">메일 발송 코치 활동 추적</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-600 font-medium">완료 {summary.completed}</span>
          <span className="text-amber-600 font-medium">접속만 {summary.visitedOnly}</span>
          <span className="text-red-500 font-medium">미접속 {summary.notVisited}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-700 font-semibold tabular-nums">{rate}%</span>
        </div>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
        <div className="h-full flex">
          {summary.completed > 0 && (
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${(summary.completed / summary.total) * 100}%` }}
            />
          )}
          {summary.visitedOnly > 0 && (
            <div
              className="h-full bg-amber-400 transition-all"
              style={{ width: `${(summary.visitedOnly / summary.total) * 100}%` }}
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pl-2 pr-3 text-gray-500 font-medium">이름</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">상태</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">최근 접속</th>
              <th className="text-left py-2 px-3 text-gray-500 font-medium">최근 저장</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">입력 월수</th>
              <th className="text-right py-2 pl-3 pr-2 text-gray-500 font-medium">일정 건수</th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((c) => {
              const cfg = STATUS_CFG[c.status]
              return (
                <tr key={c.email ?? c.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 pl-2 pr-3 text-gray-800 font-medium">{c.name}</td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 tabular-nums">{fmtDate(c.latestAccess)}</td>
                  <td className="py-2.5 px-3 text-gray-600 tabular-nums">{fmtDate(c.latestEdit)}</td>
                  <td className="py-2.5 px-3 text-right text-gray-600 tabular-nums">{c.monthsEdited || '-'}</td>
                  <td className="py-2.5 pl-3 pr-2 text-right text-gray-600 tabular-nums">{c.scheduleCount || '-'}</td>
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
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
export default function AdminMetricsPage() {
  const yearMonth = getCurrentYearMonth()
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailTracking, setEmailTracking] = useState<EmailTrackingData | null>(null)

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
    fetch('/api/admin/metrics/email-tracking')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setEmailTracking(d))
      .catch(() => {})
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
          {/*  Zone 3.5: Email Campaign Tracking                            */}
          {/* ============================================================ */}
          {emailTracking && emailTracking.coaches.length > 0 && (
            <div className="mt-6">
              <EmailTrackingSection data={emailTracking} />
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
                  channels={data.metrics.externalHireHistory.channels.map((ch) => {
                    const ymIdx = data.metrics.externalHireHistory.months.indexOf(yearMonth)
                    return { key: ch.key, label: ch.label, count: ymIdx >= 0 ? (ch.values[ymIdx] ?? 0) : 0 }
                  })}
                  yearMonth={yearMonth}
                  onSaved={() => fetchData(yearMonth)}
                />
              </div>

            </div>
          </div>

          {/* ============================================================ */}
          {/*  Zone 5: Trend Chart + Weekly Trend                           */}
          {/*  6-month line chart (4 metrics overlaid)                     */}
          {/*  + weekly mini chart (current month only)                    */}
          {/* ============================================================ */}
          <div className="mt-10">
            <p className="text-xs font-medium text-gray-400 tracking-wider uppercase mb-4">
              추이
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <TrendChart trend={data.trend} />
              </div>
              <div>
                {data.weeklyTrend && data.weeklyTrend.length > 0 ? (
                  <WeeklyTrendMiniChart weeklyTrend={data.weeklyTrend} />
                ) : (
                  <div className={CARD}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">주간 입력률 추이</h3>
                    <p className="text-xs text-gray-400 mt-2">현재 월에서만 표시됩니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
