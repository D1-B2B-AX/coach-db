import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { fetchDxTracks, DxTrack } from '@/lib/sync/samsung-dx-tracks'
import { toBitmap, subtractBitmap, clearOverlappingPeriods, hasAvailability } from '@/lib/schedule-bitmap'
import { getSamsungExclusions } from '@/lib/samsung-config'
import { autoAssignForDate } from '@/lib/dx-assignment/auto-assign'

// ─── 5-minute cache for DX tracks ───
let cache: { data: DxTrack[]; expiry: number } | null = null

async function getCachedTracks(year: number): Promise<DxTrack[]> {
  const now = Date.now()
  if (cache && cache.expiry > now) return cache.data
  const data = await fetchDxTracks(year)
  cache = { data, expiry: now + 5 * 60 * 1000 }
  return data
}

// POST /api/dx-assignment/auto-assign
export async function POST(request: NextRequest) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { yearMonth, date } = body as { yearMonth?: string; date?: string }

  if (!yearMonth && !date) {
    return NextResponse.json({ error: 'yearMonth or date is required' }, { status: 400 })
  }

  // Build list of target dates
  const targetDates: Date[] = []
  let resolvedYearMonth: string

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    targetDates.push(new Date(date + 'T12:00:00Z'))
    resolvedYearMonth = date.slice(0, 7)
  } else {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth!)) {
      return NextResponse.json({ error: 'Invalid yearMonth format' }, { status: 400 })
    }
    resolvedYearMonth = yearMonth!
    const [y, m] = yearMonth!.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
    for (let d = 1; d <= daysInMonth; d++) {
      targetDates.push(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)))
    }
  }

  const { excludeDX } = getSamsungExclusions(resolvedYearMonth)
  if (excludeDX) {
    return NextResponse.json({ created: 0, skipped: targetDates.length })
  }

  const year = Number(resolvedYearMonth.split('-')[0])
  const allTracks = await getCachedTracks(year)

  // DX work hours: 09:00~18:00
  const dxRange = toBitmap([{ startTime: '09:00', endTime: '18:00' }])

  // Month range for counting assignments
  const monthNum = Number(resolvedYearMonth.split('-')[1])
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1))
  const monthEnd = new Date(Date.UTC(year, monthNum, 0))

  let created = 0
  let skipped = 0

  for (const targetDate of targetDates) {
    // 1. Find tracks active on this date
    const activeTracks = allTracks.filter((t) => {
      return t.startDate <= targetDate && t.endDate >= targetDate
    })
    if (activeTracks.length === 0) {
      skipped++
      continue
    }

    const trackNames = activeTracks.map((t) => t.trackName)

    // 2. Fetch available DX coaches for this date
    const [availSchedules, busySchedules, existingAssignments, monthAssignments] = await Promise.all([
      prisma.coachSchedule.findMany({
        where: {
          date: targetDate,
          coach: {
            status: 'active',
            deletedAt: null,
            workType: { contains: '삼전 DX' },
          },
        },
        include: { coach: { select: { id: true, name: true } } },
      }),
      prisma.engagementSchedule.findMany({
        where: {
          date: targetDate,
          engagement: {
            status: { in: ['scheduled', 'in_progress', 'completed'] },
          },
        },
        select: { coachId: true, startTime: true, endTime: true },
      }),
      // 3. Existing assignments for this date
      prisma.dxAssignment.findMany({
        where: { date: targetDate },
        select: { trackName: true, coachId: true, isAuto: true },
      }),
      // Month assignment counts
      prisma.dxAssignment.groupBy({
        by: ['coachId'],
        where: {
          date: { gte: monthStart, lte: monthEnd },
        },
        _count: true,
      }),
    ])

    // Build busy map
    const busyMap = new Map<string, { startTime: string; endTime: string }[]>()
    for (const b of busySchedules) {
      if (!busyMap.has(b.coachId)) busyMap.set(b.coachId, [])
      busyMap.get(b.coachId)!.push({ startTime: b.startTime, endTime: b.endTime })
    }

    // Group avail by coach
    const coachAvailMap = new Map<string, {
      id: string; name: string
      intervals: { startTime: string; endTime: string }[]
    }>()
    for (const s of availSchedules) {
      if (!coachAvailMap.has(s.coachId)) {
        coachAvailMap.set(s.coachId, {
          id: s.coach.id,
          name: s.coach.name,
          intervals: [],
        })
      }
      coachAvailMap.get(s.coachId)!.intervals.push({
        startTime: s.startTime,
        endTime: s.endTime,
      })
    }

    // Month count map
    const monthCountMap = new Map<string, number>()
    for (const ma of monthAssignments) {
      monthCountMap.set(ma.coachId, ma._count)
    }

    // Filter to coaches with 09:00~18:00 availability
    const availableCoaches = []
    for (const [coachId, entry] of coachAvailMap) {
      const availBm = toBitmap(entry.intervals)
      const busyIntervals = busyMap.get(coachId) || []
      const busyBm = toBitmap(busyIntervals)
      const remainBm = clearOverlappingPeriods(subtractBitmap(availBm, busyBm), busyBm)

      const dxAvail = remainBm.map((v, i) => v && dxRange[i])
      if (!hasAvailability(dxAvail)) continue

      availableCoaches.push({
        id: entry.id,
        name: entry.name,
        currentMonthAssignments: monthCountMap.get(coachId) ?? 0,
      })
    }

    // 4. Call autoAssignForDate
    const results = autoAssignForDate(trackNames, availableCoaches, existingAssignments)

    // 5. Save results to DB (isAuto=true)
    if (results.length > 0) {
      // Delete existing auto assignments for these tracks on this date first
      await prisma.dxAssignment.deleteMany({
        where: {
          date: targetDate,
          trackName: { in: trackNames },
          isAuto: true,
        },
      })

      await prisma.dxAssignment.createMany({
        data: results.map((r) => ({
          trackName: r.trackName,
          date: targetDate,
          coachId: r.coachId,
          assignedBy: 'auto',
          isAuto: true,
        })),
      })
      created += results.length
    } else {
      skipped++
    }
  }

  return NextResponse.json({ created, skipped })
}
