import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { generateAccessToken } from '@/lib/coach-auth'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/coaches/:id/regenerate-token
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const existing = await prisma.coach.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  }

  const accessToken = generateAccessToken()

  await prisma.coach.update({
    where: { id },
    data: { accessToken },
  })

  return NextResponse.json({ accessToken })
}
