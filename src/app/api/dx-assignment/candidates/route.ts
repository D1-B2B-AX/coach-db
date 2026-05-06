import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { toBitmap, subtractBitmap, clearOverlappingPeriods, hasAvailability } from '@/lib/schedule-bitmap'
import { getSamsungExclusions } from '@/lib/samsung-config'

// GET /api/dx-assignment/candidates?date=2026-05-12
export async function GET(request: NextRequest) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dateStr = request.nextUrl.searchParams.get('date')
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  const targetDate = new Date(dateStr + 'T12:00:00Z')
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const yearMonth = dateStr.slice(0, 7)
  const { excludeDX } = getSamsungExclusions(yearMonth)

  // Fetch DX coaches with CoachSchedule availability on the target date
  const coachWhere: Record<string, unknown> = {
    status: 'active',
    deletedAt: null,
    workType: { contains: '삼전 DX' },
  }

  // If DX coaches are hidden for this yearMonth, return empty
  if (excludeDX) {
    return NextResponse.json({ date: dateStr, candidates: [] })
  }

  const [availSchedules, busySchedules, existingAssignments] = await Promise.all([
    prisma.coachSchedule.findMany({
      where: {
        date: targetDate,
        coach: coachWhere,
      },
      include: {
        coach: { select: { id: true, name: true, dxTag: true } },
      },
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
    prisma.dxAssignment.findMany({
      where: { date: targetDate },
      select: { coachId: true, trackName: true },
    }),
  ])

  // Build busy map: coachId → intervals
  const busyMap = new Map<string, { startTime: string; endTime: string }[]>()
  for (const b of busySchedules) {
    if (!busyMap.has(b.coachId)) busyMap.set(b.coachId, [])
    busyMap.get(b.coachId)!.push({ startTime: b.startTime, endTime: b.endTime })
  }

  // Assignment map: coachId → trackName
  const assignmentMap = new Map<string, string>()
  for (const a of existingAssignments) {
    assignmentMap.set(a.coachId, a.trackName)
  }

  // Group avail schedules by coach
  const coachAvailMap = new Map<string, {
    id: string; name: string; dxTag: string | null
    intervals: { startTime: string; endTime: string }[]
  }>()
  for (const s of availSchedules) {
    if (!coachAvailMap.has(s.coachId)) {
      coachAvailMap.set(s.coachId, {
        id: s.coach.id,
        name: s.coach.name,
        dxTag: s.coach.dxTag,
        intervals: [],
      })
    }
    coachAvailMap.get(s.coachId)!.intervals.push({
      startTime: s.startTime,
      endTime: s.endTime,
    })
  }

  // Count current month assignments per coach
  const monthStart = new Date(Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    1,
  ))
  const monthEnd = new Date(Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    0,
  ))

  const coachIds = Array.from(coachAvailMap.keys())
  const monthAssignments = coachIds.length > 0
    ? await prisma.dxAssignment.groupBy({
        by: ['coachId'],
        where: {
          coachId: { in: coachIds },
          date: { gte: monthStart, lte: monthEnd },
        },
        _count: true,
      })
    : []

  const monthCountMap = new Map<string, number>()
  for (const ma of monthAssignments) {
    monthCountMap.set(ma.coachId, ma._count)
  }

  // DX work hours: 09:00~18:00
  const dxRange = toBitmap([{ startTime: '09:00', endTime: '18:00' }])

  const candidates: {
    coachId: string
    coachName: string
    dxTag: string | null
    assignedTrack: string | null
    currentMonthAssignments: number
  }[] = []

  for (const [coachId, entry] of coachAvailMap) {
    const availBm = toBitmap(entry.intervals)
    const busyIntervals = busyMap.get(coachId) || []
    const busyBm = toBitmap(busyIntervals)
    const remainBm = clearOverlappingPeriods(subtractBitmap(availBm, busyBm), busyBm)

    // Check 09:00~18:00 availability
    const dxAvail = remainBm.map((v, i) => v && dxRange[i])
    if (!hasAvailability(dxAvail)) continue

    candidates.push({
      coachId: entry.id,
      coachName: entry.name,
      dxTag: entry.dxTag,
      assignedTrack: assignmentMap.get(coachId) ?? null,
      currentMonthAssignments: monthCountMap.get(coachId) ?? 0,
    })
  }

  return NextResponse.json({ date: dateStr, candidates })
}
