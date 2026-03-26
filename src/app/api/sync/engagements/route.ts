import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/api-auth'
import { syncEngagements } from '@/lib/sync/engagements'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = await prisma.syncLog.create({
    data: {
      type: 'engagements',
      status: 'running',
      triggeredBy: `button:${auth.manager.email}`,
    },
  })

  try {
    const result = await syncEngagements()

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        totalRows: result.totalRows,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        errorDetail: result.errorDetail.length > 0
          ? result.errorDetail.join('\n')
          : null,
        finishedAt: new Date(),
      },
    })

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
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
