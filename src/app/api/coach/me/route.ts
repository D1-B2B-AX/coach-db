import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractToken, validateCoachToken } from '@/lib/coach-auth'

// GET /api/coach/me — returns coach basic info (token auth)
export async function GET(request: NextRequest) {
  const token = extractToken(request)
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })
  const coach = await validateCoachToken(token)
  if (!coach) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const data = await prisma.coach.findUnique({
    where: { id: coach.id },
    select: {
      id: true,
      name: true,
      status: true,
      selfNote: true,
    },
  })

  if (!data) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
