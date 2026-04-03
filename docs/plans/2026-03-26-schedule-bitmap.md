# Engagement Schedule 분리 + 가용시간 비트맵 차감

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** coach_schedules(가용)와 engagement_schedules(확정)를 분리하고, 대시보드에서 비트맵 차감으로 실제 가용시간만 표시

**Architecture:** 30분 슬롯 비트맵(boolean[30])으로 가용/확정 시간을 표현, API 레이어에서 차감. DB 변경 없음 (스키마는 이미 추가됨).

**Tech Stack:** TypeScript, Vitest, Prisma

---

# Part 1: 배경

`coach_schedules`에 코치 가용 시간과 계약 근무 시간이 구분 없이 저장되어 있었음.

**해결:** `engagement_schedules` 테이블 신설하여 분리.
- `coach_schedules`: 코치가 입력한 가용 시간
- `engagement_schedules`: 계약으로 확정된 근무 시간 (engagement에 종속)

## 완료된 작업

| # | 태스크 | 상태 |
|---|--------|------|
| 1 | 스키마 추가 (`EngagementSchedule` 모델) | 완료 |
| 2 | 데이터 이관 스크립트 (`scripts/migrate-engagement-schedules.ts`) | 진행 중 |
| 3 | import 스크립트 수정 (삼성 완료, engagements 대기) | 진행 중 |

### 스키마 (완료)

```prisma
model EngagementSchedule {
  id           String     @id @default(uuid())
  engagementId String     @map("engagement_id")
  coachId      String     @map("coach_id")
  date         DateTime   @db.Date
  startTime    String     @map("start_time") @db.VarChar(5)
  endTime      String     @map("end_time") @db.VarChar(5)
  engagement   Engagement @relation(...)
  coach        Coach      @relation(...)
  @@map("engagement_schedules")
}
```

### 이관 스크립트 로직 (진행 중)

`scripts/migrate-engagement-schedules.ts`:
1. cancelled가 아닌 모든 engagement 조회
2. 각 engagement의 startDate~endDate 기간 내 해당 코치의 coach_schedules 조회
3. 매칭된 schedule → engagement_schedules에 INSERT
4. coach_schedules에 매칭이 없으면 engagement의 날짜범위 × startTime/endTime으로 생성 (평일만)

---

# Part 2: 비트맵 차감 설계

## 문제

1. **일별 API**: 가용 슬롯과 계약 시간이 조금이라도 겹치면 슬롯 전체를 제거 → 부분 겹침 시 남은 시간도 사라짐
2. **월별 API**: 차감 로직 자체가 없음 → 계약으로 가용시간이 0인 코치도 달력 숫자에 포함

## 비트맵 방식

하루를 30분 단위 슬롯 배열로 표현 (07:00~21:30, 30칸).

```
시간:   07:00 07:30 08:00 ... 13:00 13:30 ... 21:00 21:30
인덱스:  [0]   [1]   [2]  ... [12]  [13]  ... [28]  [29]
```

연산:
1. `CoachSchedule` → 슬롯 `true`로 채우기
2. `EngagementSchedule` (cancelled 제외) → 슬롯 `false`로 빼기
3. 연속된 `true` 구간을 `startTime`/`endTime`으로 변환

### 차감 조건

| Engagement 상태 | 차감 | 이유 |
|---|---|---|
| scheduled | O | 확정된 계약 |
| in_progress | O | 진행 중 |
| completed | O | 일관성 |
| cancelled | X | 취소 → 시간 복구 |

---

# Part 3: 구현 계획

### Task 1: 비트맵 유틸 — 테스트 작성

