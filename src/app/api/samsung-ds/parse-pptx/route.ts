import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { NextResponse } from 'next/server'
import { requireManager } from '@/lib/api-auth'

export const runtime = 'nodejs'

const execFileAsync = promisify(execFile)

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#xA;/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function extractParagraphs(xml: string) {
  return xml
    .split(/<\/a:p>/g)
    .map((chunk) => {
      const matches = [...chunk.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      return normalizeWhitespace(matches.map((match) => decodeXml(match[1])).join(' '))
    })
    .filter(Boolean)
}

function extractDates(lines: string[]) {
  const currentYear = new Date().getFullYear()
  const results: string[] = []
  const seen = new Set<string>()

  const patterns = [
    /(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g,
    /(?<!\d)(\d{1,2})[.\-/월\s]+(\d{1,2})(?!\d)/g,
  ]

  for (const line of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(line)) !== null) {
        let year = currentYear
        let month = 0
        let day = 0

        if (match.length >= 4) {
          year = parseInt(match[1], 10)
          month = parseInt(match[2], 10)
          day = parseInt(match[3], 10)
        } else {
          month = parseInt(match[1], 10)
          day = parseInt(match[2], 10)
        }

        if (month < 1 || month > 12 || day < 1 || day > 31) continue
        const iso = toIsoDate(year, month, day)
        if (!seen.has(iso)) {
          seen.add(iso)
          results.push(iso)
        }
      }
    }
  }

  return results.sort()
}

function extractTime(lines: string[]) {
  const durationRegex = /(\d+(?:\.\d+)?)\s*시간/
  const timeRegex =
    /([01]?\d|2[0-3])(?::([0-5]\d))?\s*(?:~|-|–|—)\s*([01]?\d|2[0-3])(?::([0-5]\d))?/

  for (const line of lines) {
    const durationMatch = line.match(durationRegex)
    if (durationMatch) {
      return `${durationMatch[1]}시간`
    }
  }

  for (const line of lines) {
    const match = line.match(timeRegex)
    if (!match) continue

    const startHour = pad2(parseInt(match[1], 10))
    const startMinute = pad2(parseInt(match[2] || '0', 10))
    const endHour = pad2(parseInt(match[3], 10))
    const endMinute = pad2(parseInt(match[4] || '0', 10))
    return `${startHour}:${startMinute}~${endHour}:${endMinute}`
  }

  return ''
}

function inferCurriculum(lines: string[], title: string, dates: string[], time: string) {
  const goalLineIndex = lines.findIndex((line) => /(목표|특징)/i.test(line))
  if (goalLineIndex >= 0) {
    const following = lines.slice(goalLineIndex, goalLineIndex + 4).filter(Boolean)
    if (following.length > 0) return following.join('\n')
  }

  const headerLineIndex = lines.findIndex((line) =>
    /(커리큘럼|교육내용|주요 내용|세부 내용|학습 내용)/i.test(line)
  )

  if (headerLineIndex >= 0) {
    const following = lines
      .slice(headerLineIndex + 1)
      .filter((line) => !/(일정|시간|장소|강사|대상|안내)/.test(line))
      .slice(0, 10)
    if (following.length > 0) return following.join('\n')
  }

  const blacklist = new Set([title, time, ...dates])
  const fallback = lines
    .filter((line) => !blacklist.has(line))
    .filter((line) => !/(일정|시간|장소|강사|대상|마감|신청)/.test(line))
    .slice(1, 8)

  return fallback.join('\n')
}

function parseCourseData(lines: string[]) {
  const cleanedLines = lines.map(normalizeWhitespace).filter(Boolean)
  const title = cleanedLines[0] || ''
  const dates = extractDates(cleanedLines)
  const time = extractTime(cleanedLines)
  const curriculum = inferCurriculum(cleanedLines, title, dates, time)

  const warnings: string[] = []
  if (!title) warnings.push('과정명 없음')
  if (dates.length === 0) warnings.push('일정 없음')
  if (!time) warnings.push('시간 없음')
  if (!curriculum) warnings.push('커리큘럼 없음')

  return {
    title,
    startDate: dates[0] || '',
    endDate: dates[dates.length - 1] || '',
    time,
    curriculum,
    warnings,
  }
}

function isCourseLike(parsed: ReturnType<typeof parseCourseData>) {
  if (!parsed.title) return false
  if (parsed.title.includes('<a:')) return false
  if (/^day\s*\d+/i.test(parsed.title)) return false
  if (/^(day|모듈|학습 내용|주요 실습)/i.test(parsed.title)) return false
  if (parsed.title.length < 4 && !parsed.startDate) return false
  const score = [parsed.startDate, parsed.endDate, parsed.time, parsed.curriculum].filter(Boolean).length
  if (score < 2) return false
  return /(목표|특징|선수지식|커리큘럼|교육내용)/.test(parsed.curriculum)
}

export async function POST(request: Request) {
  const auth = await requireManager()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (auth.manager.role !== 'admin' && auth.manager.role !== 'samsung_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'PPTX 파일을 선택해주세요.' }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith('.pptx')) {
    return NextResponse.json({ error: '현재는 .pptx 파일만 지원합니다.' }, { status: 400 })
  }

  const tempPath = path.join(os.tmpdir(), `samsung-ds-${randomUUID()}.pptx`)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(tempPath, buffer)

    const { stdout: listOutput } = await execFileAsync('/usr/bin/zipinfo', ['-1', tempPath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
    })

    const slideEntries = listOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^ppt\/slides\/slide\d+\.xml$/.test(line))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0', 10)
        const bNum = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0', 10)
        return aNum - bNum
      })

    if (slideEntries.length === 0) {
      return NextResponse.json({ error: '슬라이드 텍스트를 찾지 못했습니다.' }, { status: 422 })
    }

    const parsedCourses: Array<{
      slideNumber: number
      title: string
      startDate: string
      endDate: string
      time: string
      curriculum: string
      warnings: string[]
    }> = []
    const skippedSlides: number[] = []

    for (const entry of slideEntries) {
      const slideNumber = parseInt(entry.match(/slide(\d+)\.xml$/)?.[1] || '0', 10)
      const { stdout } = await execFileAsync('/usr/bin/unzip', ['-p', tempPath, entry], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10,
      })

      const parsed = parseCourseData(extractParagraphs(stdout))
      if (!isCourseLike(parsed)) {
        skippedSlides.push(slideNumber)
        continue
      }

      parsedCourses.push({
        slideNumber,
        title: parsed.title,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        time: parsed.time,
        curriculum: parsed.curriculum,
        warnings: parsed.warnings,
      })
    }

    const deduped = parsedCourses.filter((course, index, array) => {
      return (
        array.findIndex(
          (candidate) =>
            candidate.title === course.title &&
            candidate.startDate === course.startDate &&
            candidate.endDate === course.endDate
        ) === index
      )
    })

    return NextResponse.json({
      fileName: file.name,
      courses: deduped,
      skippedSlides,
    })
  } catch (error) {
    console.error('[samsung-ds parse]', error)
    return NextResponse.json(
      { error: '파일을 읽지 못했습니다. 다른 PPTX 파일로 다시 시도해주세요.' },
      { status: 500 }
    )
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {})
  }
}
