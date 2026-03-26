import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ yearMonth: string }> }

// POST /api/schedules/:yearMonth/open — open a new month for schedule collection
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { yearMonth } = await params

  // Validate yearMonth format (YYYY-MM)
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(yearMonth)) {
    return NextResponse.json(
      { error: 'Invalid yearMonth format. Expected YYYY-MM' },
      { status: 400 }
    )
  }

  // Per design: the "open month" action is a UI concept.
  // Actual access logs are created when coaches access their page (Task 10).
  // For now, validate format and return success.
  return NextResponse.json({ yearMonth, message: 'Month opened' })
}
