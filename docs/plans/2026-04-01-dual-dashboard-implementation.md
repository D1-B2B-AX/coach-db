# 대시보드 분리 (일반 + 삼전) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 일반 대시보드에서 삼전 DS/DX 코치 일정을 특정 월 범위에서 숨기고, 삼전 전용 대시보드를 별도 페이지로 제공한다.

**Architecture:** 환경변수로 삼전 숨김 범위를 설정하고, API에 `coachFilter` 쿼리 파라미터를 추가하여 서버에서 필터링한다. 프론트엔드는 기존 대시보드 로직을 `DashboardContent` 컴포넌트로 추출하고, 일반/삼전 페이지에서 variant prop으로 재사용한다.

**Tech Stack:** Next.js 16 (App Router), Prisma, TypeScript, Tailwind CSS v4

---

### Task 1: 환경변수 추가

**Files:**
- Modify: `.env.local`
- Create: `src/lib/samsung-config.ts`

**Step 1: .env.local에 환경변수 추가**

```
SAMSUNG_DS_HIDE_FROM=2026-05
SAMSUNG_DX_HIDE_FROM=2026-04
SAMSUNG_HIDE_UNTIL=2026-12
```

**Step 2: samsung-config.ts 작성**

```typescript
// src/lib/samsung-config.ts

export function getSamsungHideConfig() {
  return {
    dsHideFrom: process.env.SAMSUNG_DS_HIDE_FROM || '',
    dxHideFrom: process.env.SAMSUNG_DX_HIDE_FROM || '',
    hideUntil: process.env.SAMSUNG_HIDE_UNTIL || '',
  }
}

/** yearMonth("2026-05") 기준으로 삼전 DS/DX 숨김 여부 판단 */
export function getSamsungExclusions(yearMonth: string): { excludeDS: boolean; excludeDX: boolean } {
  const { dsHideFrom, dxHideFrom, hideUntil } = getSamsungHideConfig()

  return {
    excludeDS: dsHideFrom !== '' && hideUntil !== '' && yearMonth >= dsHideFrom && yearMonth <= hideUntil,
    excludeDX: dxHideFrom !== '' && hideUntil !== '' && yearMonth >= dxHideFrom && yearMonth <= hideUntil,
  }
}
```

**Step 3: 커밋**

```bash
git add src/lib/samsung-config.ts
git commit -m "feat: 삼전 DS/DX 숨김 범위 환경변수 + 헬퍼"
```

---

### Task 2: API 필터링 — 월간 요약 (`/api/schedules/[yearMonth]`)

**Files:**
- Modify: `src/app/api/schedules/[yearMonth]/route.ts`

**Step 1: coachFilter 파라미터 처리 추가**

`route.ts`의 GET 함수에서 `searchParams`에서 `coachFilter`를 읽고, Prisma 쿼리의 `coach` where 조건에 workType 필터를 추가한다.

```typescript
// searchParams 파싱 부분 (timeFilter 바로 아래)에 추가:
import { getSamsungExclusions } from '@/lib/samsung-config'

const coachFilter = searchParams.get('coachFilter')

// coach where 조건 빌드
const coachWhere: Record<string, unknown> = {
  status: 'active',
  deletedAt: null,
}

if (coachFilter === 'exclude-samsung') {
  const { excludeDS, excludeDX } = getSamsungExclusions(yearMonth)
  const excludePatterns: string[] = []
  if (excludeDS) excludePatterns.push('%삼전 DS%')
  if (excludeDX) excludePatterns.push('%삼전 DX%')

  if (excludePatterns.length > 0) {
    coachWhere.NOT = excludePatterns.map(p => ({
      workType: { contains: p.replace(/%/g, '') }
    }))
  }
} else if (coachFilter === 'samsung-only') {
  coachWhere.OR = [
    { workType: { contains: '삼전 DS' } },
    { workType: { contains: '삼전 DX' } },
  ]
}
```

availSchedules 쿼리의 `coach:` 조건을 `coachWhere`로 교체.

**Step 2: 동작 확인**

```bash
curl "http://localhost:3000/api/schedules/2026-05?coachFilter=exclude-samsung"
```

