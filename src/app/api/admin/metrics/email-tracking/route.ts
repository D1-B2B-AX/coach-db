import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'
import { google } from 'googleapis'

const EMAIL_SHEET_ID = '1D5qUeVZjRDnNMPXGP2aXSn3Q-qH_AiFuzTnwFWUGykg'

async function fetchEmailCampaignCoachIds(): Promise<string[]> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: EMAIL_SHEET_ID,
      range: "'시트1'!D2:D",
    })
    const tokens = (res.data.values ?? [])
      .map((row) => {
        const url = String(row[0] || '')
        const m = url.match(/token=([a-f0-9]{64})/)
        return m ? m[1] : null
      })
      .filter((t): t is string => !!t)

    if (tokens.length === 0) return []

    const coaches = await prisma.coach.findMany({
      where: { accessToken: { in: tokens }, deletedAt: null },
      select: { id: true },
    })
    return coaches.map((c) => c.id)
  } catch {
    return []
  }
}

export async function GET() {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const coachIds = await fetchEmailCampaignCoachIds()
  if (coachIds.length === 0) {
    return NextResponse.json({ coaches: [] })
  }

  const coaches = await prisma.coach.findMany({
    where: { id: { in: coachIds }, deletedAt: null },
    select: { id: true, name: true, email: true },
  })

  const logs = await prisma.scheduleAccessLog.findMany({
    where: { coachId: { in: coachIds } },
    select: { coachId: true, yearMonth: true, accessedAt: true, lastEditedAt: true },
    orderBy: { accessedAt: 'desc' },
  })

  const schedCounts = await prisma.coachSchedule.groupBy({
    by: ['coachId'],
    where: { coachId: { in: coachIds } },
    _count: true,
  })
  const countMap = new Map(schedCounts.map((s) => [s.coachId, s._count]))

  const logsByCoach = new Map<string, typeof logs>()
  for (const log of logs) {
    const arr = logsByCoach.get(log.coachId) ?? []
    arr.push(log)
    logsByCoach.set(log.coachId, arr)
  }

  const result = coaches
    .map((coach) => {
      const coachLogs = logsByCoach.get(coach.id) ?? []
      const latestAccess = coachLogs.length > 0 ? coachLogs[0].accessedAt : null
      const latestEdit = coachLogs
        .filter((l) => l.lastEditedAt !== null)
        .sort((a, b) => new Date(b.lastEditedAt!).getTime() - new Date(a.lastEditedAt!).getTime())[0]?.lastEditedAt ?? null
      const monthsEdited = coachLogs.filter((l) => l.lastEditedAt !== null).length

      let status: 'not_visited' | 'visited_only' | 'completed'
      if (coachLogs.length === 0) status = 'not_visited'
      else if (!latestEdit) status = 'visited_only'
      else status = 'completed'

      return {
        name: coach.name,
        email: coach.email,
        status,
        latestAccess: latestAccess?.toISOString() ?? null,
        latestEdit: latestEdit?.toISOString() ?? null,
        monthsEdited,
        scheduleCount: countMap.get(coach.id) ?? 0,
      }
    })
    .sort((a, b) => {
      const order = { completed: 0, visited_only: 1, not_visited: 2 }
      return order[a.status] - order[b.status]
    })

  const summary = {
    total: result.length,
    completed: result.filter((r) => r.status === 'completed').length,
    visitedOnly: result.filter((r) => r.status === 'visited_only').length,
    notVisited: result.filter((r) => r.status === 'not_visited').length,
  }

  return NextResponse.json({ coaches: result, summary })
}
