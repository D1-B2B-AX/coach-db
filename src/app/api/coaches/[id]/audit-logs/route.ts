import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/coaches/:id/audit-logs
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: threeMonthsAgo },
      OR: [
        { tableName: 'coaches', recordId: id },
        {
          tableName: 'engagements',
          recordId: {
            in: (await prisma.engagement.findMany({
              where: { coachId: id },
              select: { id: true },
            })).map(e => e.id),
          },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })

  // Resolve emails to names
  const emails = [...new Set(logs.map((l) => l.changedBy))]
  const managers = await prisma.manager.findMany({
    where: { email: { in: emails } },
    select: { email: true, name: true },
  })
  const nameMap = new Map(managers.map((m) => [m.email, m.name]))

  const enriched = logs.map((log) => ({
    ...log,
    changedByName: nameMap.get(log.changedBy) || log.changedBy.split("@")[0],
  }))

  return NextResponse.json({ logs: enriched })
}
