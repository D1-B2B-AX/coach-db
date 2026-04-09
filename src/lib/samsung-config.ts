// src/lib/samsung-config.ts

export function getSamsungHideConfig() {
  return {
    dsHideFrom: process.env.SAMSUNG_DS_HIDE_FROM || '',
    dxHideFrom: process.env.SAMSUNG_DX_HIDE_FROM || '',
    hideUntil: process.env.SAMSUNG_HIDE_UNTIL || '',
  }
}

/** yearMonth("2026-05") 기준으로 삼전 DS/DX 숨김 여부 판단 */
export function getSamsungExclusions(yearMonth: string): { excludeDS: boolean; excludeDX: boolean } {
  const { dsHideFrom, dxHideFrom, hideUntil } = getSamsungHideConfig()

  return {
    excludeDS: dsHideFrom !== '' && hideUntil !== '' && yearMonth >= dsHideFrom && yearMonth <= hideUntil,
    excludeDX: dxHideFrom !== '' && hideUntil !== '' && yearMonth >= dxHideFrom && yearMonth <= hideUntil,
  }
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 코치 목록/검색 쿼리에 병합할 Prisma where fragment.
 * 현재 달이 HIDE_FROM 이후면 삼전 DS/DX 코치를 배제한다.
 * TODO: 삼전관리페이지 구현 시 역할 기반 예외 추가 (admin/samsung_admin은 허용)
 */
export function getCoachSamsungExclusionWhere(): {
  NOT?: { workType: { contains: string } }[]
} {
  const { excludeDS, excludeDX } = getSamsungExclusions(currentYearMonth())
  const notConditions: { workType: { contains: string } }[] = []
  if (excludeDS) notConditions.push({ workType: { contains: '삼전 DS' } })
  if (excludeDX) notConditions.push({ workType: { contains: '삼전 DX' } })
  return notConditions.length > 0 ? { NOT: notConditions } : {}
}

/**
 * 단일 코치의 workType으로 숨김 여부 판단. (상세 페이지 직접 접근 차단용)
 */
export function isSamsungCoachHidden(workType: string | null | undefined): boolean {
  if (!workType) return false
  const { excludeDS, excludeDX } = getSamsungExclusions(currentYearMonth())
  if (excludeDS && workType.includes('삼전 DS')) return true
  if (excludeDX && workType.includes('삼전 DX')) return true
  return false
}
