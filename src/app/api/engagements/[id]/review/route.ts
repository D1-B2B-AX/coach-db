import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const engagement = await prisma.engagement.findUnique({ where: { id } })
  if (!engagement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (engagement.hiredBy !== auth.manager.name) {
    return NextResponse.json({ error: '본인이 담당한 이력만 평가할 수 있습니다' }, { status: 403 })
  }

  const { rating, feedback, rehire } = await request.json()

  if (rating !== undefined && rating !== null && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
    return NextResponse.json({ error: '별점은 1~5 사이여야 합니다' }, { status: 400 })
  }

  const updated = await prisma.engagement.update({
    where: { id },
    data: {
      ...(rating !== undefined && { rating }),
      ...(feedback !== undefined && { feedback: feedback || null }),
      ...(rehire !== undefined && { rehire }),
    },
  })

  await prisma.auditLog.create({
    data: {
      tableName: 'engagements',
      recordId: id,
      action: 'update',
      field: 'review',
      oldValue: JSON.stringify({ rating: engagement.rating, feedback: engagement.feedback, rehire: engagement.rehire }),
      newValue: JSON.stringify({ rating: updated.rating, feedback: updated.feedback, rehire: updated.rehire }),
      changedBy: auth.manager.email,
    },
  })

  return NextResponse.json(updated)
}
