import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

const LINK_SHEET_ID = '1HFG4pRM7vH4FhezmkQXokFfCJcpI9Dsp9kzc1CH-K2Q'

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

// --- link sheet: 실제 발송 대상 코치 ID 조회 ---

async function fetchSentCoachIds(): Promise<string[]> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: LINK_SHEET_ID,
      range: "'시트1'!C2:C",
    })
    const tokens = (res.data.values ?? [])
      .map((row) => {
        const url = String(row[0] || '')
        const m = url.match(/token=([a-f0-9]{64})/)
        return m ? m[1] : null
      })
      .filter((t): t is string => !!t)

    if (tokens.length === 0) return []

    const coaches = await prisma.coach.findMany({
      where: { accessToken: { in: tokens }, deletedAt: null },
      select: { id: true },
    })
    return coaches.map((c) => c.id)
  } catch {
    return []
  }
}

// --- metric helpers ---

async function calcScheduleInputRate(ym: string, sentCoachIds?: string[]) {
  if (sentCoachIds && sentCoachIds.length > 0) {
    const completed = await prisma.scheduleAccessLog.count({
      where: { yearMonth: ym, lastEditedAt: { not: null }, coachId: { in: sentCoachIds } },
    })
    const total = sentCoachIds.length
    const rate = total > 0 ? round1((completed / total) * 100) : null
    return { completed, total, rate }
  }
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

async function calcExternalHireHistory(currentYear: number, currentMonth: number) {
  const channelKeys = ['ext_open_chat', 'ext_slack', 'ext_albamon', 'ext_other'] as const
  const channelLabels: Record<string, string> = {
    ext_open_chat: '오픈채팅방',
    ext_slack: '슬랙',
    ext_albamon: '알바몬',
    ext_other: '기타',
  }

  // 10월부터 표시 (최대 7개월)
  const months: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const snapshots = await prisma.metricSnapshot.findMany({
    where: { yearMonth: { in: months }, metricKey: { in: [...channelKeys] } },
  })

  const dataMap = new Map<string, Map<string, number>>()
  for (const s of snapshots) {
    if (!dataMap.has(s.yearMonth)) dataMap.set(s.yearMonth, new Map())
    dataMap.get(s.yearMonth)!.set(s.metricKey, s.value)
  }

  return {
    months,
    channels: channelKeys.map((key) => ({
      key,
      label: channelLabels[key],
      values: months.map((ym) => dataMap.get(ym)?.get(key) ?? null),
    })),
  }
}

async function calcCoachPoolByManager(year: number, month: number) {
  const { end } = monthRange(year, month)

  // 누적: 해당 월 말까지 섭외한 적 있는 고유 코치 수
  const rawRows: Array<{ manager_id: string; cnt: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT manager_id, COUNT(DISTINCT coach_id)::bigint AS cnt
     FROM scoutings
     WHERE created_at < $1
     GROUP BY manager_id`,
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

async function calcDailyTrend(year: number, month: number, ym: string, isCurrentMonth: boolean, sentCoachIds?: string[]) {
  const { start, end } = monthRange(year, month)
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const lastDay = isCurrentMonth ? Math.min(today.getDate(), lastDayOfMonth) : lastDayOfMonth

  // 삼전 DS/DX 코치 ID 조회
  const samsungCoaches = await prisma.coach.findMany({
    where: {
      deletedAt: null,
      status: 'active',
      OR: [{ workType: { contains: '삼전 DS' } }, { workType: { contains: '삼전 DX' } }],
      ...(sentCoachIds && sentCoachIds.length > 0 ? { id: { in: sentCoachIds } } : {}),
    },
    select: { id: true, workType: true },
  })
  const dsIds = new Set(samsungCoaches.filter((c) => (c.workType || '').includes('삼전 DS')).map((c) => c.id))
  const dxIds = new Set(samsungCoaches.filter((c) => (c.workType || '').includes('삼전 DX')).map((c) => c.id))

  // 전체 코치 수 (입력률 분모)
  const totalCoachWhere: any = { status: 'active' as const, deletedAt: null }
  if (sentCoachIds && sentCoachIds.length > 0) totalCoachWhere.id = { in: sentCoachIds }
  const totalCoaches = await prisma.coach.count({ where: totalCoachWhere })

  const [schedRaw, scoutRaw, allCompletionRaw] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ d: string; cnt: bigint }>>(
      `SELECT TO_CHAR(last_edited_at, 'YYYY-MM-DD') AS d, COUNT(*)::bigint AS cnt
       FROM schedule_access_logs
       WHERE year_month = $1 AND last_edited_at IS NOT NULL
       GROUP BY 1`,
      ym,
    ),
    prisma.$queryRawUnsafe<Array<{ d: string; cnt: bigint }>>(
      `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS d, COUNT(*)::bigint AS cnt
       FROM scoutings
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY 1`,
      start,
      end,
    ),
    // 코치별 입력 완료 날짜 (삼전 분류 + 전체 누적용)
    prisma.$queryRawUnsafe<Array<{ coach_id: string; d: string }>>(
      sentCoachIds && sentCoachIds.length > 0
        ? `SELECT coach_id, TO_CHAR(last_edited_at, 'YYYY-MM-DD') AS d
           FROM schedule_access_logs
           WHERE year_month = $1 AND last_edited_at IS NOT NULL AND coach_id = ANY($2::text[])`
        : `SELECT coach_id, TO_CHAR(last_edited_at, 'YYYY-MM-DD') AS d
           FROM schedule_access_logs
           WHERE year_month = $1 AND last_edited_at IS NOT NULL`,
      ym,
      ...(sentCoachIds && sentCoachIds.length > 0 ? [sentCoachIds] : []),
    ),
  ])

  const schedMap = new Map(schedRaw.map((r) => [r.d, Number(r.cnt)]))
  const scoutMap = new Map(scoutRaw.map((r) => [r.d, Number(r.cnt)]))

  // 일별 누적 완료 수 계산 (전체 + 삼전 DS/DX)
  const allDailyNew = new Map<string, number>()
  const dsDailyNew = new Map<string, number>()
  const dxDailyNew = new Map<string, number>()
  for (const row of allCompletionRaw) {
    allDailyNew.set(row.d, (allDailyNew.get(row.d) ?? 0) + 1)
    if (dsIds.has(row.coach_id)) dsDailyNew.set(row.d, (dsDailyNew.get(row.d) ?? 0) + 1)
    if (dxIds.has(row.coach_id)) dxDailyNew.set(row.d, (dxDailyNew.get(row.d) ?? 0) + 1)
  }

  let allCum = 0
  let dsCum = 0
  let dxCum = 0
  const days: Array<{
    date: string; day: number; scheduleEdits: number; scoutingsCreated: number
    dsCompleted: number; dxCompleted: number
    inputRate: number | null
  }> = []
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    allCum += allDailyNew.get(dateStr) ?? 0
    dsCum += dsDailyNew.get(dateStr) ?? 0
    dxCum += dxDailyNew.get(dateStr) ?? 0
    days.push({
      date: dateStr,
      day: d,
      scheduleEdits: schedMap.get(dateStr) ?? 0,
      scoutingsCreated: scoutMap.get(dateStr) ?? 0,
      dsCompleted: dsCum,
      dxCompleted: dxCum,
      inputRate: totalCoaches > 0 ? round1((allCum / totalCoaches) * 100) : null,
    })
  }
  return days
}

async function calcSamsungScheduleRate(ym: string, sentCoachIds?: string[]) {
  const where: any = {
    deletedAt: null,
    status: 'active',
    OR: [
      { workType: { contains: '삼전 DS' } },
      { workType: { contains: '삼전 DX' } },
    ],
  }
  if (sentCoachIds && sentCoachIds.length > 0) {
    where.id = { in: sentCoachIds }
  }
  const coaches = await prisma.coach.findMany({
    where,
    select: { id: true, workType: true },
  })

  const logs = await prisma.scheduleAccessLog.findMany({
    where: { yearMonth: ym, coachId: { in: coaches.map((c) => c.id) } },
    select: { coachId: true, lastEditedAt: true },
  })
  const logMap = new Map(logs.map((l) => [l.coachId, l]))

  const result: Record<string, { total: number; unvisited: number; accessedOnly: number; completed: number }> = {
    '삼전 DS': { total: 0, unvisited: 0, accessedOnly: 0, completed: 0 },
    '삼전 DX': { total: 0, unvisited: 0, accessedOnly: 0, completed: 0 },
  }

  for (const coach of coaches) {
    const types = (coach.workType || '').split(',').map((t) => t.trim())
    const log = logMap.get(coach.id)

    for (const type of types) {
      if (type !== '삼전 DS' && type !== '삼전 DX') continue
      result[type].total++
      if (!log) result[type].unvisited++
      else if (!log.lastEditedAt) result[type].accessedOnly++
      else result[type].completed++
    }
  }

  return Object.entries(result).map(([type, counts]) => ({
    type,
    ...counts,
    rate: counts.total > 0 ? round1((counts.completed / counts.total) * 100) : null,
  }))
}

// --- trend (last 6 months) ---

async function calcTrend(currentYear: number, currentMonth: number) {
  const months: Array<{ ym: string; year: number; month: number }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    months.push({ ym: ymStr(y, m), year: y, month: m })
  }

  const results = await Promise.all(
    months.map(async ({ ym, year: y, month: m }) => {
      const [sched, ext, pool, resp] = await Promise.all([
        calcScheduleInputRate(ym),
        calcExternalHireRateSimple(ym, y, m),
        calcCoachPoolByManager(y, m),
        calcScoutingResponseRate(y, m),
      ])
      const avgPool =
        pool.length > 0
          ? round1(pool.reduce((s, p) => s + p.uniqueCoaches, 0) / pool.length)
          : null
      return {
        yearMonth: ym,
        scheduleInputRate: sched.rate,
        externalHireRate: ext,
        avgCoachPool: avgPool,
        scoutingResponseRate: resp.rate,
      }
    }),
  )
  return results
}

// --- weeklyTrend (current month only) ---

async function calcWeeklyTrend(year: number, month: number, ym: string) {
  const now = new Date()
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  const lastDay = Math.min(now.getDate(), lastDayOfMonth)

  const total = await prisma.coach.count({
    where: { status: 'active', deletedAt: null },
  })

  // Get daily completed counts from ScheduleAccessLog
  const dailyRaw = await prisma.$queryRawUnsafe<Array<{ d: string; cnt: bigint }>>(
    `SELECT TO_CHAR(last_edited_at, 'YYYY-MM-DD') AS d, COUNT(*)::bigint AS cnt
     FROM schedule_access_logs
     WHERE year_month = $1 AND last_edited_at IS NOT NULL
     GROUP BY 1`,
    ym,
  )
  const dailyMap = new Map(dailyRaw.map((r) => [r.d, Number(r.cnt)]))

  // Split into weeks (Mon-Sun)
  const weeks: Array<{ weekLabel: string; completedCount: number; scheduleInputRate: number | null }> = []
  let weekStart = 1
  while (weekStart <= lastDay) {
    const startDate = new Date(year, month - 1, weekStart)
    const dayOfWeek = startDate.getDay()
    // Calculate end of week (Sunday) or end of month
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
    const weekEnd = Math.min(weekStart + daysUntilSunday, lastDay)

    let count = 0
    for (let d = weekStart; d <= weekEnd; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      count += dailyMap.get(dateStr) ?? 0
    }

    weeks.push({
      weekLabel: `${month}/${weekStart}~${weekEnd}`,
      completedCount: count,
      scheduleInputRate: total > 0 ? round1((count / total) * 100) : null,
    })

    weekStart = weekEnd + 1
  }
  return weeks
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

  // --- fetch sent coach IDs from link sheet ---
  const sentCoachIds = await fetchSentCoachIds()

  // --- current month metrics ---
  const [schedCurr, schedPrev, extCurr, extPrevRate, poolCurr, poolPrev, respCurr, respPrev, dailyTrend, samsungSchedule, extHistory, trend, weeklyTrend] =
    await Promise.all([
      calcScheduleInputRate(yearMonth, sentCoachIds),
      calcScheduleInputRate(prevYMStr),
      calcExternalHireRate(yearMonth, year, month),
      calcExternalHireRateSimple(prevYMStr, prev.year, prev.month),
      calcCoachPoolByManager(year, month),
      calcCoachPoolByManager(prev.year, prev.month),
      calcScoutingResponseRate(year, month),
      calcScoutingResponseRate(prev.year, prev.month),
      calcDailyTrend(year, month, yearMonth, isCurrentMonth, sentCoachIds),
      calcSamsungScheduleRate(yearMonth, sentCoachIds),
      calcExternalHireHistory(year, month),
      calcTrend(year, month),
      isCurrentMonth ? calcWeeklyTrend(year, month, yearMonth) : Promise.resolve(undefined),
    ])

  // 일정 제공 비율: before(발송 대상 중 삼전) → after(삼전 + 비삼전 입력완료)
  const sentCount = sentCoachIds.length
  const samsungSentCount = sentCount > 0
    ? await prisma.coach.count({
        where: {
          id: { in: sentCoachIds },
          status: 'active', deletedAt: null,
          OR: [{ workType: { contains: '삼전 DS' } }, { workType: { contains: '삼전 DX' } }],
        },
      })
    : 0
  const nonSamsungCompleted = sentCount > 0
    ? await prisma.scheduleAccessLog.count({
        where: {
          yearMonth,
          lastEditedAt: { not: null },
          coachId: { in: sentCoachIds },
          coach: {
            status: 'active', deletedAt: null,
            NOT: {
              OR: [{ workType: { contains: '삼전 DS' } }, { workType: { contains: '삼전 DX' } }],
            },
          },
        },
      })
    : 0
  const afterCount = samsungSentCount + nonSamsungCompleted
  const scheduleProvision = {
    sentCount,
    samsungCount: samsungSentCount,
    afterCount,
    nonSamsungCompleted,
    beforeRate: sentCount > 0 ? round1((samsungSentCount / sentCount) * 100) : null,
    afterRate: sentCount > 0 ? round1((afterCount / sentCount) * 100) : null,
  }

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
      samsungSchedule,
      scheduleProvision,
      externalHireHistory: extHistory,
    },
    dailyTrend,
    trend,
    ...(weeklyTrend ? { weeklyTrend } : {}),
  })
}
