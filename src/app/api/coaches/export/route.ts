import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import * as XLSX from 'xlsx'

// POST /api/coaches/export — export selected coaches as xlsx
// type: "phone" (default) or "email"
export async function POST(request: NextRequest) {
  const session = await requireManager()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { coachIds, type = 'phone' } = body as { coachIds?: string[]; type?: string }
  if (!coachIds || !Array.isArray(coachIds) || coachIds.length === 0) {
    return NextResponse.json({ error: 'coachIds is required and must be a non-empty array' }, { status: 400 })
  }

  const { baseUrl } = body as { coachIds?: string[]; type?: string; baseUrl?: string }

  const coaches = await prisma.coach.findMany({
    where: {
      id: { in: coachIds },
      deletedAt: null,
    },
    orderBy: { name: 'asc' },
  })

  const isEmail = type === 'email'
  const isMailMerge = type === 'mail-merge'

  let rows: Record<string, string>[]
  let sheetName: string
  let cols: { wch: number }[]
  let label: string

  if (isMailMerge) {
    rows = coaches.map((coach) => ({
      '이름': coach.name,
      '이메일': coach.email || '',
      '링크': `${baseUrl || ''}/coach?token=${coach.accessToken}`,
    }))
    sheetName = '메일머지'
    cols = [{ wch: 15 }, { wch: 30 }, { wch: 60 }]
    label = 'mail-merge'
  } else if (isEmail) {
    rows = coaches.map((coach) => ({
      '이름': coach.name, '이메일': coach.email || '',
    }))
    sheetName = '이메일'
    cols = [{ wch: 15 }, { wch: 30 }]
    label = 'emails'
  } else {
    rows = coaches.map((coach) => ({
      '이름': coach.name, '휴대폰번호': coach.phone || '',
    }))
    sheetName = '연락처'
    cols = [{ wch: 15 }, { wch: 15 }]
    label = 'phones'
  }

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  worksheet['!cols'] = cols

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="coaches_${label}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
