// Korean profanity filter
const BLOCKED_WORDS = [
  '시발', '씨발', '시팔', '씨팔', '시바', '씨바',
  '개새끼', '개세끼', '개색끼', '개색기',
  '병신', '빙신', '병싄',
  'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ',
  '지랄', '좆', '존나', '졸라',
  '미친놈', '미친년', '꺼져', '닥쳐',
  '새끼', '년', '놈',
  'fuck', 'shit', 'damn', 'bitch', 'asshole',
]

export function containsProfanity(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase().replace(/\s/g, '')
  return BLOCKED_WORDS.some((word) => lower.includes(word))
}

export const FEEDBACK_MAX_LENGTH = 200