**Step 3: 커밋**

```bash
git add src/app/api/schedules/\[yearMonth\]/route.ts
git commit -m "feat: 월간 요약 API에 coachFilter 파라미터 추가"
```

---

### Task 3: API 필터링 — 일별 상세 (`/api/schedules/[yearMonth]/[date]`)

**Files:**
- Modify: `src/app/api/schedules/[yearMonth]/[date]/route.ts`

**Step 1: 동일한 coachFilter 로직 추가**

기존 `coachWhere` 객체 (`status: 'active', deletedAt: null`)에 Task 2와 동일한 samsung 필터 조건 추가.

```typescript
import { getSamsungExclusions } from '@/lib/samsung-config'

const coachFilter = searchParams.get('coachFilter')

if (coachFilter === 'exclude-samsung') {
  const { excludeDS, excludeDX } = getSamsungExclusions(yearMonth)
  const excludePatterns: string[] = []
  if (excludeDS) excludePatterns.push('삼전 DS')
  if (excludeDX) excludePatterns.push('삼전 DX')

  if (excludePatterns.length > 0) {
    coachWhere.NOT = excludePatterns.map(p => ({ workType: { contains: p } }))
  }
} else if (coachFilter === 'samsung-only') {
  coachWhere.OR = [
    { workType: { contains: '삼전 DS' } },
    { workType: { contains: '삼전 DX' } },
  ]
}
```

**Step 2: 커밋**

```bash
git add src/app/api/schedules/\[yearMonth\]/\[date\]/route.ts
git commit -m "feat: 일별 상세 API에 coachFilter 파라미터 추가"
```

---

### Task 4: DashboardContent 공통 컴포넌트 추출

**Files:**
- Modify: `src/app/(manager)/dashboard/page.tsx` → 로직을 DashboardContent로 이동
- Create: `src/app/(manager)/dashboard/_components/DashboardContent.tsx`

**Step 1: DashboardContent 컴포넌트 생성**

기존 `page.tsx`의 모든 state/로직/JSX를 `DashboardContent`로 이동. `variant` prop 추가.

```typescript
// src/app/(manager)/dashboard/_components/DashboardContent.tsx
"use client"

// ... 기존 page.tsx의 모든 import

type DashboardVariant = "general" | "samsung"

interface DashboardContentProps {
  variant: DashboardVariant
}

export default function DashboardContent({ variant }: DashboardContentProps) {
  // 기존 page.tsx의 모든 state, effect, handler 그대로

  // fetchMonthData, fetchCoaches에서 API 호출 시 coachFilter 파라미터 추가:
  // variant === "general" → coachFilter=exclude-samsung
  // variant === "samsung" → coachFilter=samsung-only

  // fetch URL 빌드 시:
  // if (variant === "general") params.set("coachFilter", "exclude-samsung")
  // else if (variant === "samsung") params.set("coachFilter", "samsung-only")

  // JSX는 기존과 동일
}
```

**Step 2: page.tsx를 얇은 래퍼로 변경**

```typescript
// src/app/(manager)/dashboard/page.tsx
import DashboardContent from './_components/DashboardContent'

export default function DashboardPage() {
  return <DashboardContent variant="general" />
}
```

**Step 3: 기존 대시보드 동작 확인**

브라우저에서 `/dashboard` 접속, 기존과 동일하게 작동하는지 확인.

**Step 4: 커밋**

```bash
git add src/app/\(manager\)/dashboard/_components/DashboardContent.tsx src/app/\(manager\)/dashboard/page.tsx
git commit -m "refactor: 대시보드 로직을 DashboardContent로 추출"
```

---

### Task 5: 삼전 대시보드 페이지 생성 + 권한 체크

**Files:**
- Create: `src/app/(manager)/dashboard/samsung/page.tsx`
- Modify: `src/lib/api-auth.ts` (또는 해당 인증 유틸)

**Step 1: 삼전 대시보드 권한 체크 API 추가**

프론트에서 현재 유저의 삼전 접근 권한을 확인할 수 있도록, 기존 세션/매니저 정보에 role을 포함시킨다.

접근 조건: `role === 'admin' || role === 'samsung_admin'`

