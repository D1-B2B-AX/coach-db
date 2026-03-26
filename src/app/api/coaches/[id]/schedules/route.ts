import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { toDateOnly } from '@/lib/date-utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/coaches/:id/schedules?yearMonth=2026-03
// Manager-facing: fetch a coach's schedules + access log for a given month
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const yearMonth = searchParams.get('yearMonth')

  if (!yearMonth || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) {
    return NextResponse.json(
      { error: 'Invalid yearMonth format. Expected YYYY-MM' },
      { status: 400 }
    )
  }

  // Verify coach exists
  const coach = await prisma.coach.findUnique({
    where: { id, deletedAt: null },
    select: { id: true },
  })
  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = toDateOnly(`${yearMonth}-01`)
  const endDate = toDateOnly(`${yearMonth}-${String(lastDay).padStart(2, '0')}`)

  const [schedules, engagementSchedules, accessLog] = await Promise.all([
    prisma.coachSchedule.findMany({
      where: {
        coachId: id,
        date: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { date: 'asc' },
    }),
    prisma.engagementSchedule.findMany({
      where: {
        coachId: id,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        engagement: { select: { courseName: true, status: true } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.scheduleAccessLog.findUnique({
      where: {
        coachId_yearMonth: { coachId: id, yearMonth },
      },
      select: {
        accessedAt: true,
        lastEditedAt: true,
        yearMonth: true,
      },
    }),
  ])

  return NextResponse.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    engagementSchedules: engagementSchedules.map((es) => ({
      date: es.date.toISOString().split('T')[0],
      startTime: es.startTime,
      endTime: es.endTime,
      courseName: es.engagement.courseName,
      status: es.engagement.status,
    })),
    accessLog: accessLog
      ? {
          yearMonth: accessLog.yearMonth,
          accessedAt: accessLog.accessedAt.toISOString(),
          lastEditedAt: accessLog.lastEditedAt?.toISOString() ?? null,
        }
      : null,
  })
}
