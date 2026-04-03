# 마이페이지 + 섭외 상태관리 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 매니저가 자신의 섭외 현황을 확인하고 상태(섭외중→확정/취소)를 관리하는 마이페이지 구현

**Architecture:** Scouting 모델에 ScoutingStatus enum 추가, 기존 삭제 토글을 status 변경으로 전환, /mypage 페이지 신설

**Tech Stack:** Next.js App Router, Prisma, PostgreSQL, Tailwind CSS

---

### Task 1: Schema — ScoutingStatus enum + Scouting.status 필드 추가

**Files:**
- Modify: `prisma/schema.prisma:74-90`
- Create: `prisma/migrations/20260401_add_scouting_status/migration.sql`

**Step 1: schema.prisma 수정**

`model Scouting` 위에 enum 추가, 모델에 status 필드 추가:

```prisma
enum ScoutingStatus {
  scouting
  confirmed
  cancelled
}

model Scouting {
  id        String         @id @default(uuid())
  coachId   String         @map("coach_id")
  managerId String         @map("manager_id")
  date      DateTime       @db.Date
  note      String?        @db.VarChar(100)
  status    ScoutingStatus @default(scouting)
  createdAt DateTime       @default(now()) @map("created_at")

  coach   Coach   @relation(fields: [coachId], references: [id], onDelete: Cascade)
  manager Manager @relation(fields: [managerId], references: [id], onDelete: Cascade)

  @@unique([coachId, date, managerId])
  @@index([coachId, date])
  @@map("scoutings")
}
```

**Step 2: migration 생성 및 적용**

```bash
npx prisma migrate dev --name add_scouting_status
```

기존 레코드는 자동으로 `scouting` (default).

**Step 3: prisma generate 확인**

```bash
npx prisma generate
```

**Step 4: 커밋**

```bash
git add prisma/
git commit -m "feat: ScoutingStatus enum + Scouting.status 필드 추가"
```

---

### Task 2: API — POST /api/scoutings 토글 로직 변경

**Files:**
- Modify: `src/app/api/scoutings/route.ts`

**변경 내용:**

기존: 존재하면 delete, 없으면 create
변경: 존재하면 status 토글(scouting↔cancelled), 없으면 create

```typescript
// POST handler 변경
if (existing) {
  if (existing.status === 'cancelled') {
    // 취소된 것을 다시 토글 → 섭외중으로 복원
    const updated = await prisma.scouting.update({
      where: { id: existing.id },
      data: { status: 'scouting' },
      select: { id: true, coachId: true, date: true, status: true, manager: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ action: 'restored', scouting: updated })
  }
  // 섭외중/확정 → 취소
  await prisma.scouting.update({
    where: { id: existing.id },
    data: { status: 'cancelled' },
  })
  return NextResponse.json({ action: 'removed' })
}

// 새로 생성
const scouting = await prisma.scouting.create({
  data: { coachId, managerId: auth.manager.id, date: dateObj, note: note || null },
  select: { id: true, coachId: true, date: true, status: true, manager: { select: { id: true, name: true } } },
})
return NextResponse.json({ action: 'added', scouting })
```

GET handler에 `managerId`, `status` 파라미터 추가, 응답에 `status` 포함:

```typescript
// GET handler 추가 파라미터
const managerId = searchParams.get('managerId')
const status = searchParams.get('status')
if (managerId) where.managerId = managerId
if (status) where.status = status

// select에 status 추가
select: {
  id: true, coachId: true, date: true, note: true, status: true,
  coach: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true } },
}
```

**커밋**

```bash
git add src/app/api/scoutings/route.ts
git commit -m "feat: 섭외 토글을 status 변경 방식으로 전환"
```

---

### Task 3: API — PATCH /api/scoutings/[id] 상태 변경 엔드포인트

**Files:**
- Create: `src/app/api/scoutings/[id]/route.ts`

