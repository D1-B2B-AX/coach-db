import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { logChanges } from '@/lib/audit'

/**
 * PATCH /api/admin/content-moderation/[id]
 * 콘텐츠 수정 (memo: managerNote, review: feedback/rating)
 *
 * Body: { sourceTable: "coaches" | "engagements", text?: string, rating?: number }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { sourceTable, text, rating } = body

  if (sourceTable === 'audit_logs') {
    return NextResponse.json({ error: 'audit_log는 수정할 수 없습니다' }, { status: 400 })
  }

  if (sourceTable === 'coaches') {
    const coach = await prisma.coach.findUnique({
      where: { id },
      select: { id: true, managerNote: true },
    })
    if (!coach) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const oldData = { managerNote: coach.managerNote }
    const newData = { managerNote: text ?? null }

    await prisma.coach.update({
      where: { id },
      data: { managerNote: newData.managerNote },
    })

    await logChanges({
      tableName: 'coaches',
      recordId: id,
      action: 'update',
      oldData,
      newData,
      changedBy: auth.manager.email,
      fields: ['managerNote'],
    })

    return NextResponse.json({ success: true })
  }

  if (sourceTable === 'engagements') {
    const engagement = await prisma.engagement.findUnique({
      where: { id },
      select: { id: true, feedback: true, rating: true },
    })
    if (!engagement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const oldData = { feedback: engagement.feedback, rating: engagement.rating }
    const newData: Record<string, any> = {}
    if (text !== undefined) newData.feedback = text
    if (rating !== undefined) newData.rating = rating

    await prisma.engagement.update({
      where: { id },
      data: newData,
    })

    await logChanges({
      tableName: 'engagements',
      recordId: id,
      action: 'update',
      oldData,
      newData,
      changedBy: auth.manager.email,
      fields: Object.keys(newData),
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid sourceTable' }, { status: 400 })
}

/**
 * DELETE /api/admin/content-moderation/[id]
 * 콘텐츠 삭제 (필드를 null로 설정, logChanges로 원본 보존)
 *
 * Body: { sourceTable: "coaches" | "engagements" }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { sourceTable } = body

  if (sourceTable === 'audit_logs') {
    return NextResponse.json({ error: 'audit_log는 수정할 수 없습니다' }, { status: 400 })
  }

  if (sourceTable === 'coaches') {
    const coach = await prisma.coach.findUnique({
      where: { id },
      select: { id: true, managerNote: true },
    })
    if (!coach) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await logChanges({
      tableName: 'coaches',
      recordId: id,
      action: 'update',
      oldData: { managerNote: coach.managerNote },
      newData: { managerNote: null },
      changedBy: auth.manager.email,
      fields: ['managerNote'],
    })

    await prisma.coach.update({
      where: { id },
      data: { managerNote: null },
    })

    return NextResponse.json({ success: true })
  }

  if (sourceTable === 'engagements') {
    const engagement = await prisma.engagement.findUnique({
      where: { id },
      select: { id: true, feedback: true, rating: true },
    })
    if (!engagement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await logChanges({
      tableName: 'engagements',
      recordId: id,
      action: 'update',
      oldData: { feedback: engagement.feedback, rating: engagement.rating },
      newData: { feedback: null, rating: null },
      changedBy: auth.manager.email,
      fields: ['feedback', 'rating'],
    })

    await prisma.engagement.update({
      where: { id },
      data: { feedback: null, rating: null },
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid sourceTable' }, { status: 400 })
}
