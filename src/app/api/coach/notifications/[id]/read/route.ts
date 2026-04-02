import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/coach/notifications/:id/read
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const notification = await prisma.notification.findUnique({ where: { id } })

  if (!notification || notification.coachId !== coach.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  })

  return NextResponse.json(updated)
}
