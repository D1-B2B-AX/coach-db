export const WORK_TYPE_ORDER = [
  "운영조교",
  "실습코치",
  "삼전 DS",
  "삼전 DX",
  "보조강사",
  "멘토",
] as const

type WorkType = (typeof WORK_TYPE_ORDER)[number]

const WORK_TYPE_SET = new Set<string>(WORK_TYPE_ORDER)

function splitTokens(raw: string): string[] {
  return raw
    .split(/[,/\n]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function normalizeToken(token: string): WorkType | null {
  const t = token.trim()
  if (!t) return null
  if (WORK_TYPE_SET.has(t)) return t as WorkType

  if (/운영\s*조교/.test(t)) return "운영조교"
  if (/실습\s*코치/.test(t)) return "실습코치"
  if (/보조\s*강사/.test(t)) return "보조강사"
  if (/멘토/.test(t)) return "멘토"

  const upper = t.replace(/\s+/g, "").toUpperCase()
  if (
    /(삼전|삼성).*DS/.test(t) ||
    upper === "DS" ||
    upper === "삼전DS" ||
    upper === "삼성DS"
  ) {
    return "삼전 DS"
  }
  if (
    /(삼전|삼성).*DX/.test(t) ||
    upper === "DX" ||
    upper === "삼전DX" ||
    upper === "삼성DX"
  ) {
    return "삼전 DX"
  }

  return null
}

export function normalizeWorkTypeTokens(
  inputs: Array<string | null | undefined>
): WorkType[] {
  const found = new Set<WorkType>()

  for (const input of inputs) {
    if (!input) continue
    for (const token of splitTokens(input)) {
      const normalized = normalizeToken(token)
      if (normalized) found.add(normalized)
    }
  }

  return WORK_TYPE_ORDER.filter((v) => found.has(v))
}

export function normalizeWorkTypeString(raw: string | null | undefined): string | null {
  const tokens = normalizeWorkTypeTokens([raw])
  return tokens.length > 0 ? tokens.join(", ") : null
}

export function mergeWorkTypeStrings(
  ...inputs: Array<string | null | undefined>
): string | null {
  const tokens = normalizeWorkTypeTokens(inputs)
  return tokens.length > 0 ? tokens.join(", ") : null
}
