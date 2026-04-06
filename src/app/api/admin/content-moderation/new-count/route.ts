import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

/**
 * GET /api/admin/content-moderation/new-count?since={ISO timestamp}
 * since 이후 새로 생성된 콘텐츠 항목 수 반환
 */
export async function GET(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const sinceDate = since ? new Date(since) : new Date(0)

  // 세 소스 각각의 새 항목 수를 병렬로 카운트
  const [memoCount, reviewCount, auditCount] = await Promise.all([
    // managerNote: audit_log에서 managerNote 변경 기록이 since 이후인 건수
    prisma.auditLog.count({
      where: {
        tableName: 'coaches',
        field: 'managerNote',
        createdAt: { gt: sinceDate },
      },
    }),
    // engagement review: since 이후 생성된 feedback 있는 투입이력
    prisma.engagement.count({
      where: {
        feedback: { not: null },
        createdAt: { gt: sinceDate },
      },
    }),
    // audit_log: 텍스트성 필드의 update 기록
    prisma.auditLog.count({
      where: {
        field: { in: ['managerNote', 'feedback', 'selfNote', 'availabilityDetail', 'statusNote'] },
        action: 'update',
        createdAt: { gt: sinceDate },
      },
    }),
  ])

  return NextResponse.json({ count: memoCount + reviewCount + auditCount })
}
