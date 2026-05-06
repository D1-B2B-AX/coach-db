import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { fetchDxTracks, DxTrack } from '@/lib/sync/samsung-dx-tracks'

// ─── 5-minute cache for DX tracks ───
let cache: { data: DxTrack[]; expiry: number } | null = null

async function getCachedTracks(year: number): Promise<DxTrack[]> {
  const now = Date.now()
  if (cache && cache.expiry > now) return cache.data
  const data = await fetchDxTracks(year)
  cache = { data, expiry: now + 5 * 60 * 1000 }
  return data
}

// GET /api/dx-assignment/tracks?yearMonth=2026-05
export async function GET(request: NextRequest) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const yearMonth = request.nextUrl.searchParams.get('yearMonth')
  if (!yearMonth || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) {
    return NextResponse.json({ error: 'Invalid yearMonth format' }, { status: 400 })
  }

  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)

  const allTracks = await getCachedTracks(year)

  // Filter tracks that overlap with the target month
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(year, month, 0)) // last day of month

  const filtered = allTracks.filter((t) => {
    const tStart = new Date(t.startDate)
    const tEnd = new Date(t.endDate)
    return tStart <= monthEnd && tEnd >= monthStart
  })

  // Fetch current assignments for these tracks in this month range
  const trackNames = filtered.map((t) => t.trackName)
  const assignments = trackNames.length > 0
    ? await prisma.dxAssignment.findMany({
        where: {
          trackName: { in: trackNames },
          date: { gte: monthStart, lte: monthEnd },
        },
        include: { coach: { select: { id: true, name: true } } },
      })
    : []

  // Group assignments by trackName, deduplicate coaches
  const assignmentMap = new Map<string, { coachId: string; coachName: string; isAuto: boolean }[]>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.trackName)) assignmentMap.set(a.trackName, [])
    const list = assignmentMap.get(a.trackName)!
    if (!list.some((c) => c.coachId === a.coach.id)) {
      list.push({
        coachId: a.coach.id,
        coachName: a.coach.name,
        isAuto: a.isAuto,
      })
    }
  }

  const tracks = filtered.map((t) => ({
    trackName: t.trackName,
    track: t.track,
    className: t.className,
    round: t.round,
    startDate: t.startDate.toISOString().slice(0, 10),
    endDate: t.endDate.toISOString().slice(0, 10),
    coaches: assignmentMap.get(t.trackName) ?? [],
  }))

  return NextResponse.json({ tracks })
}
