# 대시보드 데이터 흐름 + UI 리디자인 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 데이터 소스 정리 (CoachSchedule=코치전용, EngagementSchedule=계약전용) + 대시보드에 시간필터 연동/기간선택 추가

**Architecture:** 구글시트 동기화에서 CoachSchedule 생성 제거, 수동 이력 등록 시 EngagementSchedule 자동 전개, 시간 필터를 캘린더 상단으로 이동하여 월간 숫자와 연동, 캘린더에서 기간 선택(클릭→클릭) 지원

**Tech Stack:** TypeScript, Next.js 16, Prisma, Vitest, schedule-bitmap.ts

---

### Task 1: 구글시트 동기화에서 CoachSchedule 생성 제거

**Files:**
- Modify: `src/lib/sync/engagements.ts:478-500`
- Modify: `src/lib/sync/samsung-schedule.ts:221-244`
- Test: `src/lib/sync/__tests__/engagements.test.ts`
- Test: `src/lib/sync/__tests__/samsung-schedule.test.ts`

**Step 1: engagements.ts에서 CoachSchedule 생성 코드 제거**

`src/lib/sync/engagements.ts` 478-500줄의 coach_schedules 생성 블럭 전체 삭제.

**Step 2: samsung-schedule.ts에서 CoachSchedule 생성 코드 제거**

`src/lib/sync/samsung-schedule.ts` 221-244줄의 coach_schedules 생성 블럭 전체 삭제.

**Step 3: 테스트 실행**

Run: `npx vitest run src/lib/sync/__tests__/`
Expected: 기존 테스트 통과 (CoachSchedule 관련 assertion 있으면 제거)

**Step 4: 커밋**

```bash
git add src/lib/sync/engagements.ts src/lib/sync/samsung-schedule.ts src/lib/sync/__tests__/
git commit -m "refactor: remove CoachSchedule creation from sheet sync

CoachSchedule is now coach-input only. Sheet sync only creates EngagementSchedule."
```

---

### Task 2: 수동 이력 등록 시 EngagementSchedule 자동 생성

**Files:**
- Modify: `src/app/api/coaches/[id]/engagements/route.ts:100-115`
- Modify: `src/app/api/engagements/[id]/route.ts` (PUT — 날짜 변경 시 재생성)

**Step 1: POST 핸들러에 EngagementSchedule 자동 생성 추가**

`src/app/api/coaches/[id]/engagements/route.ts` POST 핸들러에서 engagement 생성 후:

```typescript
// 평일 전개: startDate ~ endDate, 월~금만
const start = new Date(startDate + 'T12:00:00Z')
const end = new Date(endDate + 'T12:00:00Z')
const scheduleData: { engagementId: string; coachId: string; date: Date; startTime: string; endTime: string }[] = []
const cursor = new Date(start)
while (cursor <= end) {
  const dow = cursor.getUTCDay()
  if (dow >= 1 && dow <= 5) { // 월~금
    scheduleData.push({
      engagementId: engagement.id,
      coachId: id,
      date: new Date(cursor),
      startTime: startTime || '09:00',
      endTime: endTime || '18:00',
    })
  }
  cursor.setUTCDate(cursor.getUTCDate() + 1)
}
if (scheduleData.length > 0) {
  await prisma.engagementSchedule.createMany({ data: scheduleData })
}
```

**Step 2: PUT 핸들러에서 날짜/시간 변경 시 EngagementSchedule 재생성**

`src/app/api/engagements/[id]/route.ts` PUT 핸들러에서 startDate/endDate/startTime/endTime 변경 시:

```typescript
if (startDate !== undefined || endDate !== undefined || startTime !== undefined || endTime !== undefined) {
  // 기존 삭제 후 재생성
  await prisma.engagementSchedule.deleteMany({ where: { engagementId: id } })
  // 위와 동일한 평일 전개 로직
}
```

**Step 3: 빌드 확인**

Run: `npx next build`
Expected: 빌드 성공

**Step 4: 커밋**

```bash
git add src/app/api/coaches/[id]/engagements/route.ts src/app/api/engagements/[id]/route.ts
git commit -m "feat: auto-generate EngagementSchedule on manual engagement creation"
```

---

### Task 3: 시간 필터를 캘린더 상단으로 이동

**Files:**
- Modify: `src/components/dashboard/DashboardCalendar.tsx`
- Modify: `src/components/dashboard/DashboardCoachList.tsx`
- Modify: `src/app/(manager)/dashboard/page.tsx`

