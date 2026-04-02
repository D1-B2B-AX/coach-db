import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'
import { formatScoutingDisplay } from '@/lib/company-alias'

// GET /api/coach/notifications — 코치 알림 목록
export async function GET(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true'
  const pendingOnly = request.nextUrl.searchParams.get('pendingOnly') === 'true'
  const type = request.nextUrl.searchParams.get('type')

  const notifications = await prisma.notification.findMany({
    where: {
      coachId: coach.id,
      ...(unreadOnly && { readAt: null }),
      ...(pendingOnly && { readAt: null, expiredAt: null }),
      ...(type && { type }),
    },
    orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    take: pendingOnly ? 100 : 50,
  })

  // Collect scoutingIds from scouting_request notifications (batch fetch)
  const scoutingIds: string[] = []
  for (const n of notifications) {
    if (n.type === 'scouting_request') {
      const data = n.data as Record<string, unknown> | null
      if (data && data.scoutingId && typeof data.scoutingId === 'string') {
        scoutingIds.push(data.scoutingId)
      }
    }
  }

  // Batch fetch scoutings
  const scoutings = scoutingIds.length > 0
    ? await prisma.scouting.findMany({
        where: { id: { in: scoutingIds } },
        select: {
          id: true,
          courseName: true,
          note: true,
          date: true,
          manager: { select: { name: true } },
        },
      })
    : []
  const scoutingMap = new Map(scoutings.map((s) => [s.id, s]))

  const enriched = notifications.map((n) => {
    const base = { ...n, expired: n.expiredAt !== null }

    const data = n.data as Record<string, unknown> | null
    if (n.type !== 'scouting_request' || !data || !data.scoutingId) {
      return base
    }

    const scoutingId = data.scoutingId as string
    const scouting = scoutingMap.get(scoutingId)
    if (!scouting) {
      return base
    }

    const courseName = scouting.courseName ?? null
    const managerName = scouting.manager.name
    const date = scouting.date.toISOString().slice(0, 10)

    let displayText: string | null = formatScoutingDisplay({
      date,
      managerName,
      courseName,
      companyAlias: null,
      restCourseName: null,
    })
    if (displayText === '') displayText = null

    return {
      ...base,
      enriched: { displayText, courseName, note: scouting.note },
    }
  })

  return NextResponse.json({ notifications: enriched })
}
