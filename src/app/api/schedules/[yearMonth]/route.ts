import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { toDateOnly } from '@/lib/date-utils'
import { toBitmap, subtractBitmap, clearOverlappingPeriods, hasAvailability } from '@/lib/schedule-bitmap'
import { getSamsungExclusions } from '@/lib/samsung-config'

type RouteParams = { params: Promise<{ yearMonth: string }> }

// GET /api/schedules/:yearMonth — monthly calendar summary (available coach count per day)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { yearMonth } = await params

  const { searchParams } = request.nextUrl
  const timeFilter = searchParams.get('timeFilter')
  const customStartParam = searchParams.get('customStart')
  const customEndParam = searchParams.get('customEnd')

  // Parse time filter — supports comma-separated multiple ranges (e.g. "08-13,18-22")
  let filterRanges: { startTime: string; endTime: string }[] = []
  if (timeFilter && timeFilter !== 'all') {
    if (timeFilter === 'custom' && customStartParam && customEndParam) {
      filterRanges = [{ startTime: customStartParam, endTime: customEndParam }]
    } else {
      for (const part of timeFilter.split(',')) {
        const match = part.trim().match(/^(\d{2})-(\d{2})$/)
        if (match) {
          filterRanges.push({ startTime: `${match[1]}:00`, endTime: `${match[2]}:00` })
        }
      }
    }
  }

  const coachFilter = searchParams.get('coachFilter')

  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) {
    return NextResponse.json({ error: 'Invalid yearMonth format' }, { status: 400 })
  }

  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = toDateOnly(`${yearMonth}-01`)
  const endDate = toDateOnly(`${yearMonth}-${String(lastDay).padStart(2, '0')}`)

  // Build coach filter
  const coachWhere: Record<string, unknown> = { status: 'active', deletedAt: null }

  if (coachFilter === 'exclude-samsung') {
    const { excludeDS, excludeDX } = getSamsungExclusions(yearMonth)
    const notConditions: { workType: { contains: string } }[] = []
    if (excludeDS) notConditions.push({ workType: { contains: '삼전 DS' } })
    if (excludeDX) notConditions.push({ workType: { contains: '삼전 DX' } })
    if (notConditions.length > 0) {
      coachWhere.NOT = notConditions
    }
  } else if (coachFilter === 'samsung-only') {
    coachWhere.OR = [
      { workType: { contains: '삼전 DS' } },
      { workType: { contains: '삼전 DX' } },
    ]
  }

  // Fetch availability + busy schedules in parallel
  const [availSchedules, busySchedules] = await Promise.all([
    prisma.coachSchedule.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        coach: coachWhere,
      },
      select: { date: true, coachId: true, startTime: true, endTime: true },
    }),
    prisma.engagementSchedule.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        engagement: {
          status: { in: ['scheduled', 'in_progress', 'completed'] },
        },
      },
      select: { date: true, coachId: true, startTime: true, endTime: true },
    }),
  ])

  // Group availability by date+coach
  const availMap = new Map<string, Map<string, { startTime: string; endTime: string }[]>>()
  for (const s of availSchedules) {
    const dateStr = s.date.toISOString().split('T')[0]
    if (!availMap.has(dateStr)) availMap.set(dateStr, new Map())
    const cm = availMap.get(dateStr)!
    if (!cm.has(s.coachId)) cm.set(s.coachId, [])
    cm.get(s.coachId)!.push({ startTime: s.startTime, endTime: s.endTime })
  }

  // Group busy by date+coach
  const busyMap = new Map<string, Map<string, { startTime: string; endTime: string }[]>>()
  for (const b of busySchedules) {
    const dateStr = b.date.toISOString().split('T')[0]
    if (!busyMap.has(dateStr)) busyMap.set(dateStr, new Map())
    const cm = busyMap.get(dateStr)!
    if (!cm.has(b.coachId)) cm.set(b.coachId, [])
    cm.get(b.coachId)!.push({ startTime: b.startTime, endTime: b.endTime })
  }

  // Count coaches with remaining availability per day
  const days: Record<string, number> = {}
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`
    const dateAvail = availMap.get(dateStr)
    if (!dateAvail) { days[dateStr] = 0; continue }

    const dateBusy = busyMap.get(dateStr)
    let count = 0

    for (const [coachId, intervals] of dateAvail) {
      const availBm = toBitmap(intervals)
      const busyIntervals = dateBusy?.get(coachId) || []
      const busyBm = toBitmap(busyIntervals)
      let remain = clearOverlappingPeriods(subtractBitmap(availBm, busyBm), busyBm)

      // Apply time filter: coach must have availability in EVERY selected range (AND logic)
      if (filterRanges.length > 0) {
        const passesAll = filterRanges.every(range => {
          const rangeBm = toBitmap([range])
          return remain.some((v, i) => v && rangeBm[i])
        })
        if (!passesAll) continue
      }

      if (hasAvailability(remain)) count++
    }

    days[dateStr] = count
  }

  return NextResponse.json({ yearMonth, days })
}
