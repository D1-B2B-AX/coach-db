import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { toBitmap, subtractBitmap, toIntervals, hasAvailability } from '@/lib/schedule-bitmap'
import { toDateOnly } from '@/lib/date-utils'

type RouteParams = { params: Promise<{ yearMonth: string; date: string }> }

// GET /api/schedules/:yearMonth/:date — available coaches for a specific date
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { yearMonth, date: dayStr } = await params

  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) {
    return NextResponse.json({ error: 'Invalid yearMonth format' }, { status: 400 })
  }

  const day = parseInt(dayStr, 10)
  if (isNaN(day) || day < 1 || day > 31) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const fullDate = `${yearMonth}-${String(day).padStart(2, '0')}`
  const targetDate = new Date(fullDate + 'T12:00:00Z')
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const { searchParams } = request.nextUrl
  const timeFilter = searchParams.get('timeFilter')
  const endDateParam = searchParams.get('endDate')

  // Parse time filter
  let filterStart: string | null = null
  let filterEnd: string | null = null
  if (timeFilter && timeFilter !== 'all') {
    if (timeFilter === 'custom') {
      filterStart = searchParams.get('customStart')
      filterEnd = searchParams.get('customEnd')
    } else {
      const match = timeFilter.match(/^(\d{2})-(\d{2})$/)
      if (match) {
        filterStart = `${match[1]}:00`
        filterEnd = `${match[2]}:00`
      }
    }
  }

  // Build coach where clause
  const coachWhere: Record<string, unknown> = {
    status: 'active',
    deletedAt: null,
  }

  // Build list of target dates
  const targetDates: Date[] = []
  if (endDateParam) {
    const cursor = new Date(fullDate + 'T12:00:00Z')
    const rangeEnd = new Date(endDateParam + 'T12:00:00Z')
    while (cursor <= rangeEnd) {
      targetDates.push(new Date(cursor))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  } else {
    targetDates.push(targetDate)
  }

  // Fetch coach availability + engagement busy times for all dates in parallel
  const [availSchedules, busySchedules] = await Promise.all([
    prisma.coachSchedule.findMany({
      where: {
        date: { in: targetDates },
        coach: coachWhere,
      },
      include: {
        coach: {
          include: {
            fields: { include: { field: true } },
            engagements: {
              orderBy: { endDate: 'desc' },
              take: 2,
              select: { courseName: true, endDate: true },
            },
            _count: { select: { engagements: true } },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    }),
    prisma.engagementSchedule.findMany({
      where: {
        date: { in: targetDates },
        engagement: {
          status: { in: ['scheduled', 'in_progress', 'completed'] },
        },
      },
      select: { coachId: true, date: true, startTime: true, endTime: true },
    }),
  ])

  // Build busy map: coachId → dateStr → intervals
  const busyMap = new Map<string, Map<string, { startTime: string; endTime: string }[]>>()
  for (const b of busySchedules) {
    if (!busyMap.has(b.coachId)) busyMap.set(b.coachId, new Map())
    const dateStr = b.date.toISOString().slice(0, 10)
    const dateMap = busyMap.get(b.coachId)!
    if (!dateMap.has(dateStr)) dateMap.set(dateStr, [])
    dateMap.get(dateStr)!.push({ startTime: b.startTime, endTime: b.endTime })
  }

  // Group avail schedules by coach and date
  const coachDateMap = new Map<string, {
    info: {
      id: string; name: string; phone: string | null; email: string | null
      fields: string[]
      recentEngagements: { courseName: string; endDate: Date }[]
      engagementCount: number
    }
    dates: Map<string, { startTime: string; endTime: string }[]>
  }>()

  for (const s of availSchedules) {
    const c = s.coach
    const dateStr = s.date.toISOString().slice(0, 10)
    if (!coachDateMap.has(c.id)) {
      coachDateMap.set(c.id, {
        info: {
          id: c.id, name: c.name, phone: c.phone, email: c.email,
          fields: c.fields.map((cf) => cf.field.name),
          recentEngagements: c.engagements.map(e => ({ courseName: e.courseName, endDate: e.endDate })),
          engagementCount: (c as any)._count?.engagements ?? 0,
        },
        dates: new Map(),
      })
    }
    const entry = coachDateMap.get(c.id)!
    if (!entry.dates.has(dateStr)) entry.dates.set(dateStr, [])
    entry.dates.get(dateStr)!.push({ startTime: s.startTime, endTime: s.endTime })
  }

  // Compute net availability per coach (AND across all dates for range queries)
  const resultCoaches: {
    id: string; name: string; phone: string | null; email: string | null
    schedules: { startTime: string; endTime: string }[]
    fields: string[]
    recentEngagements: { courseName: string; endDate: Date }[]
    engagementCount: number
  }[] = []

  const dateKeys = targetDates.map(d => d.toISOString().slice(0, 10))

  for (const [coachId, entry] of coachDateMap) {
    // For range queries, coach must have availability on ALL dates
    if (endDateParam && entry.dates.size < targetDates.length) continue

    // Compute net bitmap per date and AND them together
    let combinedBm: boolean[] | null = null

    for (const dk of dateKeys) {
      const availIntervals = entry.dates.get(dk)
      if (!availIntervals) {
        // No availability on this date — skip coach
        combinedBm = null
        break
      }

      const availBm = toBitmap(availIntervals)
      const busyIntervals = busyMap.get(coachId)?.get(dk) || []
      const busyBm = toBitmap(busyIntervals)
      let remainBm = subtractBitmap(availBm, busyBm)

      // Apply time filter
      if (filterStart && filterEnd) {
        const filterBm = toBitmap([{ startTime: filterStart, endTime: filterEnd }])
        remainBm = remainBm.map((v, i) => v && filterBm[i])
      }

      if (combinedBm === null) {
        combinedBm = remainBm
      } else {
        combinedBm = combinedBm.map((v, i) => v && remainBm[i])
      }
    }

    if (!combinedBm || !hasAvailability(combinedBm)) continue

    resultCoaches.push({
      id: entry.info.id, name: entry.info.name,
      phone: entry.info.phone, email: entry.info.email,
      schedules: toIntervals(combinedBm),
      fields: entry.info.fields,
      recentEngagements: entry.info.recentEngagements,
      engagementCount: entry.info.engagementCount,
    })
  }

  // Compute avg ratings + work days
  const coachIds = resultCoaches.map(c => c.id)

  const now = new Date()
  const sixMAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const sixMonthsAgoDate = toDateOnly(`${sixMAgo.getFullYear()}-${String(sixMAgo.getMonth() + 1).padStart(2, '0')}-01`)
  const todayDate = toDateOnly(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)

  const [ratingAggregates, workDayRows] = await Promise.all([
    coachIds.length > 0
      ? prisma.engagement.groupBy({
          by: ['coachId'],
          where: { coachId: { in: coachIds }, rating: { not: null } },
          _avg: { rating: true },
        })
      : [],
    coachIds.length > 0
      ? prisma.$queryRaw<{ coach_id: string; days: bigint }[]>`
          SELECT coach_id, COUNT(DISTINCT date) as days
          FROM coach_schedules
          WHERE coach_id::text = ANY(${coachIds})
            AND date >= ${sixMonthsAgoDate}
            AND date <= ${todayDate}
          GROUP BY coach_id
        `
      : [],
  ])

  const ratingMap = new Map(ratingAggregates.map(r => [r.coachId, r._avg.rating]))
  const workDayMap = new Map(workDayRows.map(r => [r.coach_id, Number(r.days)]))

  const coaches = resultCoaches.map(c => ({
    ...c,
    avgRating: ratingMap.get(c.id) ?? null,
    workDays: workDayMap.get(c.id) ?? 0,
  }))

  return NextResponse.json({ date: fullDate, coaches, total: coaches.length })
}
