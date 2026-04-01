import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/notifications/:id/read
export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const notification = await prisma.notification.findUnique({ where: { id } })

  if (!notification || notification.managerId !== auth.manager.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  })

  return NextResponse.json(updated)
}
