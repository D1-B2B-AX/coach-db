import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'

// GET /api/coach/notifications — 코치 알림 목록
export async function GET(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true'

  const notifications = await prisma.notification.findMany({
    where: {
      coachId: coach.id,
      ...(unreadOnly && { readAt: null }),
    },
    orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  })

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      ...n,
      expired: n.expiredAt !== null,
    })),
  })
}
