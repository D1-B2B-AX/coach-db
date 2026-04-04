import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'
import { logAccess } from '@/lib/access-log'

// GET /api/coach/engagements — returns all engagements for the coach (token auth)
export async function GET(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  logAccess(request, { type: 'coach', id: coach.id, name: coach.name })

  const engagements = await prisma.engagement.findMany({
    where: { coachId: coach.id },
    select: {
      id: true,
      courseName: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      location: true,
      status: true,
    },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json({
    engagements: engagements.map((e) => ({
      id: e.id,
      courseName: e.courseName,
      startDate: e.startDate.toISOString().split('T')[0],
      endDate: e.endDate.toISOString().split('T')[0],
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      status: e.status,
    })),
  })
}
