import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

export async function GET() {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const engagements = await prisma.engagement.findMany({
    where: { hiredBy: auth.manager.name },
    include: {
      coach: {
        select: { id: true, name: true, employeeId: true, phone: true, email: true },
      },
    },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json({ engagements })
}
