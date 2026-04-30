# 섭외(Scouting) 기능 제거 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 섭외 플로우(제안→수락→확정) 전체를 제거하고, 계약 시트 기반 읽기 전용 Engagement 표시만 유지한다.

**Architecture:** Scouting 모델/API/UI를 삭제하고, 이를 참조하는 파일에서 scouting 관련 코드를 제거한다. Engagement 및 시트 동기화 코드는 그대로 유지한다. DB에서 scoutings 테이블을 drop하는 마이그레이션을 생성한다.

**Tech Stack:** Prisma, Next.js App Router, React, TypeScript

---

### Task 1: Prisma 스키마에서 Scouting 제거

**Files:**
- Modify: `prisma/schema.prisma:47,71,80-112,131`

**Step 1: schema.prisma 수정**

Coach 모델에서 scouting 관계 필드 제거:
```
  scoutings            Scouting[]     ← 삭제 (line 47)
```

Manager 모델에서 scouting 관계 필드 제거:
```
  scoutings         Scouting[]     ← 삭제 (line 71)
```

ScoutingStatus enum 전체 삭제 (lines 82-88):
```prisma
enum ScoutingStatus { ... }
```

Scouting 모델 전체 삭제 (lines 90-112):
```prisma
model Scouting { ... }
```

Course 모델에서 scouting 관계 필드 제거:
```
  scoutings Scouting[]     ← 삭제 (line 131)
```

섹션 주석 `// ─── 섭외 ───` (line 80) 삭제.

**Step 2: 마이그레이션 생성**

Run: `npx prisma migrate dev --name remove-scouting`
Expected: scoutings 테이블 drop, ScoutingStatus enum drop

**Step 3: Prisma 클라이언트 재생성 확인**

Run: `npx prisma generate`
Expected: 성공, Scouting 관련 타입 없음

**Step 4: 커밋**

```bash
git add prisma/
git commit -m "chore: remove Scouting model from Prisma schema"
```

---

### Task 2: 섭외 전용 파일 삭제

**Files:**
- Delete: `src/app/api/scoutings/route.ts`
- Delete: `src/app/api/scoutings/[id]/route.ts`
- Delete: `src/app/api/coach/scoutings/[id]/route.ts`
- Delete: `src/lib/scouting-state-machine.ts`
- Delete: `src/lib/__tests__/scouting-state-machine.test.ts`
- Delete: `src/app/(manager)/mypage/ScoutingTab.tsx`
- Delete: `src/app/(manager)/mypage/ConfirmModal.tsx`
- Delete: `src/components/coach/ScoutingAlerts.tsx`
- Delete: `src/lib/engagement-cascade.ts`

**Step 1: 파일 삭제**

```bash
rm src/app/api/scoutings/route.ts
rm src/app/api/scoutings/\[id\]/route.ts
rm -r src/app/api/scoutings/
rm src/app/api/coach/scoutings/\[id\]/route.ts
rm -r src/app/api/coach/scoutings/
rm src/lib/scouting-state-machine.ts
rm src/lib/__tests__/scouting-state-machine.test.ts
rm src/app/\(manager\)/mypage/ScoutingTab.tsx
rm src/app/\(manager\)/mypage/ConfirmModal.tsx
rm src/components/coach/ScoutingAlerts.tsx
rm src/lib/engagement-cascade.ts
```

**Step 2: 커밋**

```bash
git add -A
git commit -m "chore: delete scouting-only files (API routes, state machine, UI components)"
```

---

### Task 3: notification-service.ts에서 섭외 참조 제거

**Files:**
- Modify: `src/lib/notification-service.ts`

**Step 1: 수정**

섭외 알림 전용 서비스이므로 파일 전체를 정리한다.

- Line 2: `import type { NotificationTrigger } from './scouting-state-machine'` 제거
- `NotificationTrigger` 타입 대신 인라인 타입으로 대체하거나, 섭외 전용 함수들만 남아있으면 사용처 확인 후 파일 삭제 검토
- `createNotification` 함수: scouting_request, scouting_request_modified 타입 관련 분기 제거
- `expireScoutingRequestNotifications` 함수 (lines 127-136): 전체 삭제

사용처가 섭외 API뿐이므로 (이미 Task 2에서 삭제) 파일 전체 삭제 가능. 단, `createNotification`이 다른 곳에서도 사용되는지 확인 필요:

