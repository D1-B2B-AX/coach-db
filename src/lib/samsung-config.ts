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
