import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireManager } from '@/lib/api-auth'
import { syncSamsungSchedule } from '@/lib/sync/samsung-schedule'
import { prisma } from '@/lib/prisma'

const CRON_SLUG = 'samsung-schedule-sync'

async function authenticate(request: NextRequest): Promise<{ triggeredBy: string } | null> {
  // 1) Bearer token (GitHub Actions)
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token === process.env.SYNC_API_SECRET) {
      return { triggeredBy: 'cron:github-actions' }
    }
  }

  // 2) Session (UI button)
  const auth = await requireManager()
  if (auth) {
    return { triggeredBy: `button:${auth.manager.email}` }
  }

  return null
}

export async function POST(request: NextRequest) {
  const authResult = await authenticate(request)
  if (!authResult) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: CRON_SLUG, status: 'in_progress' },
    {
      schedule: { type: 'crontab', value: '0 0 * * 2' },
      timezone: 'Asia/Seoul',
    },
  )

  const log = await prisma.syncLog.create({
    data: {
      type: 'samsung-schedule',
      status: 'running',
      triggeredBy: authResult.triggeredBy,
    },
  })

  try {
    const result = await syncSamsungSchedule()

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        totalRows: result.totalRows,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
        errorDetail: result.errorDetail.length > 0
          ? result.errorDetail.join('\n')
          : null,
        finishedAt: new Date(),
      },
    })

    Sentry.captureCheckIn({ checkInId, monitorSlug: CRON_SLUG, status: 'ok' })
    return NextResponse.json(result)
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'error',
        errorDetail: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    })
    Sentry.captureCheckIn({ checkInId, monitorSlug: CRON_SLUG, status: 'error' })
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
