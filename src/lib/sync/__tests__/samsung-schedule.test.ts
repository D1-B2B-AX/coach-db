import { describe, it, expect } from 'vitest'
import { parseDate, expandDateRange } from '../samsung-schedule'

describe('parseDate', () => {
  it('YYYY-MM-DD', () => {
    const d = parseDate('2026-03-04')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(2) // March
    expect(d!.getDate()).toBe(4)
  })

  it('YYYY.MM.DD', () => {
    const d = parseDate('2026.03.04')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(2)
    expect(d!.getDate()).toBe(4)
  })

  it('YYYY/MM/DD', () => {
    const d = parseDate('2026/03/04')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(2)
    expect(d!.getDate()).toBe(4)
  })

  it('Excel serial number', () => {
    const d = parseDate('46082') // some date in 2026
    expect(d).not.toBeNull()
    // Excel serial 46082 = 2026-03-04
    expect(d!.getFullYear()).toBeGreaterThanOrEqual(2020)
    expect(d!.getFullYear()).toBeLessThanOrEqual(2030)
  })

  it('null/empty → null', () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })

  it('whitespace-only → null', () => {
    expect(parseDate('   ')).toBeNull()
  })

  it('invalid string → null', () => {
    expect(parseDate('hello')).toBeNull()
    expect(parseDate('abc-def-ghi')).toBeNull()
  })

  it('out-of-range serial number → null', () => {
    expect(parseDate('100')).toBeNull()
    expect(parseDate('70000')).toBeNull()
  })
})

describe('expandDateRange', () => {
  it('3-day inclusive range', () => {
    const result = expandDateRange(new Date(2026, 0, 5), new Date(2026, 0, 7))
    expect(result).toHaveLength(3)
    expect(result[0].getDate()).toBe(5)
    expect(result[1].getDate()).toBe(6)
    expect(result[2].getDate()).toBe(7)
  })

  it('single day (start == end)', () => {
    const result = expandDateRange(new Date(2026, 0, 5), new Date(2026, 0, 5))
    expect(result).toHaveLength(1)
    expect(result[0].getDate()).toBe(5)
  })

  it('safety limit prevents infinite loop', () => {
    const result = expandDateRange(new Date(2020, 0, 1), new Date(2025, 0, 1))
    expect(result.length).toBeLessThanOrEqual(366)
  })

  it('spans month boundary correctly', () => {
    const result = expandDateRange(new Date(2026, 0, 30), new Date(2026, 1, 2))
    expect(result).toHaveLength(4) // Jan 30, 31, Feb 1, 2
    expect(result[0].getMonth()).toBe(0) // January
    expect(result[0].getDate()).toBe(30)
    expect(result[3].getMonth()).toBe(1) // February
    expect(result[3].getDate()).toBe(2)
  })

  it('returns empty array when start > end', () => {
    const result = expandDateRange(new Date(2026, 0, 10), new Date(2026, 0, 5))
    expect(result).toHaveLength(0)
  })
})
