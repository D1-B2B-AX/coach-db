import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ yearMonth: string }> }

// GET /api/schedules/:yearMonth/status — input status for the month
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { yearMonth } = await params

  // Validate yearMonth format (YYYY-MM)
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) {
    return NextResponse.json(
      { error: 'Invalid yearMonth format. Expected YYYY-MM' },
      { status: 400 }
    )
  }

  // Get all active, non-deleted coaches
  const activeCoaches = await prisma.coach.findMany({
    where: {
      status: 'active',
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  })

  // Get access logs for this yearMonth
  const accessLogs = await prisma.scheduleAccessLog.findMany({
    where: { yearMonth },
    select: {
      coachId: true,
      accessedAt: true,
      lastEditedAt: true,
    },
  })

  const logMap = new Map(accessLogs.map((log) => [log.coachId, log]))

  const notAccessedCoaches: { id: string; name: string }[] = []
  const accessedOnlyCoaches: { id: string; name: string }[] = []
  const completedCoaches: { id: string; name: string }[] = []

  for (const coach of activeCoaches) {
    const log = logMap.get(coach.id)
    if (!log) {
      notAccessedCoaches.push({ id: coach.id, name: coach.name })
    } else if (!log.lastEditedAt) {
      accessedOnlyCoaches.push({ id: coach.id, name: coach.name })
    } else {
      completedCoaches.push({ id: coach.id, name: coach.name })
    }
  }

  return NextResponse.json({
    yearMonth,
    status: {
      notAccessed: notAccessedCoaches.length,
      accessedOnly: accessedOnlyCoaches.length,
      completed: completedCoaches.length,
    },
    notAccessedCoaches,
    accessedOnlyCoaches,
    completedCoaches,
  })
}
