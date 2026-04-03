/**
 * Company alias parsing and display text for coach notification enrichment.
 */

export function parseCompanyFromCourseName(
  courseName: string,
  knownCompanies: string[]
): { companyName: string | null; restCourseName: string } {
  const sorted = [...knownCompanies].sort((a, b) => b.length - a.length)

  for (const pattern of sorted) {
    if (courseName.startsWith(pattern)) {
      const rest = courseName.slice(pattern.length).trimStart()
      return { companyName: pattern, restCourseName: rest }
    }
    if (courseName.includes(pattern + ' ')) {
      const idx = courseName.indexOf(pattern + ' ')
      const before = courseName.slice(0, idx).trimEnd()
      const after = courseName.slice(idx + pattern.length).trimStart()
      const rest = (before + ' ' + after).trim()
      return { companyName: pattern, restCourseName: rest }
    }
  }

  return { companyName: null, restCourseName: courseName }
}

function formatDate(isoDate: string): string {
  const parts = isoDate.split('-')
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  return `${month}/${day}`
}

export function formatScoutingDisplay(params: {
  date: string
  managerName: string
  managerEmail?: string | null
  courseName: string | null
  companyAlias: string | null
  restCourseName: string | null
  hireStart?: string | null
  hireEnd?: string | null
}): string {
  const { date, managerName, managerEmail, companyAlias, hireStart, hireEnd } = params
  const courseName = params.courseName?.trim() || null
  const restCourseName = params.restCourseName?.trim() || null

  const dateStr = formatDate(date)
  const timeStr = hireStart && hireEnd ? ` ${hireStart}~${hireEnd}` : ''
  const managerLabel = managerEmail ? `${managerName}매니저 (${managerEmail})` : `${managerName}매니저`
  const base = `${dateStr}${timeStr} 찜꽁 (${managerLabel})`

  if (!courseName) {
    return base
  }

  if (companyAlias) {
    const rest = restCourseName || ''
    const result = `${dateStr}${timeStr} 찜꽁 — ${companyAlias} ${rest} (${managerLabel})`.replace(/\s+/g, ' ').trim()
    return result || base
  }

  const result = `${dateStr}${timeStr} 찜꽁 — ${courseName} (${managerLabel})`
  return result || base
}
