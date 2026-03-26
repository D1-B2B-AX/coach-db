import { describe, it, expect } from 'vitest'
import { ALL_SLOTS, toBitmap, subtractBitmap, toIntervals, hasAvailability } from '../schedule-bitmap'

describe('ALL_SLOTS', () => {
  it('has 30 slots from 07:00 to 21:30', () => {
    expect(ALL_SLOTS).toHaveLength(30)
    expect(ALL_SLOTS[0]).toBe('07:00')
    expect(ALL_SLOTS[29]).toBe('21:30')
  })
})

describe('toBitmap', () => {
  it('marks correct slots for 09:00-12:00', () => {
    const bm = toBitmap([{ startTime: '09:00', endTime: '12:00' }])
    expect(bm.filter(Boolean)).toHaveLength(6)
    expect(bm[4]).toBe(true)   // 09:00
    expect(bm[9]).toBe(true)   // 11:30
    expect(bm[10]).toBe(false)  // 12:00 not included
  })

  it('handles multiple intervals', () => {
    const bm = toBitmap([
      { startTime: '07:00', endTime: '08:00' },
      { startTime: '21:00', endTime: '22:00' },
    ])
    expect(bm[0]).toBe(true)
    expect(bm[1]).toBe(true)
    expect(bm[2]).toBe(false)
    expect(bm[28]).toBe(true)
    expect(bm[29]).toBe(true)
  })
})

describe('subtractBitmap + toIntervals', () => {
  it('09:00-18:00 minus 13:00-18:00 = 09:00-13:00', () => {
    const avail = toBitmap([{ startTime: '09:00', endTime: '18:00' }])
    const busy = toBitmap([{ startTime: '13:00', endTime: '18:00' }])
    const result = subtractBitmap(avail, busy)
    expect(toIntervals(result)).toEqual([{ startTime: '09:00', endTime: '13:00' }])
  })

  it('splits when busy is in the middle', () => {
    const avail = toBitmap([{ startTime: '09:00', endTime: '18:00' }])
    const busy = toBitmap([{ startTime: '11:00', endTime: '14:00' }])
    const result = subtractBitmap(avail, busy)
    expect(toIntervals(result)).toEqual([
      { startTime: '09:00', endTime: '11:00' },
      { startTime: '14:00', endTime: '18:00' },
    ])
  })

  it('fully consumed = no availability', () => {
    const avail = toBitmap([{ startTime: '09:00', endTime: '18:00' }])
    const busy = toBitmap([{ startTime: '09:00', endTime: '18:00' }])
    const result = subtractBitmap(avail, busy)
    expect(hasAvailability(result)).toBe(false)
    expect(toIntervals(result)).toEqual([])
  })
})
