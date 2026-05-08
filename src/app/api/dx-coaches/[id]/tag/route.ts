import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/api-auth'

const VALID_TAGS = ['기본', '심화']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { tag } = body as { tag: string }

  if (!VALID_TAGS.includes(tag)) {
    return NextResponse.json({ error: '유효하지 않은 태그입니다' }, { status: 400 })
  }

  const coach = await prisma.coach.findFirst({
    where: { id, workType: { contains: '삼전 DX' }, deletedAt: null },
    select: { id: true },
  })

  if (!coach) {
    return NextResponse.json({ error: '코치를 찾을 수 없습니다' }, { status: 404 })
  }

  await prisma.coach.update({
    where: { id },
    data: { dxTag: tag },
  })

  return NextResponse.json({ ok: true })
}
