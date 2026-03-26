interface WorkSchedule {
  date: Date
  startTime: string
  endTime: string
}

function parseWorkSchedules(raw: any, contextYear?: number): WorkSchedule[] {
  if (!raw) return []
  const str = String(raw).trim()
  if (!str) return []
  const defYear = contextYear || new Date().getFullYear()
  const results: WorkSchedule[] = []
  const lines = str.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (!/\d{1,2}:\d{2}/.test(line)) continue
    const spanMatch = line.match(
      /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})\s*~\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\([^)]*\))?\s*(\d{1,2}:\d{2})/
    )
    if (spanMatch) {
      results.push({ date: new Date(defYear, +spanMatch[1]-1, +spanMatch[2]), startTime: spanMatch[3].padStart(5,'0'), endTime: '23:59' })
      results.push({ date: new Date(defYear, +spanMatch[4]-1, +spanMatch[5]), startTime: '00:00', endTime: spanMatch[6].padStart(5,'0') })
      continue
    }
    const times = extractTimeRanges(line)
    if (times.length === 0) continue
    const dates = extractDates(line, defYear)
    for (const d of dates) {
      for (const t of times) {
        results.push({ date: d, startTime: t.start, endTime: t.end })
      }
    }
  }
  return results
}

function extractTimeRanges(line: string): { start: string; end: string }[] {
  const results: { start: string; end: string }[] = []
  const regex = /(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})/g
  let m
  while ((m = regex.exec(line)) !== null) {
    results.push({ start: m[1].padStart(5,'0'), end: m[2].padStart(5,'0') })
  }
  return results
}

function extractDates(line: string, defYear: number): Date[] {
  const cleaned = line.replace(/\d{1,2}:\d{2}\s*[~\-–]\s*\d{1,2}:\d{2}/g, 'TIME').replace(/\d{1,2}:\d{2}/g, 'TIME')

  // 1) Full range
  {
    const m = cleaned.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*(?:\([^)]*\))?\s*~\s*(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/)
    if (m) {
      return expandRange(new Date(+m[1],+m[2]-1,+m[3]), new Date(+m[4],+m[5]-1,+m[6]), extractWeekdays(line))
    }
  }
  // 2) Short range
  {
    const m = cleaned.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]?\s*(\d{1,2})\s*(?:\([^)]*\))?\s*~\s*(\d{1,2})\s*(?:\([^)]*\))?/)
    if (m && +m[4] <= 31) {
      const afterTilde = cleaned.slice(cleaned.indexOf('~')+1).trim()
      if (!/^\d{4}/.test(afterTilde)) {
        return expandRange(new Date(+m[1],+m[2]-1,+m[3]), new Date(+m[1],+m[2]-1,+m[4]), extractWeekdays(line))
      }
    }
  }
  // 3) Single dates with year
  {
    const dates: Date[] = []
    const regex = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]?\s*(\d{1,2})\s*일?\s*(?:\([^)]*\))?/g
    let m
    while ((m = regex.exec(cleaned)) !== null) {
      const y=+m[1],mo=+m[2],d=+m[3]
      if (y>=2020&&y<=2030&&mo>=1&&mo<=12&&d>=1&&d<=31) dates.push(new Date(y,mo-1,d))
    }
    if (dates.length > 0) return dates
  }
  // 4) No-year
  {
    const dates: Date[] = []
    const regex = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/g
    let m
    while ((m = regex.exec(cleaned)) !== null) { dates.push(new Date(defYear,+m[1]-1,+m[2])) }
    if (dates.length > 0) return dates
  }
  // 5) M/D
  {
    const dates: Date[] = []
    const regex = /(\d{1,2})\/(\d{1,2})/g
    let m
    while ((m = regex.exec(cleaned)) !== null) {
      const mo=+m[1],d=+m[2]
      if (mo>=1&&mo<=12&&d>=1&&d<=31) dates.push(new Date(defYear,mo-1,d))
    }
    if (dates.length > 0) return dates
  }
  return []
}

