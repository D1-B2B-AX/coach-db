import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'
import { toDateOnly } from '@/lib/date-utils'

type RouteParams = { params: Promise<{ yearMonth: string }> }

function parseYearMonth(yearMonth: string) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) return null
  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = toDateOnly(`${yearMonth}-01`)
  const endDate = toDateOnly(`${yearMonth}-${String(lastDay).padStart(2, '0')}`)
  return { year, month, startDate, endDate }
}

// GET /api/coach/schedule/:yearMonth — returns coach schedules + engagements for the month
export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { yearMonth } = await params
  const parsed = parseYearMonth(yearMonth)
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid yearMonth format. Expected YYYY-MM' },
      { status: 400 }
    )
  }

  const { startDate, endDate } = parsed

  // Fetch schedules, engagements, engagement_schedules in parallel
  const [schedules, engagements, engagementSchedules, accessLog] = await Promise.all([
    prisma.coachSchedule.findMany({
      where: {
        coachId: coach.id,
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
    prisma.engagement.findMany({
      where: {
        coachId: coach.id,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: {
        id: true,
        courseName: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        location: true,
        status: true,
      },
      orderBy: { startDate: 'asc' },
    }),
    prisma.engagementSchedule.findMany({
      where: {
        coachId: coach.id,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        engagement: { select: { courseName: true, status: true } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.scheduleAccessLog.findUnique({
      where: {
        coachId_yearMonth: { coachId: coach.id, yearMonth },
      },
      select: { lastEditedAt: true },
    }),
  ])

  // Upsert access log (set accessedAt on first access)
  await prisma.scheduleAccessLog.upsert({
    where: {
      coachId_yearMonth: { coachId: coach.id, yearMonth },
    },
    create: {
      coachId: coach.id,
      yearMonth,
      accessedAt: new Date(),
    },
    update: {
      // Only update accessedAt — don't touch lastEditedAt
      accessedAt: new Date(),
    },
  })

  return NextResponse.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    engagements: engagements.map((e) => ({
      id: e.id,
      courseName: e.courseName,
      startDate: e.startDate.toISOString().split('T')[0],
      endDate: e.endDate.toISOString().split('T')[0],
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      status: e.status,
    })),
    engagementSchedules: engagementSchedules.map((es) => ({
      date: es.date.toISOString().split('T')[0],
      startTime: es.startTime,
      endTime: es.endTime,
      courseName: es.engagement.courseName,
      status: es.engagement.status,
    })),
    lastSavedAt: accessLog?.lastEditedAt?.toISOString() ?? null,
  })
}

// PUT /api/coach/schedule/:yearMonth — replace all schedules for the month
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { yearMonth } = await params
  const parsed = parseYearMonth(yearMonth)
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid yearMonth format. Expected YYYY-MM' },
      { status: 400 }
    )
  }

  const { year, month, startDate, endDate } = parsed

  // Only allow saving for current month and next month
  const now = new Date()
  const currentYM = now.getFullYear() * 12 + now.getMonth()
  const targetYM = year * 12 + (month - 1)
  if (targetYM < currentYM || targetYM > currentYM + 1) {
    return NextResponse.json(
      { error: '현재월과 다음달만 스케줄 입력이 가능합니다' },
      { status: 403 }
    )
  }

  let body: { slots?: Array<{ date: string; startTime: string; endTime: string }> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { slots } = body
  if (!Array.isArray(slots)) {
    return NextResponse.json({ error: 'slots must be an array' }, { status: 400 })
  }

  // Validate each slot
  for (const slot of slots) {
    if (!slot.date || !slot.startTime || !slot.endTime) {
      return NextResponse.json(
        { error: 'Each slot must have date, startTime, and endTime' },
        { status: 400 }
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date)) {
      return NextResponse.json(
        { error: `Invalid date format: ${slot.date}. Expected YYYY-MM-DD` },
        { status: 400 }
      )
    }
    if (!/^\d{2}:\d{2}$/.test(slot.startTime) || !/^\d{2}:\d{2}$/.test(slot.endTime)) {
      return NextResponse.json(
        { error: 'startTime and endTime must be in HH:MM format' },
        { status: 400 }
      )
    }
  }

  // Use transaction: delete existing schedules for this month, insert new ones, update access log
  const result = await prisma.$transaction(async (tx) => {
    // Delete all existing schedules for this coach + month
    await tx.coachSchedule.deleteMany({
      where: {
        coachId: coach.id,
        date: { gte: startDate, lte: endDate },
      },
    })

    // Insert new schedules
    if (slots.length > 0) {
      await tx.coachSchedule.createMany({
        data: slots.map((slot) => ({
          coachId: coach.id,
          date: new Date(slot.date + 'T12:00:00Z'),
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      })
    }

    // Update access log lastEditedAt
    await tx.scheduleAccessLog.upsert({
      where: {
        coachId_yearMonth: { coachId: coach.id, yearMonth },
      },
      create: {
        coachId: coach.id,
        yearMonth,
        accessedAt: now,
        lastEditedAt: now,
      },
      update: {
        lastEditedAt: now,
      },
    })

    return slots.length
  })

  return NextResponse.json({ saved: true, count: result })
}
