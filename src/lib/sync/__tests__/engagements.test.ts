import { describe, it, expect } from 'vitest'
import { parseWorkSchedules, extractDates, extractTimeRanges, extractWeekdays, expandRange, parseDate } from '../engagements'

describe('parseWorkSchedules', () => {
  it('단일 날짜+시간: "2023.02.13(월) 09:00~17:00"', () => {
    const result = parseWorkSchedules('2023.02.13(월) 09:00~17:00', 2023)
    expect(result).toHaveLength(1)
    expect(result[0].startTime).toBe('09:00')
    expect(result[0].endTime).toBe('17:00')
    expect(result[0].date.getMonth()).toBe(1) // February
    expect(result[0].date.getDate()).toBe(13)
  })

  it('날짜 범위 + 요일 필터: Mon-Fri', () => {
    const result = parseWorkSchedules('2023. 1. 2 ~ 2023. 1. 6 (월~금) 08:00 ~ 17:00', 2023)
    expect(result).toHaveLength(5)
    expect(result[0].startTime).toBe('08:00')
  })

  it('같은 달 짧은 범위: "2023. 1.9(월)~12(목) 08:00 ~ 11:30"', () => {
    const result = parseWorkSchedules('2023. 1.9(월)~12(목) 08:00 ~ 11:30', 2023)
    expect(result).toHaveLength(4)
  })

  it('빈 값 → 빈 배열', () => {
    expect(parseWorkSchedules(null)).toEqual([])
    expect(parseWorkSchedules('')).toEqual([])
    expect(parseWorkSchedules(undefined)).toEqual([])
  })

  it('시간 없는 텍스트 → 빈 배열', () => {
    expect(parseWorkSchedules('SQL 기초 - 20문항')).toEqual([])
  })
})

describe('extractTimeRanges', () => {
  it('single range', () => {
    const result = extractTimeRanges('09:00~17:00')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ start: '09:00', end: '17:00' })
  })

  it('multiple ranges', () => {
    const result = extractTimeRanges('10:00 - 11:00 , 20:00 - 22:00')
    expect(result).toHaveLength(2)
  })
})

describe('extractWeekdays', () => {
  it('(월~금)', () => {
    expect(extractWeekdays('(월~금)')).toEqual([1, 2, 3, 4, 5])
  })

  it('주말 제외', () => {
    expect(extractWeekdays('주말 제외')).toEqual([1, 2, 3, 4, 5])
  })

  it('no filter', () => {
    expect(extractWeekdays('some text')).toBeNull()
  })
})

describe('parseDate', () => {
  it('YYYY.MM.DD format', () => {
    const d = parseDate('2023.02.13')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2023)
    expect(d!.getMonth()).toBe(1)
    expect(d!.getDate()).toBe(13)
  })

  it('null/empty → null', () => {
    expect(parseDate(null)).toBeNull()
    expect(parseDate('')).toBeNull()
  })

  it('Excel serial number', () => {
    const d = parseDate('44939') // 2023-01-13
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2023)
  })
})

describe('expandRange', () => {
  it('3-day range', () => {
    const result = expandRange(new Date(2023, 0, 1), new Date(2023, 0, 3))
    expect(result).toHaveLength(3)
  })

  it('with weekday filter (Mon-Fri)', () => {
    // 2023-01-02 (Mon) to 2023-01-08 (Sun)
    const result = expandRange(new Date(2023, 0, 2), new Date(2023, 0, 8), [1, 2, 3, 4, 5])
    expect(result).toHaveLength(5)
  })
})
