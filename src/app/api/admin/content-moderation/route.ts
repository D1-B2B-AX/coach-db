import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import type { UnifiedContentItem, ContentType, ContentModerationResponse } from '@/types/content-moderation'

/**
 * GET /api/admin/content-moderation
 *
 * 통합 콘텐츠 피드 조회 (cursor-based pagination)
 * 세 소스(managerNote, engagement feedback, audit_log) 개별 쿼리 + 앱 레벨 병합 정렬
 *
 * Query params:
 * - cursor: ISO timestamp (마지막 항목의 sortTimestamp)
 * - limit: 페이지 크기 (default 20)
 * - contentType: "memo" | "review" | "audit" (미지정 시 전체)
 */
export async function GET(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor') || null
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100)
  const contentTypeFilter = searchParams.get('contentType') as ContentType | null

  // 각 소스에서 limit * 2건 조회 (병합 후 상위 limit건 선택)
  const fetchLimit = limit * 2

  const cursorDate = cursor ? new Date(cursor) : undefined
  const cursorFilter = cursorDate ? { lt: cursorDate } : undefined

  // 모든 매니저를 미리 조회 (작성자 해석용, 소규모 < 20명)
  const allManagers = await prisma.manager.findMany({
    select: { id: true, email: true, name: true },
  })
  const managerByEmail = new Map(allManagers.map(m => [m.email, m]))
  const managerByName = new Map(allManagers.map(m => [m.name, m]))

  const items: UnifiedContentItem[] = []

  // --- Source A: managerNote (memo) ---
  if (!contentTypeFilter || contentTypeFilter === 'memo') {
    const coaches = await prisma.coach.findMany({
      where: {
        managerNote: { not: null },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        managerNote: true,
        updatedAt: true,
      },
    })

    for (const coach of coaches) {
      // audit_log에서 가장 최근 managerNote 변경 기록 역추적
      const lastAudit = await prisma.auditLog.findFirst({
        where: {
          tableName: 'coaches',
          recordId: coach.id,
          field: 'managerNote',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, changedBy: true },
      })

      const sortTimestamp = lastAudit?.createdAt ?? coach.updatedAt

      // cursor 필터링
      if (cursorDate && sortTimestamp >= cursorDate) continue

      // 작성자 해석 (규칙 2: authorIdentifier가 null인 경우)
      let authorName = '알 수 없음'
      let authorManagerId: string | null = null
      if (lastAudit?.changedBy) {
        const mgr = managerByEmail.get(lastAudit.changedBy)
        if (mgr) {
          authorName = mgr.name
          authorManagerId = mgr.id
        } else {
          authorName = lastAudit.changedBy.split('@')[0]
        }
      }

      items.push({
        id: coach.id,
        contentType: 'memo',
        text: coach.managerNote,
        authorName,
        authorManagerId,
        targetLabel: coach.name,
        sourceRecordId: coach.id,
        sourceTable: 'coaches',
        editableField: 'managerNote',
        sortTimestamp: sortTimestamp.toISOString(),
        canEdit: true,
        canDelete: true,
        canWarn: authorManagerId !== null,
        riskFlag: null,
      })
    }
  }

  // --- Source B: engagement review ---
  if (!contentTypeFilter || contentTypeFilter === 'review') {
    const engagements = await prisma.engagement.findMany({
      where: {
        feedback: { not: null },
        ...(cursorFilter ? { createdAt: cursorFilter } : {}),
      },
      include: {
        coach: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
    })

    for (const eng of engagements) {
      // 작성자 해석 (규칙 2: hiredBy는 이름)
      let authorName = eng.hiredBy || '알 수 없음'
      let authorManagerId: string | null = null
      if (eng.hiredBy) {
        const mgr = managerByName.get(eng.hiredBy)
        if (mgr) {
          authorManagerId = mgr.id
        }
      }

      items.push({
        id: eng.id,
        contentType: 'review',
        text: eng.feedback,
        rating: eng.rating,
        authorName,
        authorManagerId,
        targetLabel: `${eng.coach.name} / ${eng.courseName}`,
        sourceRecordId: eng.id,
        sourceTable: 'engagements',
        editableField: 'feedback',
        sortTimestamp: eng.createdAt.toISOString(),
        canEdit: true,
        canDelete: true,
        canWarn: authorManagerId !== null,
        riskFlag: null,
      })
    }
  }

  // --- Source C: audit_log ---
  if (!contentTypeFilter || contentTypeFilter === 'audit') {
    // 텍스트성 필드만 필터링
    const textFields = ['managerNote', 'feedback', 'selfNote', 'availabilityDetail', 'statusNote']
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        field: { in: textFields },
        action: 'update',
        ...(cursorFilter ? { createdAt: cursorFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
    })

    for (const log of auditLogs) {
      // 작성자 해석 (규칙 2: changedBy는 이메일)
      let authorName = log.changedBy.split('@')[0]
      let authorManagerId: string | null = null
      const mgr = managerByEmail.get(log.changedBy)
      if (mgr) {
        authorName = mgr.name
        authorManagerId = mgr.id
      }

      items.push({
        id: log.id,
        contentType: 'audit',
        text: log.newValue,
        previousText: log.oldValue,
        authorName,
        authorManagerId,
        targetLabel: `${log.tableName} ${log.field}`,
        sourceRecordId: log.id,
        sourceTable: 'audit_logs',
        editableField: null,
        sortTimestamp: log.createdAt.toISOString(),
        canEdit: false,
        canDelete: false,
        canWarn: false,
        riskFlag: null,
      })
    }
  }

  // 병합 정렬: sortTimestamp DESC
  items.sort((a, b) => new Date(b.sortTimestamp).getTime() - new Date(a.sortTimestamp).getTime())

  // 상위 limit건 + nextCursor
  const paged = items.slice(0, limit)
  const nextCursor = paged.length === limit && items.length > limit
    ? paged[paged.length - 1].sortTimestamp
    : null

  const response: ContentModerationResponse = { items: paged, nextCursor }
  return NextResponse.json(response)
}