**구현:**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = (await request.json()) as { status: string }

  if (!['confirmed', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const scouting = await prisma.scouting.findUnique({ where: { id } })
  if (!scouting) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (scouting.managerId !== auth.manager.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await prisma.scouting.update({
    where: { id },
    data: { status: status as 'confirmed' | 'cancelled' },
    select: { id: true, status: true },
  })

  return NextResponse.json(updated)
}
```

**커밋**

```bash
git add src/app/api/scoutings/[id]/route.ts
git commit -m "feat: PATCH /api/scoutings/:id 상태 변경 엔드포인트"
```

---

### Task 4: 기존 섭외 표시 — cancelled 필터링

**Files:**
- Modify: `src/app/(manager)/dashboard/_components/DashboardContent.tsx` — scoutings 조회 시 cancelled 제외
- Modify: `src/components/coaches/detail/ScheduleTab.tsx` — 동일

**DashboardContent.tsx:**

scoutings 조회 URL에 `status` 필터 추가하거나, 프론트에서 cancelled 제외:

```typescript
// 기존: setScoutedCoachIds(new Set((data.scoutings || []).map(...)))
// 변경: cancelled 제외
setScoutedCoachIds(new Set(
  (data.scoutings || [])
    .filter((s: { status?: string }) => s.status !== 'cancelled')
    .map((s: { coachId: string }) => s.coachId)
))
```

**ScheduleTab.tsx:**

scouting fetch 결과에서 cancelled 제외:

```typescript
for (const s of data.scoutings || []) {
  if (s.status === 'cancelled') continue
  const d = s.date.slice(0, 10)
  map.set(d, s.manager?.name || "")
}
```

**커밋**

```bash
git add src/app/(manager)/dashboard/_components/DashboardContent.tsx src/components/coaches/detail/ScheduleTab.tsx
git commit -m "fix: 취소된 섭외를 대시보드/코치상세에서 숨김"
```

---

### Task 5: 마이페이지 — 페이지 + 컴포넌트

**Files:**
- Create: `src/app/(manager)/mypage/page.tsx`

**구현:**

- `GET /api/scoutings?managerId={현재유저}` 호출하여 내 섭외 목록 조회
- 상태별 필터 (기본: 섭외중+확정)
- 테이블: 코치명, 날짜, 상태 배지, 액션 버튼
- 확정/취소 버튼 → `PATCH /api/scoutings/:id` 호출
- 낙관적 업데이트 (optimistic UI)

**UI 구조:**

```
┌─────────────────────────────────────────┐
│ 내 섭외 현황                    [취소 포함 ☐] │
├────────┬──────┬────────┬───────────────┤
│ 코치   │ 날짜  │ 상태    │ 액션           │
├────────┼──────┼────────┼───────────────┤
│ 강병민 │ 4/9  │ 섭외중  │ [확정] [취소]   │
│ 강병민 │ 4/16 │ 확정   │               │
│ 김OO  │ 4/10 │ 취소   │               │
└────────┴──────┴────────┴───────────────┘
```

상태 배지 색상: 섭외중=amber, 확정=blue, 취소=gray

**커밋**

```bash
git add src/app/(manager)/mypage/page.tsx
git commit -m "feat: 마이페이지 — 섭외 현황 목록 + 상태 변경"
```

---

### Task 6: 헤더에 마이페이지 링크 추가

**Files:**
- Modify: `src/components/Header.tsx:91-96`

**변경:**

유저 이름 옆 또는 왼쪽 nav에 "마이페이지" 링크 추가:

```tsx
<Link href="/mypage" className={...}>마이페이지</Link>
```

기존 관리자 링크 패턴과 동일한 스타일.

**커밋**

```bash
git add src/components/Header.tsx
git commit -m "feat: 헤더에 마이페이지 링크 추가"
```

---

### Task 7: 타입 체크 + 전체 검증

**Step 1:** `npx tsc --noEmit` — 타입 에러 확인
**Step 2:** 브라우저에서 E2E 검증
- 대시보드 섭외 토글 → cancelled/scouting 전환 확인
- 마이페이지 목록 표시 확인
- 확정/취소 버튼 동작 확인
- 코치 상세에서 cancelled 안 보이는지 확인
