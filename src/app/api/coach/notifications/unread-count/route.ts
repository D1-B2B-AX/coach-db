import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'

// GET /api/coach/notifications/unread-count
export async function GET(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pendingOnly = request.nextUrl.searchParams.get('pendingOnly') === 'true'
  const type = request.nextUrl.searchParams.get('type')

  const count = await prisma.notification.count({
    where: {
      coachId: coach.id,
      readAt: null,
      ...(pendingOnly && { expiredAt: null }),
      ...(type && { type }),
    },
  })

  return NextResponse.json({ count })
}