Run: `grep -rn "createNotification\|expireScoutingRequest" src/ --include="*.ts" --include="*.tsx"`

사용처가 삭제된 섭외 API 파일뿐이면 → 파일 전체 삭제.
다른 곳에서도 사용되면 → scouting 참조만 제거하고 유지.

**Step 2: 커밋**

```bash
git add src/lib/notification-service.ts
git commit -m "refactor: remove scouting references from notification service"
```

---

### Task 4: 매니저 마이페이지에서 섭외 탭 제거

**Files:**
- Modify: `src/app/(manager)/mypage/page.tsx`
- Modify: `src/app/(manager)/mypage/utils.ts`

**Step 1: page.tsx 수정**

1. Import 제거:
   - `Scouting` from `"./utils"` (line 5)
   - `ScoutingTab` from `"./ScoutingTab"` (line 7)

2. State 제거:
   - `scoutings` state (line 22): `const [scoutings, setScoutings] = useState<Scouting[]>([])`
   
3. Tab 로직 변경:
   - `activeTab` (line 31): `"scoutings"` 기본값을 `"courses"`로 변경하거나 탭 개념 자체 제거
   - 탭이 과정+투입이력만 남으므로 탭 분기 불필요 — `CourseTab`과 `EngagementHistorySection`을 항상 렌더

4. `fetchScoutings` 콜백 전체 삭제 (lines 58-69)

5. `handleStatusChange` 함수 전체 삭제 (lines 166-223)

6. `handleCourseUpdate`에서 `fetchScoutings` 호출 제거 (line 152-153):
   ```tsx
   if (result.resetScoutings > 0) {
     fetchScoutings(true)
   }
   ```

7. useEffect에서 `fetchScoutings` 호출/폴링 제거 (lines 116-126):
   - `fetchScoutings()` 호출 삭제
   - 30초 간격 폴링 전체 삭제
   - `fetchCourses()`와 `fetchEngagementHistory()`만 유지

8. ScoutingTab 렌더 블록 삭제 (lines 262-270)

9. CourseTab에서 `scoutings` prop 제거 (line 278)

10. `activeTab === "courses"` 조건 제거 — CourseTab + EngagementHistorySection 항상 표시

**Step 2: utils.ts 수정**

다음 항목 삭제:
- `Scouting` 인터페이스 (lines 93-111)
- `CourseGroup` 인터페이스 (lines 113-121) — Scouting 참조
- `STATUS_CONFIG` 상수 (lines 146-153)
- `DAY_NAMES` 상수 (line 155) — buildContractRows에서만 사용되나 함께 삭제
- `SHEET_HEADERS` 상수 (lines 157-164)
- `buildSheetRow` 함수 (lines 219-241)
- `EXCEL_HEADERS` 상수 (lines 243-260)
- `buildContractRows` 함수 (lines 262-304)
- `downloadContractExcel` 함수 (lines 306-316)
- `copyContractToClipboard` 함수 (lines 318-322)
- `getStatusCounts` 함수 (lines 355-362)

유지:
- `EngagementHistory`, `EngagementGroup`, `CoachCourseGroup` 인터페이스
- `groupByCoachCourse`, `groupEngagements` 함수
- `ENGAGEMENT_STATUS`, `formatPeriod` 등 engagement 관련 유틸

**Step 3: CourseTab.tsx — scoutings prop 제거 확인**

Run: `grep -n "scouting\|Scouting" src/app/\(manager\)/mypage/CourseTab.tsx`

CourseTab에서 scoutings prop을 받고 있으면 제거.

**Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공, scouting 관련 타입 에러 없음

**Step 5: 커밋**

```bash
git add src/app/\(manager\)/mypage/
git commit -m "refactor: remove scouting tab from manager mypage"
```

---

### Task 5: Header에서 찜꽁스테이지 네비 변경

**Files:**
- Modify: `src/components/Header.tsx`

**Step 1: 수정**

Line 61 — 찜꽁스테이지 네비 항목:
```tsx
{ href: "/mypage?tab=scoutings", label: "찜꽁스테이지", active: pathname === "/mypage" && (!searchParams || searchParams === "scoutings") },
```

이 항목을 제거하고, 나의 과정 항목(line 62)의 active 조건을 단순화:
```tsx
{ href: "/mypage", label: "마이페이지", active: pathname === "/mypage" },
```

