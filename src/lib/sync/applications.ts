import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { generateAccessToken } from '@/lib/coach-auth'
import { toDateOnly } from '@/lib/date-utils'

export interface ApplicationSyncResult {
  totalRows: number
  created: number
  skipped: number
  errors: number
  errorDetail: string[]
}

const APPLICATION_SHEET_ID = '1xrkRqw3niREpZRIYuB6cEjOGm7Y45bEWkqP02vESR20'

export async function syncApplications(): Promise<ApplicationSyncResult> {
  const result: ApplicationSyncResult = { totalRows: 0, created: 0, skipped: 0, errors: 0, errorDetail: [] }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })

  const drive = google.drive({ version: 'v3', auth })

  // 구글 스프레드시트는 export로 다운로드 (네이티브 시트는 alt:media 불가)
  const res = await drive.files.export(
    { fileId: APPLICATION_SHEET_ID, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { responseType: 'arraybuffer' },
  )
  const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer))
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) { result.errorDetail.push('시트를 찾을 수 없습니다'); return result }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
  result.totalRows = rows.length - 1

  // 기존 코치 조회 (이름+연락처 중복 체크용)
  const existingCoaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, phone: true },
  })
  const existingSet = new Set(existingCoaches.map(c => `${c.name}|${normalizePhone(c.phone)}`))

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const timestampRaw = row[0] // A열: 타임스탬프
    const name = String(row[2] || '').trim()
    const phoneRaw = String(row[3] || '').trim()
    const birthRaw = String(row[4] || '').trim()
    const email = String(row[5] || '').trim() || null
    const affiliation = String(row[6] || '').trim() || null
    const workType = String(row[7] || '').trim() || null
    const availPeriod = String(row[8] || '').trim()
    const availDetail = String(row[9] || '').trim()
    const fieldRaw1 = String(row[10] || '').trim()
    const fieldRaw2 = String(row[11] || '').trim()
    const skillRaw = String(row[12] || '').trim()
    const eduForm = String(row[13] || '').trim()
    const career = String(row[14] || '').trim()
    const portfolioUrl = String(row[15] || '').trim() || null
    const extraRequest = String(row[16] || '').trim()

    if (!name) { result.skipped++; continue }

    const phone = normalizePhone(phoneRaw)

    // 중복 체크
    const key = `${name}|${phone}`
    if (existingSet.has(key)) { result.skipped++; continue }

    const birthDate = parseBirthDate(birthRaw)
    const availabilityDetail = [availPeriod, availDetail].filter(Boolean).join('\n') || null

    // selfNote: 희망 교육 형태 + 교육 경력 + 기타 요청
    const selfNoteParts: string[] = []
    if (eduForm) selfNoteParts.push(`[희망 교육 형태] ${eduForm}`)
    if (career) selfNoteParts.push(`[교육 경력] ${career}`)
    if (extraRequest) selfNoteParts.push(`[기타 요청] ${extraRequest}`)
    const selfNote = selfNoteParts.join('\n') || null

    // 분야: 교육 분야 + 가능 분야 합침
    const fieldNames = [...new Set([...splitMulti(fieldRaw1), ...splitMulti(fieldRaw2)])]
    const curriculumNames = splitMulti(skillRaw)

    try {
      // 타임스탬프 파싱 (Excel serial number or date string)
      let createdAt: Date | undefined
      if (timestampRaw) {
        if (typeof timestampRaw === 'number') {
          // Excel serial date
          createdAt = new Date((timestampRaw - 25569) * 86400000)
        } else {
          const parsed = new Date(String(timestampRaw))
          if (!isNaN(parsed.getTime())) createdAt = parsed
        }
      }

      const coach = await prisma.coach.create({
        data: {
          name,
          phone,
          email,
          birthDate: birthDate ? toDateOnly(birthDate) : null,
          affiliation,
          workType,
          availabilityDetail,
          selfNote,
          status: 'pending',
          accessToken: generateAccessToken(),
          ...(createdAt ? { createdAt } : {}),
        },
      })

      // Field 연결
      for (const fname of fieldNames) {
        const field = await prisma.field.upsert({ where: { name: fname }, create: { name: fname }, update: {} })
        await prisma.coachField.create({ data: { coachId: coach.id, fieldId: field.id } })
      }

      // Curriculum 연결
      for (const cname of curriculumNames) {
        const curr = await prisma.curriculum.upsert({ where: { name: cname }, create: { name: cname }, update: {} })
        await prisma.coachCurriculum.create({ data: { coachId: coach.id, curriculumId: curr.id } })
      }

      // 포트폴리오
      if (portfolioUrl) {
        await prisma.coachDocument.create({
          data: {
            coachId: coach.id,
            fileUrl: portfolioUrl,
            fileName: `${name}_포트폴리오`,
            fileType: 'portfolio',
          },
        })
      }

      existingSet.add(key)
      result.created++
    } catch (err) {
      result.errors++
      result.errorDetail.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}

function normalizePhone(raw: string | null): string {
  if (!raw) return ''
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3')
  return raw.trim()
}

function parseBirthDate(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length === 6) {
    const yy = parseInt(digits.slice(0, 2))
    const year = yy >= 50 ? 1900 + yy : 2000 + yy
    return `${year}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }
  return null
}

function splitMulti(raw: string): string[] {
  if (!raw) return []
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
}
