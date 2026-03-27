import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const coaches = await prisma.coach.findMany({
    where: { status: 'pending', deletedAt: null },
    include: {
      fields: { include: { field: true } },
      curriculums: { include: { curriculum: true } },
      documents: { select: { id: true, fileName: true, fileUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    coaches: coaches.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      birthDate: c.birthDate,
      affiliation: c.affiliation,
      workType: c.workType,
      availabilityDetail: c.availabilityDetail,
      selfNote: c.selfNote,
      accessToken: c.accessToken,
      createdAt: c.createdAt,
      fields: c.fields.map(f => f.field.name),
      curriculums: c.curriculums.map(cc => cc.curriculum.name),
      documents: c.documents,
    })),
  })
}