**Step 2: 삼전 대시보드 page 작성**

```typescript
// src/app/(manager)/dashboard/samsung/page.tsx
"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardContent from '../_components/DashboardContent'

export default function SamsungDashboardPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    // /api/admin/managers 가 200이면 admin
    // 아니면 현재 유저의 role을 확인하는 별도 API 필요
    async function checkAccess() {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        const role = data.role
        if (role === 'admin' || role === 'samsung_admin') {
          setAuthorized(true)
        } else {
          setAuthorized(false)
          router.replace('/dashboard')
        }
      }
    }
    checkAccess()
  }, [router])

  if (authorized === null) return null // loading
  if (!authorized) return null // redirecting

  return <DashboardContent variant="samsung" />
}
```

**Step 3: samsung-only API 요청에도 서버 권한 체크 추가**

`/api/schedules/[yearMonth]`와 `[date]` route에서 `coachFilter=samsung-only` 요청 시:

```typescript
if (coachFilter === 'samsung-only') {
  if (session.manager.role !== 'admin' && session.manager.role !== 'samsung_admin') {
    return NextResponse.json({ error: 'Samsung dashboard access denied' }, { status: 403 })
  }
}
```

**Step 4: 브라우저에서 `/dashboard/samsung` 접속 확인**

- admin/samsung_admin: 삼전 DS + DX 코치만 표시
- user: `/dashboard`로 리다이렉트

**Step 5: 커밋**

```bash
git add src/app/\(manager\)/dashboard/samsung/page.tsx
git commit -m "feat: 삼전 전용 대시보드 페이지 + 권한 체크"
```

---

### Task 6: 헤더 네비게이션 추가

**Files:**
- Modify: `src/components/Header.tsx`

**Step 1: 현재 유저 role 확인 로직 추가**

Header에서 이미 admin 체크를 하고 있으므로(`/api/admin/managers`), samsung_admin도 확인하도록 확장.
`/api/auth/me` 같은 API에서 role을 내려주거나, 기존 세션 데이터에 role 포함.

**Step 2: 삼전 링크를 admin/samsung_admin에게만 노출**

```tsx
{/* role === 'admin' || role === 'samsung_admin' 일 때만 */}
{hasSamsungAccess && (
  <Link
    href="/dashboard/samsung"
    className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      pathname === '/dashboard/samsung'
        ? 'bg-[#FFF3E0] text-[#E65100]'
        : 'text-gray-500 hover:text-[#E65100] hover:bg-gray-50'
    }`}
  >
    삼전
  </Link>
)}
```

대시보드 active 판정도 수정: `pathname === '/dashboard'` (exact match, samsung 제외).

**Step 3: 브라우저에서 헤더 네비게이션 확인**

- admin/samsung_admin: "대시보드", "삼전", "코치" 노출
- user: "대시보드", "코치"만 노출

**Step 4: 커밋**

```bash
git add src/components/Header.tsx
git commit -m "feat: 헤더에 삼전 대시보드 네비게이션 추가 (권한 제어)"
```

---

### Task 7: Railway 환경변수 설정 + 최종 확인

**Step 1: Railway 프로젝트에 환경변수 추가**

```
SAMSUNG_DS_HIDE_FROM=2026-05
SAMSUNG_DX_HIDE_FROM=2026-04
SAMSUNG_HIDE_UNTIL=2026-12
```

**Step 2: 배포 후 확인사항**

- [ ] `/dashboard` — 4월 조회: DX 코치 안 보임, DS 코치 보임
- [ ] `/dashboard` — 5월 조회: DS/DX 둘 다 안 보임
- [ ] `/dashboard` — 3월 이전: 모든 코치 보임
- [ ] `/dashboard/samsung` — 모든 월에서 삼전 DS/DX 코치만 보임
- [ ] 헤더에서 대시보드 ↔ 삼전 전환 정상 동작
- [ ] user role 매니저: 삼전 링크 안 보임, `/dashboard/samsung` 직접 접근 시 리다이렉트
- [ ] samsung_admin role 매니저: 삼전 링크 보임, 대시보드 접근 가능
- [ ] admin role: 모든 접근 가능
