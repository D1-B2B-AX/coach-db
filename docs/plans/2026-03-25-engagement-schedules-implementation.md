# engagement_schedules 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** engagement_schedules 테이블을 신설하여 계약 확정 시간과 코치 가용 시간을 분리하고, 대시보드에서 실제 가용 시간을 정확히 표시한다.

**Architecture:** Prisma 스키마에 EngagementSchedule 모델 추가, 기존 engagement 데이터에서 이관 스크립트로 데이터 생성, import 스크립트 수정, 대시보드/코치목록 API에서 engagement_schedules를 활용한 실제 가용 시간 계산.

**Tech Stack:** Prisma 7, PostgreSQL, Next.js API Routes, TypeScript

---

### Task 1: Prisma 스키마 추가

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: EngagementSchedule 모델 추가**

`Engagement` 모델 아래에 추가:

```prisma
model EngagementSchedule {
  id           String     @id @default(uuid())
  engagementId String     @map("engagement_id")
  coachId      String     @map("coach_id")
  date         DateTime   @db.Date
  startTime    String     @map("start_time") @db.VarChar(5)
  endTime      String     @map("end_time") @db.VarChar(5)
  engagement   Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  coach        Coach      @relation(fields: [coachId], references: [id], onDelete: Cascade)

  @@map("engagement_schedules")
}
```

`Engagement` 모델에 relation 추가:
```prisma
  schedules EngagementSchedule[]
```

`Coach` 모델에 relation 추가:
```prisma
  engagementSchedules EngagementSchedule[]
```

**Step 2: Prisma client 생성 + DB 마이그레이션**

```bash
npx prisma db push
npx prisma generate
```

**Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

**Step 4: 커밋**

```bash
git add prisma/schema.prisma src/generated/
git commit -m "feat: add engagement_schedules table schema"
```

---

### Task 2: 데이터 이관 스크립트

**Files:**
- Create: `scripts/migrate-engagement-schedules.ts`

**Step 1: 이관 스크립트 작성**

기존 engagement의 M열 파싱 결과(coach_schedules에 들어간 데이터)를 engagement와 매칭하여 engagement_schedules에 복사.

로직:
1. 모든 engagement 조회 (cancelled 제외)
2. 각 engagement의 startDate~endDate 기간 내 해당 코치의 coach_schedules 조회
3. 매칭된 schedule을 engagement_schedules에 INSERT (중복 체크)
4. engagement에 startTime/endTime만 있고 coach_schedules에 매칭이 없는 경우: engagement의 날짜 범위 × startTime/endTime으로 생성

```typescript
// scripts/migrate-engagement-schedules.ts
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

async function main() {
  const engagements = await prisma.engagement.findMany({
    where: { status: { not: 'cancelled' } },
    include: { coach: { select: { id: true, name: true } } },
  })

  console.log(`처리할 engagement: ${engagements.length}건`)

  let created = 0
  let skipped = 0

  for (const eng of engagements) {
    // Find matching coach_schedules within engagement date range
    const schedules = await prisma.coachSchedule.findMany({
      where: {
        coachId: eng.coachId,
        date: { gte: eng.startDate, lte: eng.endDate },
      },
    })

    if (schedules.length > 0) {
      // Use actual schedule data
      for (const s of schedules) {
        const existing = await prisma.engagementSchedule.findFirst({
          where: {
            engagementId: eng.id,
            coachId: eng.coachId,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
          },
        })
        if (!existing) {
          await prisma.engagementSchedule.create({
            data: {
              engagementId: eng.id,
              coachId: eng.coachId,
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
            },
          })
          created++
        } else {
          skipped++
        }
      }
    } else if (eng.startTime && eng.endTime) {
      // No schedule data — generate from date range + time
      const cursor = new Date(eng.startDate)
      while (cursor <= eng.endDate) {
        const dow = cursor.getDay()
        if (dow !== 0 && dow !== 6) { // weekdays only
          const existing = await prisma.engagementSchedule.findFirst({
            where: {
              engagementId: eng.id,
              coachId: eng.coachId,
              date: new Date(cursor),
              startTime: eng.startTime!,
              endTime: eng.endTime!,
            },
          })
          if (!existing) {
            await prisma.engagementSchedule.create({
              data: {
                engagementId: eng.id,
                coachId: eng.coachId,
                date: new Date(cursor),
                startTime: eng.startTime!,
                endTime: eng.endTime!,
              },
            })
            created++
          } else {
            skipped++
          }
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }
  }

  console.log(`engagement_schedules 생성: ${created}건, 중복 스킵: ${skipped}건`)
  const total = await prisma.engagementSchedule.count()
  console.log(`전체 engagement_schedules: ${total}건`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

**Step 2: 로컬에서 실행 테스트**

```bash
npx tsx scripts/migrate-engagement-schedules.ts
```

**Step 3: 프로덕션 DB에서 실행**

```bash
DATABASE_URL="postgresql://..." npx tsx scripts/migrate-engagement-schedules.ts
```

**Step 4: 커밋**

```bash
git add scripts/migrate-engagement-schedules.ts
git commit -m "feat: add engagement_schedules migration script"
```

---

### Task 3: import 스크립트 수정

**Files:**
- Modify: `scripts/import-engagements.ts:452-477`
- Modify: `scripts/import-samsung-schedule.ts:207`

**Step 1: import-engagements.ts — engagement_schedules에도 저장**

기존 `coach_schedules` 저장 로직 아래에 `engagement_schedules` 저장 추가.
engagement 생성 시 반환된 ID 사용.

기존 코드 (452-477행)에서 engagement를 생성한 후 `engagementId`를 받아서:

```typescript
// 기존 coachSchedule.create 루프 아래에 추가
// Also insert into engagement_schedules
if (!existing) {
  // engagementId is from the newly created engagement
  for (const sched of eng.schedules) {
    await prisma.engagementSchedule.create({
      data: {
        engagementId: createdEng.id, // 새로 생성된 engagement의 ID
        coachId: eng.coachId,
        date: sched.date,
        startTime: sched.startTime,
        endTime: sched.endTime,
      },
    })
  }
}
```

engagement `create` 결과를 변수에 저장하도록 수정 필요:
```typescript
const createdEng = await prisma.engagement.create({ ... })
```

**Step 2: import-samsung-schedule.ts — engagement_schedules에도 저장**

삼성 스크립트도 동일하게 `engagementSchedule.create` 추가.

**Step 3: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add scripts/
git commit -m "feat: import scripts write to engagement_schedules"
```

