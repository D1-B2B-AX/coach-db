import { google } from 'googleapis'

// ─── Constants ───

const DX_SHEET_ID = '1bsT8NTpmIBJEIiYJ4ObAJy3HQQRI1i0Q6IFCGwfxOE0'
const DX_TAB = '일정 마스터 시트_리스트형_3차'

const COL = {
  WEEK: 0,      // A
  DAYS: 1,      // B
  START: 2,     // C
  END: 3,       // D
  TRACK: 5,     // F
  CLASS: 6,     // G (분반)
  ROUND: 7,     // H (차수)
  COACH1: 11,   // L
  COACH2: 12,   // M
  COACH3: 13,   // N
}

// ─── Types ───

export interface DxTrack {
  trackName: string      // "기본(월~수) 1반" — Track + 분반
  track: string          // "기본(월~수)" — F열 원본
  className: string      // "1반" — G열 원본
  round: number          // 차수
  startDate: Date
  endDate: Date
  coaches: string[]      // 코치 이름들 (L~N)
}

// ─── Date parsing ───

function parseMDDate(raw: any, year: number): Date | null {
  if (raw == null) return null
  let str = String(raw).trim()
  if (!str) return null

  // Strip parenthesized suffix e.g. "3.04 (수)" → "3.04"
  str = str.replace(/\s*\(.*\)\s*$/, '')

  const match = str.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

// ─── Main fetch function ───

export async function fetchDxTracks(year?: number): Promise<DxTrack[]> {
  const targetYear = year ?? new Date().getFullYear()

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: DX_SHEET_ID,
    range: `'${DX_TAB}'!A:N`,
  }, { timeout: 30000 })

  const rows = res.data.values || []
  const tracks: DxTrack[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]

    const trackRaw = String(row[COL.TRACK] || '').trim()
    if (!trackRaw) continue

    const startDate = parseMDDate(row[COL.START], targetYear)
    const endDate = parseMDDate(row[COL.END], targetYear)
    if (!startDate || !endDate) continue

    const className = String(row[COL.CLASS] || '').trim()
    const roundRaw = Number(String(row[COL.ROUND] || '').trim())
    const round = isNaN(roundRaw) ? 0 : roundRaw

    const coaches: string[] = []
    for (const col of [COL.COACH1, COL.COACH2, COL.COACH3]) {
      const name = String(row[col] || '').trim()
      if (name) coaches.push(name)
    }

    tracks.push({
      trackName: className ? `${trackRaw} ${className}` : trackRaw,
      track: trackRaw,
      className,
      round,
      startDate,
      endDate,
      coaches,
    })
  }

  return tracks
}
