import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/api-auth'
import { appendToContractSheet } from '@/lib/google-sheets'

// POST /api/admin/contract-append — append confirmed scoutings to contract sheet
export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { rows } = body as { rows: string[][] }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows required' }, { status: 400 })
  }

  try {
    const result = await appendToContractSheet(rows)
    return NextResponse.json({ success: true, updatedRows: result.updatedRows, startRow: result.startRow })
  } catch (e) {
    console.error('[contract-append] Error:', e)
    return NextResponse.json({ error: 'Failed to append to sheet' }, { status: 500 })
  }
}
