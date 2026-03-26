import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/coaches/:id/engagements — list all engagements for a coach
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check coach exists and not deleted
  const coach = await prisma.coach.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })
  if (!coach || coach.deletedAt) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  const engagements = await prisma.engagement.findMany({
    where: { coachId: id },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json({ engagements })
}

// POST /api/coaches/:id/engagements — create a new engagement
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check coach exists and not deleted
  const coach = await prisma.coach.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })
  if (!coach || coach.deletedAt) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    courseName,
    status,
    startDate,
    endDate,
    startTime,
    endTime,
    location,
    rating,
    feedback,
    rehire,
    hiredBy,
  } = body as {
    courseName?: string
    status?: string
    startDate?: string
    endDate?: string
    startTime?: string | null
    endTime?: string | null
    location?: string | null
    rating?: number | null
    feedback?: string | null
    rehire?: boolean | null
    hiredBy?: string | null
  }

  // Validate required fields
  if (!courseName?.trim()) {
    return NextResponse.json({ error: 'courseName is required' }, { status: 400 })
  }
  if (!startDate) {
    return NextResponse.json({ error: 'startDate is required' }, { status: 400 })
  }
  if (!endDate) {
    return NextResponse.json({ error: 'endDate is required' }, { status: 400 })
  }

  // Validate rating range if provided
  if (rating != null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
    return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
  }

  const engagement = await prisma.engagement.create({
    data: {
      coachId: id,
      courseName: courseName.trim(),
      status: (status as 'scheduled' | 'in_progress' | 'completed' | 'cancelled') ?? 'scheduled',
      startDate: new Date(startDate + 'T12:00:00Z'),
      endDate: new Date(endDate + 'T12:00:00Z'),
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      location: location ?? null,
      rating: rating ?? null,
      feedback: feedback ?? null,
      rehire: rehire ?? null,
      hiredBy: hiredBy ?? null,
    },
  })

  // Auto-generate EngagementSchedule records for weekdays (Mon-Fri)
  const start = new Date(startDate + 'T12:00:00Z')
  const end = new Date(endDate + 'T12:00:00Z')
  const scheduleData: { engagementId: string; coachId: string; date: Date; startTime: string; endTime: string }[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const dow = cursor.getUTCDay()
    if (dow >= 1 && dow <= 5) {
      scheduleData.push({
        engagementId: engagement.id,
        coachId: id,
        date: new Date(cursor),
        startTime: startTime || '09:00',
        endTime: endTime || '18:00',
      })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  if (scheduleData.length > 0) {
    await prisma.engagementSchedule.createMany({ data: scheduleData })
  }

  return NextResponse.json(engagement, { status: 201 })
}
