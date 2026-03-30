import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadFile, listFiles, deleteFile } from '@/lib/r2'

const RETENTION_DAYS = 30

async function authenticate(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token === process.env.BACKUP_API_SECRET) {
      return true
    }
  }
  return false
}

export async function POST(request: NextRequest) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)

  // Export all tables
  const [coaches, engagements, engagementSchedules, coachSchedules, coachFields, coachCurriculums, coachDocuments, scheduleAccessLogs] = await Promise.all([
    prisma.coach.findMany(),
    prisma.engagement.findMany(),
    prisma.engagementSchedule.findMany(),
    prisma.coachSchedule.findMany(),
    prisma.coachField.findMany(),
    prisma.coachCurriculum.findMany(),
    prisma.coachDocument.findMany(),
    prisma.scheduleAccessLog.findMany(),
  ])

  const backup = {
    exportedAt: now.toISOString(),
    counts: {
      coaches: coaches.length,
      engagements: engagements.length,
      engagementSchedules: engagementSchedules.length,
      coachSchedules: coachSchedules.length,
      coachFields: coachFields.length,
      coachCurriculums: coachCurriculums.length,
      coachDocuments: coachDocuments.length,
      scheduleAccessLogs: scheduleAccessLogs.length,
    },
    data: {
      coaches,
      engagements,
      engagementSchedules,
      coachSchedules,
      coachFields,
      coachCurriculums,
      coachDocuments,
      scheduleAccessLogs,
    },
  }

  const json = JSON.stringify(backup)
  const key = `backups/${dateStr}.json`

  await uploadFile(key, Buffer.from(json, 'utf-8'), 'application/json')

  // Clean up old backups
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const existing = await listFiles('backups/')
  let deleted = 0
  for (const file of existing) {
    if (file.lastModified && file.lastModified < cutoff) {
      await deleteFile(file.key)
      deleted++
    }
  }

  return NextResponse.json({
    success: true,
    key,
    counts: backup.counts,
    cleanedUp: deleted,
  })
}
