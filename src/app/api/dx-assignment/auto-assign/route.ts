import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { fetchDxTracks, DxTrack } from '@/lib/sync/samsung-dx-tracks'
import { toBitmap, subtractBitmap, clearOverlappingPeriods, hasAvailability } from '@/lib/schedule-bitmap'
import { getSamsungExclusions } from '@/lib/samsung-config'

const MAX_PER_TRACK = 2

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

  let resolvedYearMonth: string
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    resolvedYearMonth = date.slice(0, 7)
  } else {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth!)) {
      return NextResponse.json({ error: 'Invalid yearMonth format' }, { status: 400 })
    }
    resolvedYearMonth = yearMonth!
  }

  const { excludeDX } = getSamsungExclusions(resolvedYearMonth)
  if (excludeDX) {
    return NextResponse.json({ created: 0, skipped: 0 })
  }

  const year = Number(resolvedYearMonth.split('-')[0])
  const monthNum = Number(resolvedYearMonth.split('-')[1])
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1))
  const monthEnd = new Date(Date.UTC(year, monthNum, 0))
  const allTracks = await getCachedTracks(year)
  const dxRange = toBitmap([{ startTime: '09:00', endTime: '18:00' }])

  // Find tracks active in the target period
  let activeTracks: DxTrack[]
  if (date) {
    const d = new Date(date + 'T12:00:00Z')
    activeTracks = allTracks.filter((t) => t.startDate <= d && t.endDate >= d)
  } else {
    activeTracks = allTracks.filter((t) => t.startDate <= monthEnd && t.endDate >= monthStart)
  }
  if (activeTracks.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0 })
  }

  // Build dates per track (clamped to month boundaries)
  const trackDatesMap = new Map<string, Date[]>()
  for (const track of activeTracks) {
    const start = track.startDate < monthStart ? monthStart : track.startDate
    const end = track.endDate > monthEnd ? monthEnd : track.endDate
    const dates: Date[] = []
    const cur = new Date(start)
    while (cur <= end) {
      dates.push(new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate(), 12)))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    trackDatesMap.set(track.trackName, dates)
  }

  // Collect all unique dates
  const allDatesSet = new Set<number>()
  for (const dates of trackDatesMap.values()) {
    for (const d of dates) allDatesSet.add(d.getTime())
  }
  const allDates = [...allDatesSet].sort().map((t) => new Date(t))

  // For each date, compute available DX coach IDs
  const availByDate = new Map<number, Map<string, { id: string; name: string }>>()

  for (const targetDate of allDates) {
    const [availSchedules, busySchedules] = await Promise.all([
      prisma.coachSchedule.findMany({
        where: {
          date: targetDate,
          coach: { status: 'active', deletedAt: null, workType: { contains: '삼전 DX' } },
        },
        include: { coach: { select: { id: true, name: true } } },
      }),
      prisma.engagementSchedule.findMany({
        where: {
          date: targetDate,
          engagement: { status: { in: ['scheduled', 'in_progress', 'completed'] } },
        },
        select: { coachId: true, startTime: true, endTime: true },
      }),
    ])

    const busyMap = new Map<string, { startTime: string; endTime: string }[]>()
    for (const b of busySchedules) {
      if (!busyMap.has(b.coachId)) busyMap.set(b.coachId, [])
      busyMap.get(b.coachId)!.push({ startTime: b.startTime, endTime: b.endTime })
    }

    const coachAvailMap = new Map<string, { id: string; name: string; intervals: { startTime: string; endTime: string }[] }>()
    for (const s of availSchedules) {
      if (!coachAvailMap.has(s.coachId)) {
        coachAvailMap.set(s.coachId, { id: s.coach.id, name: s.coach.name, intervals: [] })
      }
      coachAvailMap.get(s.coachId)!.intervals.push({ startTime: s.startTime, endTime: s.endTime })
    }

    const available = new Map<string, { id: string; name: string }>()
    for (const [coachId, entry] of coachAvailMap) {
      const availBm = toBitmap(entry.intervals)
      const busyBm = toBitmap(busyMap.get(coachId) || [])
      const remainBm = clearOverlappingPeriods(subtractBitmap(availBm, busyBm), busyBm)
      if (!hasAvailability(remainBm.map((v, i) => v && dxRange[i]))) continue
      available.set(coachId, { id: entry.id, name: entry.name })
    }

    availByDate.set(targetDate.getTime(), available)
  }

  // Per track: find coaches available on ALL dates of that track
  const trackNames = activeTracks.map((t) => t.trackName)
  const coachesPerTrack = new Map<string, Map<string, { id: string; name: string }>>()
  for (const [trackName, dates] of trackDatesMap) {
    let common: Map<string, { id: string; name: string }> | null = null
    for (const d of dates) {
      const available = availByDate.get(d.getTime())!
      if (common === null) {
        common = new Map(available)
      } else {
        for (const id of common.keys()) {
          if (!available.has(id)) common.delete(id)
        }
      }
    }
    coachesPerTrack.set(trackName, common ?? new Map())
  }

  // Get existing manual assignments + month counts
  const [existingAssignments, monthAssignments] = await Promise.all([
    prisma.dxAssignment.findMany({
      where: { trackName: { in: trackNames }, date: { in: allDates }, isAuto: false },
      select: { trackName: true, coachId: true },
    }),
    prisma.dxAssignment.groupBy({
      by: ['coachId'],
      where: { date: { gte: monthStart, lte: monthEnd }, isAuto: false },
      _count: true,
    }),
  ])

  const monthCountMap = new Map<string, number>()
  for (const ma of monthAssignments) monthCountMap.set(ma.coachId, ma._count)

  // Deduplicate manual assignments per track
  const manualPerTrack = new Map<string, Set<string>>()
  for (const ea of existingAssignments) {
    if (!manualPerTrack.has(ea.trackName)) manualPerTrack.set(ea.trackName, new Set())
    manualPerTrack.get(ea.trackName)!.add(ea.coachId)
  }

  // Assign 2 coaches per track (fewest candidates first, least monthly assignments first)
  const sortedTracks = [...trackNames].sort((a, b) => {
    const ca = coachesPerTrack.get(a)?.size ?? 0
    const cb = coachesPerTrack.get(b)?.size ?? 0
    if (ca !== cb) return ca - cb
    return a.localeCompare(b)
  })

  const globalPool = new Set<string>()
  for (const coaches of coachesPerTrack.values()) {
    for (const id of coaches.keys()) globalPool.add(id)
  }

  // Remove manually assigned coaches from pool
  for (const coachIds of manualPerTrack.values()) {
    for (const id of coachIds) globalPool.delete(id)
  }

  const trackAssignments: { trackName: string; coachId: string }[] = []

  for (const trackName of sortedTracks) {
    const manualCount = manualPerTrack.get(trackName)?.size ?? 0
    const remaining = MAX_PER_TRACK - manualCount
    if (remaining <= 0) continue

    const trackCoaches = coachesPerTrack.get(trackName) ?? new Map()
    const candidates = [...trackCoaches.keys()]
      .filter((id) => globalPool.has(id))
      .map((id) => ({
        id,
        name: trackCoaches.get(id)!.name,
        monthAssignments: monthCountMap.get(id) ?? 0,
      }))
      .sort((a, b) => {
        if (a.monthAssignments !== b.monthAssignments) return a.monthAssignments - b.monthAssignments
        return a.name.localeCompare(b.name)
      })

    for (const coach of candidates.slice(0, remaining)) {
      trackAssignments.push({ trackName, coachId: coach.id })
      globalPool.delete(coach.id)
    }
  }

  // Delete existing auto assignments, then create new ones
  await prisma.dxAssignment.deleteMany({
    where: { trackName: { in: trackNames }, date: { in: allDates }, isAuto: true },
  })

  const newRows: { trackName: string; date: Date; coachId: string; assignedBy: string; isAuto: boolean }[] = []
  for (const { trackName, coachId } of trackAssignments) {
    for (const d of trackDatesMap.get(trackName) ?? []) {
      newRows.push({ trackName, date: d, coachId, assignedBy: 'auto', isAuto: true })
    }
  }

  if (newRows.length > 0) {
    await prisma.dxAssignment.createMany({ data: newRows })
  }

  return NextResponse.json({ created: newRows.length, trackAssignments: trackAssignments.length })
}
