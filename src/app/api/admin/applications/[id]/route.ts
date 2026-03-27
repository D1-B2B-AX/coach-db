import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { action, reason } = await request.json() as { action: 'approve' | 'reject'; reason?: string }

  const coach = await prisma.coach.findUnique({
    where: { id },
    select: { id: true, status: true, deletedAt: true, managerNote: true },
  })
  if (!coach || coach.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (coach.status !== 'pending') return NextResponse.json({ error: '이미 처리된 신청입니다' }, { status: 400 })

  if (action === 'approve') {
    await prisma.coach.update({ where: { id }, data: { status: 'active' } })
    return NextResponse.json({ success: true, status: 'active' })
  } else {
    const note = reason ? `[거절 사유] ${reason}` : null
    const managerNote = [coach.managerNote, note].filter(Boolean).join('\n') || null
    await prisma.coach.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: auth.manager.email, managerNote },
    })
    return NextResponse.json({ success: true, status: 'rejected' })
  }
}
