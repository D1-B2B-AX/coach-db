import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { generateAccessToken } from '@/lib/coach-auth'
import { toDateOnly } from '@/lib/date-utils'
import type { Prisma } from '@/generated/prisma/client'

// GET /api/coaches — list coaches with filtering
export async function GET(request: NextRequest) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search')
  const field = searchParams.get('field')
  const status = searchParams.get('status')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
  const skip = (page - 1) * limit

  const where: Prisma.CoachWhereInput = {
    deletedAt: null,
  }

  // Search across name, phone, email
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Filter by field name
  if (field) {
    where.fields = {
      some: {
        field: { name: field },
      },
    }
  }

  // Filter by status
  if (status) {
    where.status = status as Prisma.CoachWhereInput['status']
  }

  const [coaches, total] = await Promise.all([
    prisma.coach.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        fields: {
          include: { field: true },
        },
        curriculums: {
          include: { curriculum: true },
        },
        engagements: {
          orderBy: { endDate: 'desc' },
          take: 1,
          select: {
            courseName: true,
            endDate: true,
            rating: true,
          },
        },
        _count: {
          select: { engagements: true },
        },
      },
    }),
    prisma.coach.count({ where }),
  ])

  // Compute average rating per coach from all engagements
  const coachIds = coaches.map((c) => c.id)
  const ratingAggregates = coachIds.length > 0
    ? await prisma.engagement.groupBy({
        by: ['coachId'],
        where: {
          coachId: { in: coachIds },
          rating: { not: null },
        },
        _avg: { rating: true },
      })
    : []

  const ratingMap = new Map(
    ratingAggregates.map((r) => [r.coachId, r._avg.rating])
  )

  // Compute work days (distinct dates in coach_schedules) per coach for last 6 months
  const _6m = new Date()
  _6m.setMonth(_6m.getMonth() - 6)
  const sixMonthsAgo = toDateOnly(`${_6m.getFullYear()}-${String(_6m.getMonth() + 1).padStart(2, '0')}-01`)
  const workDayCounts = coachIds.length > 0
    ? await prisma.coachSchedule.groupBy({
        by: ['coachId'],
        where: {
          coachId: { in: coachIds },
          date: { gte: sixMonthsAgo },
        },
        _count: { date: true },
      })
    : []
  const workDayMap = new Map(
    workDayCounts.map((r) => [r.coachId, r._count.date])
  )

  const result = coaches.map((coach) => {
    const latestEngagement = coach.engagements[0] || null
    return {
      id: coach.id,
      name: coach.name,
      phone: coach.phone,
      email: coach.email,
      affiliation: coach.affiliation,
      workType: coach.workType,
      status: coach.status,
      fields: coach.fields.map((cf) => ({
        id: cf.field.id,
        name: cf.field.name,
      })),
      curriculums: coach.curriculums.map((cc) => ({
        id: cc.curriculum.id,
        name: cc.curriculum.name,
      })),
      engagementCount: (coach as any)._count?.engagements ?? 0,
      workDays: workDayMap.get(coach.id) ?? 0,
      avgRating: ratingMap.get(coach.id) ?? null,
      latestEngagement: latestEngagement
        ? {
            courseName: latestEngagement.courseName,
            endDate: latestEngagement.endDate,
          }
        : null,
    }
  })

  return NextResponse.json({ coaches: result, total })
}

// POST /api/coaches — create a new coach
export async function POST(request: NextRequest) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, birthDate, phone, email, affiliation, workType, hourlyRate, status, selfNote, managerNote, fields, curriculums } = body as {
    name?: string
    birthDate?: string
    phone?: string
    email?: string
    affiliation?: string
    workType?: string
    hourlyRate?: number
    status?: string
    selfNote?: string
    managerNote?: string
    fields?: string[]
    curriculums?: string[]
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const accessToken = generateAccessToken()

  const coach = await prisma.$transaction(async (tx) => {
    const created = await tx.coach.create({
      data: {
        name: name.trim(),
        birthDate: birthDate ? toDateOnly(birthDate) : undefined,
        phone: phone || undefined,
        email: email || undefined,
        affiliation: affiliation || undefined,
        workType: workType as any || undefined,
        hourlyRate: hourlyRate != null ? Number(hourlyRate) : undefined,
        status: (status as any) || 'active',
        selfNote: selfNote || undefined,
        managerNote: managerNote || undefined,
        accessToken,
      },
    })

    // Connect or create fields
    if (fields && Array.isArray(fields) && fields.length > 0) {
      for (const fieldName of fields) {
        const trimmed = fieldName.trim()
        if (!trimmed) continue
        const fieldRecord = await tx.field.upsert({
          where: { name: trimmed },
          create: { name: trimmed },
          update: {},
        })
        await tx.coachField.create({
          data: { coachId: created.id, fieldId: fieldRecord.id },
        })
      }
    }

    // Connect or create curriculums
    if (curriculums && Array.isArray(curriculums) && curriculums.length > 0) {
      for (const currName of curriculums) {
        const trimmed = currName.trim()
        if (!trimmed) continue
        const currRecord = await tx.curriculum.upsert({
          where: { name: trimmed },
          create: { name: trimmed },
          update: {},
        })
        await tx.coachCurriculum.create({
          data: { coachId: created.id, curriculumId: currRecord.id },
        })
      }
    }

    // Re-fetch with relations
    return tx.coach.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        fields: { include: { field: true } },
        curriculums: { include: { curriculum: true } },
      },
    })
  })

  return NextResponse.json(
    {
      ...coach,
      accessToken,
      fields: coach.fields.map((cf) => ({ id: cf.field.id, name: cf.field.name })),
      curriculums: coach.curriculums.map((cc) => ({ id: cc.curriculum.id, name: cc.curriculum.name })),
    },
    { status: 201 }
  )
}
