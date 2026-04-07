import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/api-auth'
import { syncApplications, type ApplicationDetail } from '@/lib/sync/applications'
import { prisma } from '@/lib/prisma'
import { sendSlack } from '@/lib/slack'

export async function POST(request: NextRequest) {
  // Bearer 토큰 인증 (cron) 또는 매니저 인증
  let triggeredBy = ''
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === process.env.SYNC_API_SECRET) {
    triggeredBy = 'cron:github-actions'
  } else {
    const auth = await requireManager()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    triggeredBy = `button:${auth.manager.email}`
  }

  const log = await prisma.syncLog.create({
    data: { type: 'applications', status: 'running', triggeredBy },
  })

  try {
    const result = await syncApplications()
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        totalRows: result.totalRows,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
        errorDetail: result.errorDetail.length > 0 ? result.errorDetail.join('\n') : null,
        finishedAt: new Date(),
      },
    })

    // 신규/기존 코치가 있으면 슬랙 알림
    if (result.details.length > 0) {
      await sendSlack(buildSlackMessage(result.details)).catch(() => {})
    }

    return NextResponse.json(result)
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', errorDetail: error instanceof Error ? error.message : String(error), finishedAt: new Date() },
    })
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

function buildSlackMessage(details: ApplicationDetail[]): string {
  const created = details.filter(d => d.type === 'created')
  const updated = details.filter(d => d.type === 'updated')

  const lines: string[] = []
  lines.push(`*코치 신청 알림* — 새로운 신청 ${details.length}건 (신규 ${created.length}, 기존 ${updated.length})`)
  lines.push('')

  if (created.length > 0) {
    lines.push('*신규 코치* (DB에 없음)')
    for (const d of created) {
      const info = [d.phone, d.affiliation, d.fields.join('/')].filter(Boolean).join(' · ')
      lines.push(`• ${d.name} — ${info}`)
    }
    lines.push('')
  }

  if (updated.length > 0) {
    lines.push('*기존 코치* (DB에 있음 → 정보 업데이트)')
    for (const d of updated) {
      const info = [d.phone, d.affiliation, d.fields.join('/')].filter(Boolean).join(' · ')
      lines.push(`• ${d.name} — ${info}`)
    }
  }

  return lines.join('\n')
}
