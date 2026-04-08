import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/admin/deleted-coaches — list soft-deleted coaches
export async function GET() {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const coaches = await prisma.coach.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      affiliation: true,
      status: true,
      deletedAt: true,
      deletedBy: true,
    },
  })

  return NextResponse.json({ coaches })
}

// PUT /api/admin/deleted-coaches — restore a coach
export async function PUT(request: NextRequest) {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { id } = body as { id: string }

  try {
    const coach = await prisma.coach.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null },
      select: { id: true, name: true },
    })
    return NextResponse.json(coach)
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: '해당 코치를 찾을 수 없습니다' }, { status: 404 })
    }
    throw e
  }
}

// DELETE /api/admin/deleted-coaches — permanently delete a coach
export async function DELETE(request: NextRequest) {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  let delBody: Record<string, unknown>
  try { delBody = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { id } = delBody as { id: string }

  // Only allow permanent delete of already soft-deleted coaches
  const coach = await prisma.coach.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })

  if (!coach || !coach.deletedAt) {
    return NextResponse.json({ error: '삭제된 코치만 완전 삭제할 수 있습니다' }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.coachSchedule.deleteMany({ where: { coachId: id } }),
    prisma.coach.delete({ where: { id } }),
  ])

  return NextResponse.json({ success: true })
}
