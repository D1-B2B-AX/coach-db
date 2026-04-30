import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

/**
 * POST /api/admin/content-moderation/[id]/warn
 * 경고 알림 발송 (인앱 알림만, Push/Email 미발송)
 *
 * Body: {
 *   authorManagerId: string,
 *   warningMessage: string,
 *   contentType: string,
 *   sourceRecordId: string,
 *   sourceTable: string,
 *   targetLabel: string,
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { authorManagerId, warningMessage, contentType, sourceRecordId, sourceTable, targetLabel } = body as {
    authorManagerId?: string; warningMessage?: string; contentType?: string; sourceRecordId?: string; sourceTable?: string; targetLabel?: string
  }

  if (!authorManagerId) {
    return NextResponse.json(
      { error: '작성자를 식별할 수 없어 경고를 보낼 수 없습니다' },
      { status: 400 },
    )
  }

  if (!warningMessage?.trim()) {
    return NextResponse.json(
      { error: '경고 메시지를 입력해주세요' },
      { status: 400 },
    )
  }

  // Push/Email 미발송: 경고는 긴급 통보가 아닌 주의 환기이므로 인앱 알림만으로 충분.
  const notification = await prisma.notification.create({
    data: {
      type: 'content_warning',
      title: '콘텐츠 경고',
      body: `[대상: ${targetLabel}] 관리자가 작성하신 내용에 대해 경고합니다. 내용: ${warningMessage}`,
      managerId: authorManagerId,
      data: {
        contentType,
        sourceRecordId,
        sourceTable,
        warningMessage,
      },
    },
  })

  return NextResponse.json({ success: true, notificationId: notification.id })
}
