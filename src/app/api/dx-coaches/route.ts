import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

export async function GET() {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const coaches = await prisma.coach.findMany({
    where: {
      workType: { contains: '삼전 DX' },
      status: 'active',
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      affiliation: true,
      dxTag: true,
      dxAssignments: {
        where: {
          date: {
            gte: new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1)),
            lte: new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth() + 1, 0)),
          },
        },
        select: { id: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const result = coaches.map((c) => ({
    id: c.id,
    name: c.name,
    affiliation: c.affiliation,
    dxTag: c.dxTag,
    currentMonthAssignments: c.dxAssignments.length,
  }))

  return NextResponse.json({ coaches: result })
}
