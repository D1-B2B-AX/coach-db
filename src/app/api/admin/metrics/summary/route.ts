import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

const YM_RE = /^\d{4}-(?:0[1-9]|1[0-2])$/

function parseYM(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number)
  return { year: y, month: m }
}

function prevYM(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

function ymStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function monthRange(year: number, month: number) {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

// --- metric helpers ---

async function calcScheduleInputRate(ym: string) {
  const completed = await prisma.scheduleAccessLog.count({
    where: { yearMonth: ym, lastEditedAt: { not: null } },
  })
  const total = await prisma.coach.count({
    where: { status: 'active', deletedAt: null },
  })
  const rate = total > 0 ? round1((completed / total) * 100) : null
  return { completed, total, rate }
}

async function calcExternalHireRate(ym: string, year: number, month: number) {
  const channelKeys = ['ext_open_chat', 'ext_slack', 'ext_albamon', 'ext_other'] as const
  const channelLabels: Record<string, string> = {
    ext_open_chat: '오픈채팅방',
    ext_slack: '슬랙',
    ext_albamon: '알바몬',
    ext_other: '기타',
  }

  const snapshots = await prisma.metricSnapshot.findMany({
    where: { yearMonth: ym, metricKey: { startsWith: 'ext_' } },
  })
  const valMap = new Map<string, number>(snapshots.map((s) => [s.metricKey, s.value]))

  const channels = channelKeys.map((key) => ({
    key,
    label: channelLabels[key],
    count: valMap.get(key) ?? 0,
  }))
  const externalTotal = channels.reduce((s: number, c) => s + c.count, 0)

  const { start, end } = monthRange(year, month)
  const scoutingTotal = await prisma.scouting.count({
    where: { createdAt: { gte: start, lt: end } },
  })

  const rate = scoutingTotal > 0 ? round1((externalTotal / scoutingTotal) * 100) : null
  return { channels, externalTotal, scoutingTotal, rate }
}

async function calcExternalHireRateSimple(ym: string, year: number, month: number) {
  const r = await calcExternalHireRate(ym, year, month)
  return r.rate
}

async function calcCoachPoolByManager(year: number, month: number) {
  const { start, end } = monthRange(year, month)

  // Prisma groupBy _count doesn't do DISTINCT, so use raw for distinct count
  const rawRows: Array<{ manager_id: string; cnt: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT manager_id, COUNT(DISTINCT coach_id)::bigint AS cnt
     FROM scoutings
     WHERE created_at >= $1 AND created_at < $2
     GROUP BY manager_id`,
    start,
    end,
  )

  const managerIds = rawRows.map((r) => r.manager_id)
  const managers =
    managerIds.length > 0
      ? await prisma.manager.findMany({
          where: { id: { in: managerIds } },
          select: { id: true, name: true },
        })
      : []
  const nameMap = new Map(managers.map((m) => [m.id, m.name]))

  return rawRows.map((r) => ({
    managerId: r.manager_id,
    managerName: nameMap.get(r.manager_id) ?? '(알 수 없음)',
    uniqueCoaches: Number(r.cnt),
  }))
}

async function calcScoutingResponseRate(year: number, month: number) {
  const { start, end } = monthRange(year, month)
  const requested = await prisma.scouting.count({
    where: { createdAt: { gte: start, lt: end } },
  })
  const responded = await prisma.scouting.count({
    where: {
      createdAt: { gte: start, lt: end },
      status: { in: ['accepted', 'rejected'] },
    },
  })
  const rate = requested > 0 ? round1((responded / requested) * 100) : null
  return { requested, responded, rate }
}

// --- route ---

export async function GET(request: NextRequest) {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const yearMonth = request.nextUrl.searchParams.get('yearMonth')
  if (!yearMonth || !YM_RE.test(yearMonth)) {
    return NextResponse.json({ error: 'yearMonth (YYYY-MM) is required' }, { status: 400 })
  }

  const { year, month } = parseYM(yearMonth)
  const prev = prevYM(year, month)
  const prevYMStr = ymStr(prev.year, prev.month)

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month

  // --- current month metrics ---
  const [schedCurr, schedPrev, extCurr, extPrevRate, poolCurr, poolPrev, respCurr, respPrev] =
    await Promise.all([
      calcScheduleInputRate(yearMonth),
      calcScheduleInputRate(prevYMStr),
      calcExternalHireRate(yearMonth, year, month),
      calcExternalHireRateSimple(prevYMStr, prev.year, prev.month),
      calcCoachPoolByManager(year, month),
      calcCoachPoolByManager(prev.year, prev.month),
      calcScoutingResponseRate(year, month),
      calcScoutingResponseRate(prev.year, prev.month),
    ])

  // merge prevMonth into coachPoolByManager
  const prevPoolMap = new Map(poolPrev.map((p) => [p.managerId, p.uniqueCoaches]))
  const managersPool = poolCurr.map((m) => {
    const pv = prevPoolMap.get(m.managerId) ?? null
    return {
      ...m,
      prevMonth: pv,
      changeRate: pv != null && pv > 0 ? round1(((m.uniqueCoaches - pv) / pv) * 100) : null,
    }
  })

  // --- trend (6 months) ---
  const trendMonths: Array<{ year: number; month: number; ym: string }> = []
  let ty = year
  let tm = month
  for (let i = 0; i < 6; i++) {
    trendMonths.unshift({ year: ty, month: tm, ym: ymStr(ty, tm) })
    const p = prevYM(ty, tm)
    ty = p.year
    tm = p.month
  }

  const trend = await Promise.all(
    trendMonths.map(async ({ year: y, month: m, ym }) => {
      const [sched, ext, pool, resp] = await Promise.all([
        calcScheduleInputRate(ym),
        calcExternalHireRateSimple(ym, y, m),
        calcCoachPoolByManager(y, m),
        calcScoutingResponseRate(y, m),
      ])
      const avgCoachPool =
        pool.length > 0
          ? round1(pool.reduce((s, p) => s + p.uniqueCoaches, 0) / pool.length)
          : null
      return {
        yearMonth: ym,
        scheduleInputRate: sched.rate,
        externalHireRate: ext,
        avgCoachPool,
        scoutingResponseRate: resp.rate,
      }
    }),
  )

  // --- weeklyTrend (current month only) ---
  let weeklyTrend: Array<{ weekLabel: string; scheduleInputRate: number | null; completedCount: number }> | undefined
  if (isCurrentMonth) {
    const totalCoaches = await prisma.coach.count({
      where: { status: 'active', deletedAt: null },
    })

    const lastDay = new Date(year, month, 0).getDate()
    const weeks = [
      { label: 'W1', start: 1, end: 7 },
      { label: 'W2', start: 8, end: 14 },
      { label: 'W3', start: 15, end: 21 },
      { label: 'W4', start: 22, end: lastDay },
    ]

    weeklyTrend = await Promise.all(
      weeks.map(async (w) => {
        const wStart = new Date(year, month - 1, w.start)
        const wEnd = new Date(year, month - 1, w.end + 1)
        const completedCount = await prisma.scheduleAccessLog.count({
          where: {
            yearMonth: yearMonth,
            lastEditedAt: { gte: wStart, lt: wEnd },
          },
        })
        return {
          weekLabel: w.label,
          completedCount,
          scheduleInputRate: totalCoaches > 0 ? round1((completedCount / totalCoaches) * 100) : null,
        }
      }),
    )
  }

  return NextResponse.json({
    yearMonth,
    isCurrentMonth,
    metrics: {
      scheduleInputRate: {
        completed: schedCurr.completed,
        total: schedCurr.total,
        rate: schedCurr.rate,
        prevMonth: schedPrev.rate,
      },
      externalHireRate: {
        channels: extCurr.channels,
        externalTotal: extCurr.externalTotal,
        scoutingTotal: extCurr.scoutingTotal,
        rate: extCurr.rate,
        prevMonth: extPrevRate,
      },
      coachPoolByManager: {
        managers: managersPool,
      },
      scoutingResponseRate: {
        requested: respCurr.requested,
        responded: respCurr.responded,
        rate: respCurr.rate,
        prevMonth: respPrev.rate,
      },
    },
    trend,
    ...(weeklyTrend ? { weeklyTrend } : {}),
  })
}