`?tab=courses` 쿼리 파라미터도 더 이상 불필요 — href를 `/mypage`로 변경.

**Step 2: 커밋**

```bash
git add src/components/Header.tsx
git commit -m "refactor: replace scouting nav with simplified mypage link"
```

---

### Task 6: 코치 페이지에서 섭외 알림/참조 제거

**Files:**
- Modify: `src/app/coach/page.tsx`
- Modify: `src/components/coach/ScheduleCalendar.tsx`

**Step 1: coach/page.tsx 수정**

1. Import 제거:
   - `ScoutingAlerts` from `"@/components/coach/ScoutingAlerts"` (line 12)

2. Type/state 제거:
   - `ScoutingEntry` 인터페이스 (lines 54-60)
   - `scoutingEntries` state (line 256): `const [scoutingEntries, setScoutingEntries] = useState<ScoutingEntry[]>([])`
   - `scoutingDates` useMemo (lines 336-342)

3. `fetchSchedule` 응답에서 `scoutings` 처리 제거:
   - Line 369: 타입에서 `scoutings?: ScoutingEntry[]` 제거
   - Line 404: `setScoutingEntries(scheduleData.scoutings || [])` 제거
   - Line 469: `setScoutingEntries(data.scoutings || [])` 제거

4. `selectedDayScoutings` 변수 제거 (lines 788-790)

5. `ScheduleCalendar` props에서 scouting 관련 제거:
   - `dayScoutings={selectedDayScoutings}` (line 863)
   - `scoutingDates={scoutingDates}` (line 864)

6. `ScoutingAlerts` 렌더 블록 전체 삭제 (lines 884-894):
   ```tsx
   {token && (
     <div id="scouting-alerts" className="w-full scroll-mt-4">
       <ScoutingAlerts ... />
     </div>
   )}
   ```

**Step 2: ScheduleCalendar.tsx 수정**

1. Props에서 scouting 관련 제거:
   - `scoutingDates` prop (line 46)
   - `dayScoutings` prop (line 48)

2. 컴포넌트 내부에서 제거:
   - `scoutingDates` 디스트럭처링 (line 69)
   - `dayScoutings` 디스트럭처링 (line 68)
   - `isScouted` 변수 (line 148)
   - 찜꽁 title 속성 (line 197)
   - `dayScoutings` 렌더 블록 (lines 228-250): 선택일 섭외 상세 표시 UI

**Step 3: 커밋**

```bash
git add src/app/coach/page.tsx src/components/coach/ScheduleCalendar.tsx
git commit -m "refactor: remove scouting references from coach page and calendar"
```

---

### Task 7: 코치 스케줄 API에서 섭외 조회 제거

**Files:**
- Modify: `src/app/api/coach/schedule/[yearMonth]/route.ts`

**Step 1: 수정**

1. `Promise.all`에서 `prisma.scouting.findMany(...)` 호출 제거 (lines 93-97 부근)
2. 응답에서 `scoutings` 필드 제거 (line 150 부근)

**Step 2: 커밋**

```bash
git add src/app/api/coach/schedule/
git commit -m "refactor: remove scouting query from coach schedule API"
```

---

### Task 8: 코치 알림 API에서 섭외 enrichment 제거

**Files:**
- Modify: `src/app/api/coach/notifications/route.ts`

**Step 1: 수정**

1. `formatScoutingDisplay` 함수 전체 삭제 (lines 6-27)
2. Scouting batch fetch 블록 삭제 (lines 54-81): scoutingIds 수집 + prisma.scouting.findMany
3. Enrichment 로직에서 scouting 관련 분기 삭제 (lines 83-143): `enriched` 매핑에서 scouting_request 특수 처리를 제거하고, 기본 `base` 반환만 유지

**Step 2: 커밋**

```bash
git add src/app/api/coach/notifications/route.ts
git commit -m "refactor: remove scouting enrichment from coach notifications API"
```

---

### Task 9: 일정 대시보드에서 섭외 일괄생성 제거

**Files:**
- Modify: `src/app/(manager)/schedule/_components/DashboardContent.tsx`

**Step 1: 수정**

1. `scoutingManagers` state 제거 (line 201)
2. 섭외 데이터 fetch 제거 (lines 362, 383, 393, 407)
3. `submitBulkScout` 함수 제거 (lines 716-739 부근)
4. `scoutingManagers` prop 전달 제거 (line 808)

