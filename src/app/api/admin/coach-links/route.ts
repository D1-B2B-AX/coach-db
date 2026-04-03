import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/admin/coach-links — admin only
export async function GET() {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const coaches = await prisma.coach.findMany({
    where: {
      deletedAt: null,
      status: { not: 'pending' },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      accessToken: true,
      status: true,
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ coaches })
}
