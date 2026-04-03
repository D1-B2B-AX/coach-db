import { describe, it, expect } from 'vitest'
import { parseCompanyFromCourseName, formatScoutingDisplay } from '../company-alias'

const BASE_PARAMS = {
  date: '2026-04-05',
  managerName: '홍길동',
}

describe('formatScoutingDisplay', () => {
  it('courseName null → simple scouting request', () => {
    const result = formatScoutingDisplay({
      ...BASE_PARAMS,
      courseName: null,
      companyAlias: null,
      restCourseName: null,
    })
    expect(result).toBe('4/5 찜꽁 (홍길동 매니저)')
  })

  it('courseName empty string → same as null', () => {
    const result = formatScoutingDisplay({
      ...BASE_PARAMS,
      courseName: '',
      companyAlias: null,
      restCourseName: null,
    })
    expect(result).toBe('4/5 찜꽁 (홍길동 매니저)')
  })

  it('courseName with company alias → alias + restCourseName', () => {
    const { companyName, restCourseName } = parseCompanyFromCourseName(
      '삼성전자 AI개발과정',
      ['삼성전자']
    )
    const result = formatScoutingDisplay({
      ...BASE_PARAMS,
      courseName: '삼성전자 AI개발과정',
      companyAlias: companyName ? 'S사' : null,
      restCourseName,
    })
    expect(result).toBe('4/5 찜꽁 — S사 AI개발과정 (홍길동 매니저)')
  })

  it('companyAlias null but courseName exists → courseName displayed', () => {
    const result = formatScoutingDisplay({
      ...BASE_PARAMS,
      courseName: 'LG전자 신입과정',
      companyAlias: null,
      restCourseName: null,
    })
    expect(result).toBe('4/5 찜꽁 — LG전자 신입과정 (홍길동 매니저)')
  })

  it('no company match → courseName displayed as-is', () => {
    const result = formatScoutingDisplay({
      ...BASE_PARAMS,
      courseName: '2026 상반기 프로그래밍',
      companyAlias: null,
      restCourseName: null,
    })
    expect(result).toBe('4/5 찜꽁 — 2026 상반기 프로그래밍 (홍길동 매니저)')
  })

  it('date formatting: december date', () => {
    const result = formatScoutingDisplay({
      date: '2026-12-25',
      managerName: '홍길동',
      courseName: null,
      companyAlias: null,
      restCourseName: null,
    })
    expect(result).toBe('12/25 찜꽁 (홍길동 매니저)')
  })
})

describe('parseCompanyFromCourseName', () => {
  it('longest match wins: 삼성전자 over 삼성', () => {
    const { companyName, restCourseName } = parseCompanyFromCourseName(
      '삼성전자 과정',
      ['삼성', '삼성전자']
    )
    expect(companyName).toBe('삼성전자')
    expect(restCourseName).toBe('과정')
  })

  it('no match returns null with original courseName', () => {
    const { companyName, restCourseName } = parseCompanyFromCourseName(
      '2026 상반기 프로그래밍',
      ['삼성전자', 'LG전자']
    )
    expect(companyName).toBeNull()
    expect(restCourseName).toBe('2026 상반기 프로그래밍')
  })

  it('startsWith match strips prefix', () => {
    const { companyName, restCourseName } = parseCompanyFromCourseName(
      '삼성전자 AI개발과정',
      ['삼성전자']
    )
    expect(companyName).toBe('삼성전자')
    expect(restCourseName).toBe('AI개발과정')
  })

  it('empty knownCompanies returns null', () => {
    const { companyName, restCourseName } = parseCompanyFromCourseName(
      '삼성전자 AI개발과정',
      []
    )
    expect(companyName).toBeNull()
    expect(restCourseName).toBe('삼성전자 AI개발과정')
  })
})