**Step 1: DashboardCalendar에 시간 필터 props 추가**

```typescript
interface DashboardCalendarProps {
  // 기존 props...
  timeFilter: string
  onTimeFilterChange: (filter: string) => void
  customStart: string
  customEnd: string
  onCustomTimeApply: (start: string, end: string) => void
}
```

**Step 2: DashboardCoachList에서 시간 필터 UI 제거**

시간 프리셋 버튼 + TimeRangeDropdown을 DashboardCoachList에서 삭제.

**Step 3: DashboardCalendar에 시간 필터 UI 추가**

캘린더 헤더(월 네비게이션) 위에 시간 프리셋 버튼 + 시간 지정 드롭다운 배치.

**Step 4: dashboard/page.tsx에서 props 연결**

timeFilter 상태를 DashboardCalendar에도 전달. customStart/customEnd 상태를 page 레벨로 올림.

**Step 5: 빌드 확인 + 커밋**

---

### Task 4: 월간 요약 API에 시간 필터 지원 추가

**Files:**
- Modify: `src/app/api/schedules/[yearMonth]/route.ts`

**Step 1: 쿼리 파라미터로 timeFilter 수신**

```typescript
const { searchParams } = _request.nextUrl
const timeFilter = searchParams.get('timeFilter')
const customStart = searchParams.get('customStart')
const customEnd = searchParams.get('customEnd')
```

**Step 2: 비트맵 차감 후 시간 필터 교차**

기존 `subtractBitmap` 결과에 시간 필터 비트맵을 AND 연산:

```typescript
if (filterStart && filterEnd) {
  const filterBm = toBitmap([{ startTime: filterStart, endTime: filterEnd }])
  remain = remain.map((v, i) => v && filterBm[i])
}
```

**Step 3: dashboard/page.tsx에서 fetchMonthData에 timeFilter 전달**

```typescript
const params = new URLSearchParams()
if (timeFilter !== 'all') params.set('timeFilter', timeFilter)
if (timeFilter === 'custom') {
  params.set('customStart', customStart)
  params.set('customEnd', customEnd)
}
const qs = params.toString() ? `?${params}` : ''
const res = await fetch(`/api/schedules/${yearMonth}${qs}`)
```

**Step 4: 빌드 확인 + 커밋**

---

### Task 5: 캘린더 기간 선택 (클릭→클릭)

**Files:**
- Modify: `src/components/dashboard/DashboardCalendar.tsx`
- Modify: `src/app/(manager)/dashboard/page.tsx`
- Modify: `src/app/api/schedules/[yearMonth]/[date]/route.ts`

**Step 1: 날짜 선택 상태를 단일 → 범위로 변경**

dashboard/page.tsx:
```typescript
const [selectedStart, setSelectedStart] = useState<string>(formatDate(now))
const [selectedEnd, setSelectedEnd] = useState<string | null>(null)
```

**Step 2: DashboardCalendar 클릭 로직 변경**

```typescript
// 첫 번째 클릭 = 시작일, 두 번째 클릭 = 종료일
// 같은 날 다시 클릭 = 단일 날짜 선택으로 리셋
// 시작일보다 이전 날짜 클릭 = 새로운 시작일로
```

**Step 3: 캘린더에서 선택 범위 하이라이트**

시작일~종료일 사이 날짜에 배경색 적용.

**Step 4: 날짜별 API를 범위 지원으로 확장**

`/api/schedules/[yearMonth]/[date]` API에 `endDate` 쿼리 파라미터 추가:
- endDate 없으면 기존과 동일 (단일 날짜)
- endDate 있으면 모든 날짜에 공통으로 가용한 코치만 반환 (비트맵 교차)

**Step 5: 빌드 확인 + 커밋**

---

### Task 6: 필터 요약 라인 추가

**Files:**
- Modify: `src/components/dashboard/DashboardCoachList.tsx`

**Step 1: 코치 목록 상단에 요약 텍스트 추가**

```typescript
// 선택 상태에 따라 자동 생성:
// "3/26(수) 가용 코치 8명"
// "3/25(화)~3/28(금), 09:00~12:00 가용 코치 2명"
```

Props에 selectedStart, selectedEnd, timeFilter 정보를 받아서 렌더링.

**Step 2: 빌드 확인 + 커밋**
