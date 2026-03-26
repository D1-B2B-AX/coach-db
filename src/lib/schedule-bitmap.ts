/**
 * 30-minute slot bitmap for schedule subtraction.
 * Slots: 07:00, 07:30, 08:00, ... 21:30 (30 slots)
 */

export const ALL_SLOTS = Array.from({ length: 30 }, (_, i) => {
  const h = Math.floor(i / 2) + 7
  const m = (i % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

/** Convert time intervals to a boolean[30] bitmap */
export function toBitmap(intervals: { startTime: string; endTime: string }[]): boolean[] {
  const bm = new Array(30).fill(false)
  for (const { startTime, endTime } of intervals) {
    const si = slotIndex(startTime)
    const ei = slotIndex(endTime)
    if (si === -1 || ei === -1) continue
    for (let i = si; i < ei; i++) bm[i] = true
  }
  return bm
}

/** Subtract busy bitmap from available bitmap */
export function subtractBitmap(available: boolean[], busy: boolean[]): boolean[] {
  return available.map((v, i) => v && !busy[i])
}

/** Convert bitmap back to time intervals */
export function toIntervals(bm: boolean[]): { startTime: string; endTime: string }[] {
  const intervals: { startTime: string; endTime: string }[] = []
  let start: number | null = null
  for (let i = 0; i <= bm.length; i++) {
    if (i < bm.length && bm[i]) {
      if (start === null) start = i
    } else if (start !== null) {
      intervals.push({
        startTime: ALL_SLOTS[start],
        endTime: i < ALL_SLOTS.length ? ALL_SLOTS[i] : '22:00',
      })
      start = null
    }
  }
  return intervals
}

/** Check if bitmap has any available slot */
export function hasAvailability(bm: boolean[]): boolean {
  return bm.some(Boolean)
}

function slotIndex(time: string): number {
  const [h, m] = time.split(':').map(Number)
  const idx = (h - 7) * 2 + (m >= 30 ? 1 : 0)
  if (idx < 0 || idx > 30) return -1
  return idx
}