---

### Task 4: 대시보드 API 수정 — 실제 가용 시간 계산

**Files:**
- Modify: `src/app/api/schedules/[yearMonth]/[date]/route.ts`

**Step 1: engagement_schedules 기반으로 busy 시간 조회**

기존의 `engagement.findMany` (engagement 테이블에서 직접 busy 계산) 을 `engagementSchedule.findMany`로 교체:

```typescript
// 기존 activeEngagements 쿼리를 교체
const busySchedules = await prisma.engagementSchedule.findMany({
  where: {
    date: targetDate,
    engagement: {
      status: { in: ['scheduled', 'in_progress'] },
    },
  },
  select: {
    coachId: true,
    startTime: true,
    endTime: true,
  },
})

const busyMap = new Map<string, { startTime: string; endTime: string }[]>()
for (const s of busySchedules) {
  if (!busyMap.has(s.coachId)) busyMap.set(s.coachId, [])
  busyMap.get(s.coachId)!.push({ startTime: s.startTime, endTime: s.endTime })
}
```

기존 `isBusy` 함수와 슬롯 필터링 로직은 그대로 유지.

**Step 2: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git commit -am "feat: dashboard API uses engagement_schedules for busy time"
```

---

### Task 5: 6개월 근무일 집계 변경

**Files:**
- Modify: `src/app/api/coaches/route.ts:96-113`
- Modify: `src/app/api/coaches/[id]/work-summary/route.ts`
- Modify: `src/components/coaches/detail/ScheduleTab.tsx`

**Step 1: 코치 목록 API — engagement_schedules 기준**

`coach_schedules`가 아닌 `engagement_schedules`에서 `COUNT(DISTINCT date)` 조회:

```typescript
const workDayRows = coachIds.length > 0
  ? await prisma.$queryRaw<{ coach_id: string; days: bigint }[]>`
      SELECT coach_id, COUNT(DISTINCT date) as days
      FROM engagement_schedules
      WHERE coach_id::text = ANY(${coachIds})
        AND date >= ${sixMonthsAgo}
        AND date <= ${today}
      GROUP BY coach_id
    `
  : []
```

**Step 2: work-summary API — engagement_schedules 기준**

동일하게 `coachSchedule` → `engagementSchedule`로 변경.

**Step 3: ScheduleTab — engagement_schedules 표시**

프론트에서 6개월 요약 계산 시 engagement_schedules 데이터 사용.
work-summary API가 이미 변경되므로 프론트는 API 응답만 사용하면 됨.

**Step 4: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git commit -am "feat: work days count from engagement_schedules"
```

---

### Task 6: 코치 상세 스케줄탭 — 두 테이블 구분 표시

**Files:**
- Modify: `src/app/api/coach/schedule/[yearMonth]/route.ts`
- Modify: `src/components/coaches/detail/ScheduleTab.tsx`

**Step 1: API에서 engagement_schedules도 반환**

GET 응답에 `engagementSchedules` 필드 추가:

```typescript
const engSchedules = await prisma.engagementSchedule.findMany({
  where: {
    coachId: id,
    date: { gte: startDate, lte: endDate },
  },
  include: {
    engagement: { select: { courseName: true, status: true } },
  },
  orderBy: { date: 'asc' },
})
```

**Step 2: ScheduleTab에서 확정/가용 구분**

캘린더에서:
- 초록(가용): `coach_schedules`에만 있는 날
- 파랑(확정): `engagement_schedules`에 있는 날
- 디테일 패널: 확정 시간은 과정명과 함께 표시

**Step 3: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git commit -am "feat: schedule tab shows engagement_schedules separately"
```

---

### Task 7: 정리 및 검증

**Step 1: 대시보드에서 확인**

- 특정 날짜 클릭 → 코치 목록에서 계약 시간이 빠진 실제 가용 시간만 표시되는지 확인
- 모든 시간이 계약으로 차있는 코치는 목록에서 빠지는지 확인

**Step 2: 코치 목록에서 확인**

- 6개월 근무일이 engagement_schedules 기준으로 정확한지 확인

**Step 3: 코치 상세 스케줄탭에서 확인**

- 가용(초록)과 확정(파랑) 구분이 정확한지 확인

**Step 4: review-log 기록 + 커밋**

```bash
git commit -am "feat: engagement_schedules integration complete"
```
