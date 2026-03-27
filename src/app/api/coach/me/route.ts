import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'

// GET /api/coach/me — returns coach profile (token auth)
export async function GET(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const data = await prisma.coach.findUnique({
    where: { id: coach.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      workType: true,
      affiliation: true,
      selfNote: true,
      availabilityDetail: true,
      fields: { include: { field: true } },
      curriculums: { include: { curriculum: true } },
    },
  })

  if (!data) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })

  return NextResponse.json({
    ...data,
    fields: data.fields.map(f => ({ id: f.field.id, name: f.field.name })),
    curriculums: data.curriculums.map(c => ({ id: c.curriculum.id, name: c.curriculum.name })),
  })
}

// PUT /api/coach/me — update coach profile (token auth)
export async function PUT(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const body = await request.json()
  const { phone, workType, availabilityDetail, fields, curriculums } = body as {
    phone?: string | null
    workType?: string | null
    availabilityDetail?: string | null
    fields?: string[]
    curriculums?: string[]
  }

  const updateData: Record<string, unknown> = {}
  if (phone !== undefined) updateData.phone = phone
  if (workType !== undefined) updateData.workType = workType
  if (availabilityDetail !== undefined) updateData.availabilityDetail = availabilityDetail

  // Resolve field/curriculum IDs outside transaction
  const fieldIds: string[] = []
  if (fields !== undefined && Array.isArray(fields)) {
    for (const name of fields) {
      const trimmed = name.trim()
      if (!trimmed) continue
      const rec = await prisma.field.upsert({ where: { name: trimmed }, create: { name: trimmed }, update: {} })
      fieldIds.push(rec.id)
    }
  }

  const curriculumIds: string[] = []
  if (curriculums !== undefined && Array.isArray(curriculums)) {
    for (const name of curriculums) {
      const trimmed = name.trim()
      if (!trimmed) continue
      const rec = await prisma.curriculum.upsert({ where: { name: trimmed }, create: { name: trimmed }, update: {} })
      curriculumIds.push(rec.id)
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.coach.update({ where: { id: coach.id }, data: updateData })
    }

    if (fields !== undefined) {
      await tx.coachField.deleteMany({ where: { coachId: coach.id } })
      if (fieldIds.length > 0) {
        await tx.coachField.createMany({ data: fieldIds.map(fid => ({ coachId: coach.id, fieldId: fid })) })
      }
    }

    if (curriculums !== undefined) {
      await tx.coachCurriculum.deleteMany({ where: { coachId: coach.id } })
      if (curriculumIds.length > 0) {
        await tx.coachCurriculum.createMany({ data: curriculumIds.map(cid => ({ coachId: coach.id, curriculumId: cid })) })
      }
    }
  })

  return NextResponse.json({ success: true })
}