function extractWeekdays(line: string): number[] | null {
  const dayMap: Record<string,number> = {'일':0,'월':1,'화':2,'수':3,'목':4,'금':5,'토':6}
  if (/주말\s*제외/.test(line)) return [1,2,3,4,5]
  const rangeMatch = line.match(/\(\s*([월화수목금토일])\s*~\s*([월화수목금토일])\s*\)/)
  if (rangeMatch) {
    const s=dayMap[rangeMatch[1]],e=dayMap[rangeMatch[2]]
    if (s!==undefined&&e!==undefined&&s<=e) { const d:number[]=[]; for(let i=s;i<=e;i++)d.push(i); return d }
  }
  const listMatch = line.match(/\(\s*([월화수목금토일])\s*[,\s]\s*([월화수목금토일])(?:\s*[,\s]\s*([월화수목금토일]))?(?:\s*[,\s]\s*([월화수목금토일]))?(?:\s*[,\s]\s*([월화수목금토일]))?\s*[/\s)]/)
  if (listMatch) {
    const d:number[]=[]
    for(let i=1;i<=5;i++) if(listMatch[i]&&dayMap[listMatch[i]]!==undefined) d.push(dayMap[listMatch[i]])
    if (d.length>=2) return d
  }
  return null
}

function expandRange(start: Date, end: Date, weekdays?: number[]|null): Date[] {
  const dates:Date[]=[]; const cursor=new Date(start); let s=0
  while(cursor<=end&&s<366){if(!weekdays||weekdays.includes(cursor.getDay()))dates.push(new Date(cursor));cursor.setDate(cursor.getDate()+1);s++}
  return dates
}

// --- Tests ---
const tests: [string, number][] = [
  ['2022년 11월 14일 20:00 ~ 22:00', 2022],
  ['2022 . 11 . 29 (화) 09:00 ~ 18:00 (점심 휴게1시간 제외)', 2022],
  ['11/28,12/5,12,19 (매주 월) 10:00~18:00 (7H)', 2022],
  ['2023. 1. 2 ~ 2023. 2. 24 (월~금) 08:00 ~ 17:00 (휴게 1H)', 2023],
  ['2023. 1.04 (수) 10:00 - 11:00 , 20:00 - 22:00', 2023],
  ['2023. 1.9(월)~12(목) 08:00 ~ 11:30', 2023],
  ['2023.02.13(월) 09:00 ~17:00 (점심시간 1h제외)', 2023],
  ['2023.03.23 (목) ~ 2023.03.31 (금) 17:30 ~ 22:00 (주말 제외, 휴게 30M)', 2023],
  ['2023.03.29 (수) 09:00~18:00 (휴게 1H) +) 강의 준비시간 회차당 1시간', 2023],
  ['SQL 기초 - 20문항 (건당 검수 계약)', 2023],
  ['2024. 04. 09 ~ 2024. 06. 17 주 4일 3시간 근무 (월, 화, 수, 금 / 18:30-21:30)', 2024],
  ['2024.11.12 (화) 9:00~17:00 (7H, 점심 1H)', 2024],
  ['2025-03-15 (토) 09:00~18:00 (8시간/점심 1시간)', 2025],
  ['8월 22일(목) 07:00 ~ 8월 23일(금) 12:00 (무박/연속 근무)', 2024],
  ['2026-03-24(화) 13:00~18:30 (휴게시간 30분, 5H)', 2026],
]

for (const [input, year] of tests) {
  const result = parseWorkSchedules(input, year)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const preview = result.length <= 3
    ? result.map(r => `${fmt(r.date)} ${r.startTime}~${r.endTime}`).join(', ')
    : `${fmt(result[0].date)}...${fmt(result[result.length-1].date)}`
  console.log(`[${String(result.length).padStart(3)}] ${input.slice(0,60).padEnd(60)} → ${preview}`)
}
