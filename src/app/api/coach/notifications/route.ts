import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'
import { logAccess } from '@/lib/access-log'

// GET /api/coach/notifications — 코치 알림 목록
export async function GET(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  logAccess(request, { type: 'coach', id: coach.id, name: coach.name })

  const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true'
  const pendingOnly = request.nextUrl.searchParams.get('pendingOnly') === 'true'
  const type = request.nextUrl.searchParams.get('type')
  const types = type ? type.split(',').map(t => t.trim()).filter(Boolean) : null

  const notifications = await prisma.notification.findMany({
    where: {
      coachId: coach.id,
      ...(unreadOnly && { readAt: null }),
      ...(pendingOnly && { readAt: null, expiredAt: null }),
      ...(types && (types.length === 1 ? { type: types[0] } : { type: { in: types } })),
    },
    orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    take: pendingOnly ? 100 : 50,
  })

  const enriched = notifications.map((n) => ({ ...n, expired: n.expiredAt !== null }))

  return NextResponse.json({ notifications: enriched })
}
