import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'
import { logAccess } from '@/lib/access-log'
import { formatScoutingDisplay } from '@/lib/company-alias'

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
          hireStart: true,
          hireEnd: true,
          manager: { select: { name: true, email: true } },
          course: { select: { location: true, hourlyRate: true, remarks: true } },
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
    const managerName = typeof data.managerName === 'string' && data.managerName.trim()
      ? data.managerName.trim()
      : scouting.manager.name
    const managerEmail = typeof data.managerEmail === 'string' && data.managerEmail.trim()
      ? data.managerEmail.trim()
      : scouting.manager.email
    const date = scouting.date.toISOString().slice(0, 10)
    const hireStart = scouting.hireStart ?? null
    const hireEnd = scouting.hireEnd ?? null

    let displayText: string | null = formatScoutingDisplay({
      date,
      managerName,
      managerEmail,
      courseName,
      companyAlias: null,
      restCourseName: null,
      hireStart,
      hireEnd,
    })
    if (displayText === '') displayText = null

    return {
      ...base,
      data: {
        ...(data as Record<string, unknown>),
        hireStart,
        hireEnd,
        managerEmail,
      },
      enriched: (() => {
        const raw = scouting.note ?? ''
        const cdMatch = raw.match(/\[과정설명\]\s*([\s\S]*?)(?=\n\[기타\]|$)/)
        const exMatch = raw.match(/\[기타\]\s*([\s\S]*?)$/)
        const hasMark = cdMatch || exMatch
        return {
          displayText,
          courseName,
          note: scouting.note,
          courseDescription: hasMark ? (cdMatch?.[1]?.trim() || null) : (raw.trim() || null),
          extraNote: hasMark ? (exMatch?.[1]?.trim() || null) : null,
          location: scouting.course?.location ?? null,
          hourlyRate: scouting.course?.hourlyRate ?? null,
          remarks: scouting.course?.remarks ?? null,
          managerName: managerName ?? null,
        }
      })(),
    }
  })

  return NextResponse.json({ notifications: enriched })
}