**Files:**
- Create: `src/lib/__tests__/schedule-bitmap.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { ALL_SLOTS, toBitmap, subtractBitmap, toIntervals } from '../schedule-bitmap'

describe('ALL_SLOTS', () => {
  it('has 30 slots from 07:00 to 21:30', () => {
    expect(ALL_SLOTS).toHaveLength(30)
    expect(ALL_SLOTS[0]).toBe('07:00')
    expect(ALL_SLOTS[ALL_SLOTS.length - 1]).toBe('21:30')
  })
})

describe('toBitmap', () => {
  it('marks correct slots for a time range', () => {
    const bm = toBitmap([{ startTime: '09:00', endTime: '12:00' }])
    expect(bm.filter(Boolean)).toHaveLength(6)
    expect(bm[4]).toBe(true)   // 09:00
    expect(bm[10]).toBe(false) // 12:00 is endTime, not included
  })

  it('handles multiple intervals', () => {
    const bm = toBitmap([
      { startTime: '07:00', endTime: '08:00' },
      { startTime: '21:00', endTime: '22:00' },
    ])
    expect(bm[0]).toBe(true)   // 07:00
    expect(bm[2]).toBe(false)  // 08:00
    expect(bm[28]).toBe(true)  // 21:00
  })

  it('returns all false for empty intervals', () => {
    expect(toBitmap([]).every(v => !v)).toBe(true)
  })
})

describe('subtractBitmap', () => {
  it('subtracts busy from available', () => {
    const avail = toBitmap([{ startTime: '09:00', endTime: '18:00' }])
    const busy = toBitmap([{ startTime: '13:00', endTime: '18:00' }])
    expect(toIntervals(subtractBitmap(avail, busy))).toEqual([
      { startTime: '09:00', endTime: '13:00' },
    ])
  })

  it('splits into two intervals when busy is in the middle', () => {
    const avail = toBitmap([{ startTime: '09:00', endTime: '18:00' }])
    const busy = toBitmap([{ startTime: '11:00', endTime: '14:00' }])
    expect(toIntervals(subtractBitmap(avail, busy))).toEqual([
      { startTime: '09:00', endTime: '11:00' },
      { startTime: '14:00', endTime: '18:00' },
    ])
  })

  it('returns empty when fully overlapped', () => {
    const avail = toBitmap([{ startTime: '13:00', endTime: '18:00' }])
    const busy = toBitmap([{ startTime: '13:00', endTime: '18:00' }])
    expect(toIntervals(subtractBitmap(avail, busy))).toEqual([])
  })
})

describe('toIntervals', () => {
  it('converts consecutive true slots to intervals', () => {
    const bm = new Array(30).fill(false)
    bm[0] = true; bm[1] = true
    expect(toIntervals(bm)).toEqual([{ startTime: '07:00', endTime: '08:00' }])
  })

  it('handles last slot correctly', () => {
    const bm = new Array(30).fill(false)
    bm[29] = true
    expect(toIntervals(bm)).toEqual([{ startTime: '21:30', endTime: '22:00' }])
  })
})
```

Run: `npx vitest run src/lib/__tests__/schedule-bitmap.test.ts`
Expected: FAIL (module not found)

---

### Task 2: 비트맵 유틸 — 구현

**Files:**
- Create: `src/lib/schedule-bitmap.ts`

```ts
type Interval = { startTime: string; endTime: string }

export const ALL_SLOTS: string[] = []
for (let h = 7; h <= 21; h++) {
  ALL_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  ALL_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

const slotIndex = new Map(ALL_SLOTS.map((s, i) => [s, i]))

export function toBitmap(intervals: Interval[]): boolean[] {
  const bm = new Array(ALL_SLOTS.length).fill(false)
  for (const { startTime, endTime } of intervals) {
    const start = slotIndex.get(startTime) ?? 0
    const end = slotIndex.get(endTime) ?? ALL_SLOTS.length
    for (let i = start; i < end; i++) bm[i] = true
  }
  return bm
}

export function subtractBitmap(available: boolean[], busy: boolean[]): boolean[] {
  return available.map((v, i) => v && !busy[i])
}

export function toIntervals(bitmap: boolean[]): Interval[] {
  const intervals: Interval[] = []
  let start: number | null = null
  for (let i = 0; i <= bitmap.length; i++) {
    if (i < bitmap.length && bitmap[i]) {
      if (start === null) start = i
    } else if (start !== null) {
      intervals.push({
        startTime: ALL_SLOTS[start],
        endTime: endOfSlot(ALL_SLOTS[i - 1]),
      })
      start = null
    }
  }
  return intervals
}

function endOfSlot(slot: string): string {
  const [h, m] = slot.split(':').map(Number)
  const totalMin = h * 60 + m + 30
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
}
```

Run: `npx vitest run src/lib/__tests__/schedule-bitmap.test.ts`
Expected: ALL PASS

---

### Task 3: TimePanel ALL_SLOTS → 공유 모듈 import

**Files:**
- Modify: `src/components/coach/TimePanel.tsx:5-10`

기존 ALL_SLOTS 정의 제거, `export { ALL_SLOTS } from '@/lib/schedule-bitmap'`로 교체.

---

### Task 4: 일별 API — 비트맵 차감으로 교체

**Files:**
- Modify: `src/app/api/schedules/[yearMonth]/[date]/route.ts:105-170`

EngagementSchedule 조회 → 코치별 비트맵 차감 → 남은 가용시간 0이면 코치 제외.

---

### Task 5: 월별 API — 비트맵 차감 추가

**Files:**
- Modify: `src/app/api/schedules/[yearMonth]/route.ts`

EngagementSchedule 조회 + 날짜/코치별 비트맵 차감 후 남은 가용시간 있는 코치만 카운트.

---

### Task 6: 근무일 집계 변경

**Files:**
- Modify: `src/app/api/coaches/route.ts`
- Modify: `src/app/api/coaches/[id]/work-summary/route.ts`

`coach_schedules` 대신 `engagement_schedules`에서 `COUNT(DISTINCT date)` 조회.

---

### Task 7: 스케줄탭 구분 표시

**Files:**
- Modify: `src/app/api/coaches/[id]/schedules/route.ts`
- Modify: `src/components/coaches/detail/ScheduleTab.tsx`

캘린더: 초록(가용) / 파랑(확정) 분리. 확정 시간은 과정명과 함께 표시.

---

### Task 8: 검증 + 프로덕션 배포

1. 로컬 대시보드/코치목록/스케줄탭 확인
2. 프로덕션 DB에 이관 스크립트 실행
3. Railway 배포
