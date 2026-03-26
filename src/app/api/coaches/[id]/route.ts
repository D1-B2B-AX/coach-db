import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/coaches/:id — full coach detail
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const coach = await prisma.coach.findUnique({
    where: { id, deletedAt: null },
    include: {
      fields: { include: { field: true } },
      curriculums: { include: { curriculum: true } },
      engagements: {
        orderBy: { endDate: 'desc' },
        take: 5,
      },
      _count: {
        select: { documents: true },
      },
    },
  })

  if (!coach) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  // Compute average rating
  const ratingAgg = await prisma.engagement.aggregate({
    where: { coachId: id, rating: { not: null } },
    _avg: { rating: true },
  })

  return NextResponse.json({
    ...coach,
    fields: coach.fields.map((cf) => ({ id: cf.field.id, name: cf.field.name })),
    curriculums: coach.curriculums.map((cc) => ({ id: cc.curriculum.id, name: cc.curriculum.name })),
    documentCount: coach._count.documents,
    avgRating: ratingAgg._avg.rating ?? null,
  })
}

// PUT /api/coaches/:id — update coach
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check coach exists and not deleted
  const existing = await prisma.coach.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, birthDate, phone, email, affiliation, workType, hourlyRate, status, selfNote, managerNote, fields, curriculums } = body as {
    name?: string
    birthDate?: string | null
    phone?: string | null
    email?: string | null
    affiliation?: string | null
    workType?: string | null
    hourlyRate?: number | null
    status?: string
    selfNote?: string | null
    managerNote?: string | null
    fields?: string[]
    curriculums?: string[]
  }

  const coach = await prisma.$transaction(async (tx) => {
    // Build update data — only include fields that were provided
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null
    if (phone !== undefined) updateData.phone = phone
    if (email !== undefined) updateData.email = email
    if (affiliation !== undefined) updateData.affiliation = affiliation
    if (workType !== undefined) updateData.workType = workType
    if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate != null ? Number(hourlyRate) : null
    if (status !== undefined) updateData.status = status
    if (selfNote !== undefined) updateData.selfNote = selfNote
    if (managerNote !== undefined) updateData.managerNote = managerNote

    await tx.coach.update({
      where: { id },
      data: updateData,
    })

    // Reconnect fields if provided
    if (fields !== undefined && Array.isArray(fields)) {
      // Disconnect all existing
      await tx.coachField.deleteMany({ where: { coachId: id } })
      // Connect or create new ones
      for (const fieldName of fields) {
        const trimmed = fieldName.trim()
        if (!trimmed) continue
        const fieldRecord = await tx.field.upsert({
          where: { name: trimmed },
          create: { name: trimmed },
          update: {},
        })
        await tx.coachField.create({
          data: { coachId: id, fieldId: fieldRecord.id },
        })
      }
    }

    // Reconnect curriculums if provided
    if (curriculums !== undefined && Array.isArray(curriculums)) {
      await tx.coachCurriculum.deleteMany({ where: { coachId: id } })
      for (const currName of curriculums) {
        const trimmed = currName.trim()
        if (!trimmed) continue
        const currRecord = await tx.curriculum.upsert({
          where: { name: trimmed },
          create: { name: trimmed },
          update: {},
        })
        await tx.coachCurriculum.create({
          data: { coachId: id, curriculumId: currRecord.id },
        })
      }
    }

    return tx.coach.findUniqueOrThrow({
      where: { id },
      include: {
        fields: { include: { field: true } },
        curriculums: { include: { curriculum: true } },
      },
    })
  })

  return NextResponse.json({
    ...coach,
    fields: coach.fields.map((cf) => ({ id: cf.field.id, name: cf.field.name })),
    curriculums: coach.curriculums.map((cc) => ({ id: cc.curriculum.id, name: cc.curriculum.name })),
  })
}

// DELETE /api/coaches/:id — soft delete
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const existing = await prisma.coach.findUnique({
    where: { id },
    select: { id: true, name: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { confirmName } = body as { confirmName?: string }
  if (!confirmName || confirmName !== existing.name) {
    return NextResponse.json(
      { error: '코치 이름이 일치하지 않습니다' },
      { status: 403 }
    )
  }

  await prisma.coach.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedBy: auth.manager.email,
    },
  })

  return NextResponse.json({ success: true })
}