**Step 2: 커밋**

```bash
git add src/app/\(manager\)/schedule/
git commit -m "refactor: remove bulk scouting from schedule dashboard"
```

---

### Task 10: 코치 상세 ScheduleTab에서 섭외 제거

**Files:**
- Modify: `src/components/coaches/detail/ScheduleTab.tsx`

**Step 1: 수정**

1. `scoutingDates` state 제거 (line 111)
2. `fetchScoutings` 함수 및 useEffect 제거 (lines 159-185)
3. 캘린더 셀에서 `isScouted` 로직 제거 (lines 386-387)
4. 선택일 섭외 정보 표시 제거 (lines 512-513)

**Step 2: 커밋**

```bash
git add src/components/coaches/detail/ScheduleTab.tsx
git commit -m "refactor: remove scouting from coach detail schedule view"
```

---

### Task 11: 지표 대시보드에서 섭외 통계 제거

**Files:**
- Modify: `src/app/api/admin/metrics/summary/route.ts`
- Modify: `src/app/admin/metrics/page.tsx`

**Step 1: API 수정 (route.ts)**

1. `calcExternalHireRate` 함수: `scoutingTotal` (prisma.scouting.count) 제거 (line 124). 분모가 없어지므로 `rate` 계산 방식 재검토 — scouting 건수가 분모였으므로, 이 지표 자체가 무의미해짐. 함수와 `calcExternalHireRateSimple` 삭제.
2. `calcCoachPoolByManager` 함수: scoutings 테이블 쿼리 (lines 177-183). 이 함수 전체 삭제 — 섭외 기반 코치풀 통계.
3. `calcScoutingResponseRate` 함수 전체 삭제 (lines 202-215)
4. `calcDailyTrend`: `scoutingsCreated` 필드 관련 쿼리 제거 (lines 259-264 `scoutRaw` 쿼리, line 283 `scoutMap`)
5. `calcTrend`: scouting 관련 계산 제거 (lines 387-389: ext, pool, resp)
6. 최종 응답에서 제거: `externalHireRate`, `coachPoolByManager`, `scoutingResponseRate`, `externalHireHistory`
7. `dailyTrend` 아이템에서 `scoutingsCreated` 필드 제거

**Step 2: 프론트엔드 수정 (metrics/page.tsx)**

1. 섭외 관련 인터페이스/타입 제거: `ScoutingResponseRate`, `scoutingTotal` 필드
2. 섭외 관련 카드 UI 제거: 외부 섭외 비율, 매니저별 코치풀, 섭외 응답률
3. 트렌드 차트에서 `scoutingResponseRate`, `externalHireRate`, `avgCoachPool` 제거
4. dailyTrend에서 `scoutingsCreated` 관련 차트/필드 제거

**Step 3: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

**Step 4: 커밋**

```bash
git add src/app/api/admin/metrics/ src/app/admin/metrics/
git commit -m "refactor: remove scouting metrics from admin dashboard"
```

---

### Task 12: contract-append API 검토

**Files:**
- Review: `src/app/api/admin/contract-append/route.ts`

**Step 1: 확인**

이 API가 Scouting 모델을 직접 참조하는지 확인:
```bash
grep -n "scouting\|Scouting" src/app/api/admin/contract-append/route.ts
```

직접 참조하면 해당 코드 제거. ScoutingTab에서만 호출되었다면 API 자체 삭제 가능.

**Step 2: 커밋 (필요시)**

```bash
git add src/app/api/admin/contract-append/
git commit -m "refactor: remove scouting references from contract-append API"
```

---

### Task 13: 최종 빌드 및 정리

**Step 1: 전체 grep으로 잔여 참조 확인**

```bash
grep -rn "scouting\|Scouting\|ScoutingStatus\|ScoutingAlert\|ScoutingTab\|ConfirmModal\|찜꽁" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".generated"
```

잔여 참조가 있으면 제거.

**Step 2: 임시 스크립트 삭제**

```bash
rm scripts/check-scouting.ts
```

**Step 3: 전체 빌드**

Run: `npm run build`
Expected: 빌드 성공, 에러 없음

**Step 4: 린트**

Run: `npm run lint`
Expected: 성공

**Step 5: 최종 커밋**

```bash
git add -A
git commit -m "chore: final cleanup after scouting removal"
```
