/**
 * One-time script: portfolio_url → coach_documents 이관
 * Google Drive API로 파일명 조회 후 coach_documents에 INSERT
 *
 * Usage: npx tsx scripts/migrate-portfolio-urls.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { google } from 'googleapis'
import { config } from 'dotenv'
config({ path: '.env.local' })

// Use MIGRATE_DATABASE_URL if set, otherwise fall back to DATABASE_URL
const dbUrl = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL!
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: dbUrl }),
})

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
})

const drive = google.drive({ version: 'v3', auth })

function extractFileIds(raw: string): { id: string; url: string }[] {
  // Split by comma, newline, or "https://" boundary (handles concatenated URLs)
  const urls = raw
    .replace(/https:\/\//g, '\nhttps://')
    .split(/[\n,]+/)
    .map(u => u.trim())
    .filter(u => u.startsWith('https://'))

  return urls.map(u => {
    // Format 1: /open?id=XXX
    const openMatch = u.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    if (openMatch) return { id: openMatch[1], url: u }
    // Format 2: /file/d/XXX/
    const fileMatch = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
    if (fileMatch) return { id: fileMatch[1], url: u }
    return null
  }).filter((x): x is { id: string; url: string } => x !== null)
}

async function getFileName(fileId: string): Promise<string | null> {
  try {
    const res = await drive.files.get({ fileId, fields: 'name' })
    return res.data.name || null
  } catch (e: any) {
    console.log(`  ⚠ Drive API error for ${fileId}: ${e.message}`)
    return null
  }
}

async function main() {
  const coaches = await prisma.coach.findMany({
    where: { portfolioUrl: { not: null }, deletedAt: null },
    select: { id: true, name: true, portfolioUrl: true },
  })

  console.log(`Found ${coaches.length} coaches with portfolio URLs`)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const coach of coaches) {
    const files = extractFileIds(coach.portfolioUrl!)
    for (const file of files) {
      // Check if already exists
      const existing = await prisma.coachDocument.findFirst({
        where: { coachId: coach.id, fileUrl: file.url },
      })
      if (existing) {
        skipped++
        continue
      }

      const fileName = await getFileName(file.id)
      if (!fileName) {
        console.log(`  ✕ ${coach.name}: could not get name for ${file.id}`)
        errors++
        continue
      }

      await prisma.coachDocument.create({
        data: {
          coachId: coach.id,
          fileUrl: file.url,
          fileName,
          fileType: 'portfolio',
        },
      })
      console.log(`  ✓ ${coach.name}: ${fileName}`)
      created++
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${errors} errors`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
