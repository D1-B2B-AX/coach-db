import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

// GET /api/notifications/unread-count
export async function GET() {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const count = await prisma.notification.count({
    where: { managerId: auth.manager.id, readAt: null },
  })

  return NextResponse.json({ count })
}
