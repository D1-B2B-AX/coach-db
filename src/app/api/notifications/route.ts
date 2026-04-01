import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/notifications — 매니저 알림 목록
export async function GET(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true'

  const notifications = await prisma.notification.findMany({
    where: {
      managerId: auth.manager.id,
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
