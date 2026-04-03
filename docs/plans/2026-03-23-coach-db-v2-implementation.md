# Coach DB v2 — 전면 재설계 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 코치가 월간 가용 스케줄을 직접 입력하고, 매니저가 날짜 기반으로 코치를 조회·배정할 수 있는 양방향 코치 관리 시스템을 구축한다.

**Architecture:** Next.js App Router 프로젝트를 유지하되, Supabase를 제거하고 Prisma + PostgreSQL(Railway)로 전환. 매니저는 NextAuth.js Google OAuth, 코치는 토큰 기반 인증. 파일 저장소는 Cloudflare R2. 기존 코드(구글시트/노션 동기화, Supabase 클라이언트)는 전면 교체.

**Tech Stack:** Next.js 16 (App Router), Prisma, PostgreSQL (Railway), NextAuth.js v5, Tailwind CSS v4, Cloudflare R2 (@aws-sdk/client-s3), TypeScript

**참고 설계문서:**
- `무제 폴더/코치DB_시스템_개요_v6.md` — 시스템 개요
- `무제 폴더/설계문서_1_스케줄_수집_및_코치_관리_v6.md` — MVP 범위 (이 계획의 범위)
- `무제 폴더/설계문서_2_배정_요청_관리_v1.md` — Post-MVP (이 계획 범위 밖)
- `무제 폴더/코치뷰_일정입력_데모.html` — 코치 스케줄 입력 UI 참고

**MVP 범위:** 설계문서 #1 전체 (10개 테이블, 7개 페이지)
**Post-MVP:** 설계문서 #2 (배정 요청/응답) — 이 계획에 포함하지 않음

---

## Phase 0: 인프라 전환

### Task 1: 의존성 정리 및 Prisma 설치

기존 Supabase/구글시트/노션/OpenAI 관련 의존성을 제거하고, 새 스택 의존성을 설치한다.

**Files:**
- Modify: `package.json`

**Step 1: 기존 의존성 제거**

```bash
npm uninstall @supabase/ssr @supabase/supabase-js googleapis openai pdf-parse @anthropic-ai/sdk
```

**Step 2: 새 의존성 설치**

```bash
npm install prisma @prisma/client next-auth@beta @auth/prisma-adapter @aws-sdk/client-s3 crypto
npm install -D prisma
```

**Step 3: 기존 Supabase/동기화 코드 제거**

삭제할 파일들:
- `src/lib/supabase/` (디렉토리 전체)
- `src/lib/google-sheets.ts`
- `src/lib/notion.ts`
- `src/app/api/sync/` (디렉토리 전체)
- `src/app/api/sync-schedule/` (디렉토리 전체)
- `src/app/api/coaches/[id]/summary/` (AI 요약 — 새 설계에 없음)
- `src/app/api/coaches/[id]/notion-content/` (노션 — 새 설계에 없음)
- `supabase/` (디렉토리 전체 — Supabase 마이그레이션)

**Step 4: .env.local.example 업데이트**

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/coach_db"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Cloudflare R2
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME="coach-documents"
R2_PUBLIC_URL=""
```

**Step 5: 커밋**

```bash
git add -A
git commit -m "chore: remove Supabase/sync deps, add Prisma/NextAuth/R2 deps"
```

---

### Task 2: Prisma 스키마 작성 (10개 테이블)

설계문서 #1의 데이터 모델을 Prisma 스키마로 구현한다.

**Files:**
- Create: `prisma/schema.prisma`

**Step 1: Prisma 초기화**

```bash
npx prisma init
```

**Step 2: 스키마 작성**

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── 코치 ───

enum WorkType {
  full_time
  freelance
  student
  other
}

enum CoachStatus {
  active
  inactive
  on_leave
}

model Coach {
  id           String      @id @default(uuid())
  name         String      @db.VarChar(50)
  birthDate    DateTime?   @map("birth_date") @db.Date
  phone        String?     @db.VarChar(20)
  email        String?     @db.VarChar(100)
  affiliation  String?     @db.VarChar(100)
  workType     WorkType?   @map("work_type")
  hourlyRate   Int?        @map("hourly_rate")
  status       CoachStatus @default(active)
  selfNote     String?     @map("self_note") @db.Text
  managerNote  String?     @map("manager_note") @db.Text
  accessToken  String      @unique @map("access_token") @db.VarChar(64)
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt @map("updated_at")
  deletedAt    DateTime?   @map("deleted_at")
  deletedBy    String?     @map("deleted_by") @db.VarChar(100)

  fields       CoachField[]
  curriculums  CoachCurriculum[]
  documents    CoachDocument[]
  schedules    CoachSchedule[]
  accessLogs   ScheduleAccessLog[]
  engagements  Engagement[]

  @@map("coaches")
}

// ─── 매니저 ───

enum ManagerRole {
  admin
  user
  blocked
}

model Manager {
  id        String      @id @default(uuid())
  email     String      @unique @db.VarChar(100)
  name      String      @db.VarChar(50)
  googleId  String      @unique @map("google_id") @db.VarChar(100)
  role      ManagerRole @default(user)
  createdAt DateTime    @default(now()) @map("created_at")

  @@map("managers")
}

// ─── 마스터 테이블 ───

model Field {
  id      String       @id @default(uuid())
  name    String       @unique @db.VarChar(50)
  coaches CoachField[]

  @@map("fields")
}

model Curriculum {
  id      String            @id @default(uuid())
  name    String            @unique @db.VarChar(100)
  coaches CoachCurriculum[]

  @@map("curriculums")
}

// ─── 연결 테이블 ───

model CoachField {
  coachId String @map("coach_id")
  fieldId String @map("field_id")
  coach   Coach  @relation(fields: [coachId], references: [id], onDelete: Cascade)
  field   Field  @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  @@id([coachId, fieldId])
  @@map("coach_fields")
}

model CoachCurriculum {
  coachId      String     @map("coach_id")
  curriculumId String     @map("curriculum_id")
  coach        Coach      @relation(fields: [coachId], references: [id], onDelete: Cascade)
  curriculum   Curriculum @relation(fields: [curriculumId], references: [id], onDelete: Cascade)

  @@id([coachId, curriculumId])
  @@map("coach_curriculums")
}

// ─── 문서 ───

enum FileType {
  resume
  portfolio
  certificate
}

model CoachDocument {
  id         String   @id @default(uuid())
  coachId    String   @map("coach_id")
  fileUrl    String   @map("file_url") @db.VarChar(500)
  fileName   String   @map("file_name") @db.VarChar(200)
  fileType   FileType @map("file_type")
  uploadedAt DateTime @default(now()) @map("uploaded_at")
  coach      Coach    @relation(fields: [coachId], references: [id], onDelete: Cascade)

  @@map("coach_documents")
}

// ─── 투입 이력 ───

enum EngagementStatus {
  scheduled
  in_progress
  completed
  cancelled
}

model Engagement {
  id         String           @id @default(uuid())
  coachId    String           @map("coach_id")
  courseName String           @map("course_name") @db.VarChar(200)
  status     EngagementStatus @default(scheduled)
  startDate  DateTime         @map("start_date") @db.Date
  endDate    DateTime         @map("end_date") @db.Date
  startTime  String?          @map("start_time") @db.VarChar(5) // "09:00"
  endTime    String?          @map("end_time") @db.VarChar(5)   // "18:00"
  location   String?          @db.VarChar(200)
  rating     Int?             @db.SmallInt // 1~5
  feedback   String?          @db.Text
  rehire     Boolean?
  hiredBy    String?          @map("hired_by") @db.VarChar(50)
  createdAt  DateTime         @default(now()) @map("created_at")
  coach      Coach            @relation(fields: [coachId], references: [id], onDelete: Cascade)

  @@map("engagements")
}

// ─── 가용 스케줄 (핵심) ───

model CoachSchedule {
  id        String   @id @default(uuid())
  coachId   String   @map("coach_id")
  date      DateTime @db.Date
  startTime String   @map("start_time") @db.VarChar(5) // "09:00"
  endTime   String   @map("end_time") @db.VarChar(5)   // "12:00"
  updatedAt DateTime @updatedAt @map("updated_at")
  coach     Coach    @relation(fields: [coachId], references: [id], onDelete: Cascade)

  @@map("coach_schedules")
}

// ─── 접속/입력 기록 ───

model ScheduleAccessLog {
  id           String    @id @default(uuid())
  coachId      String    @map("coach_id")
  yearMonth    String    @map("year_month") @db.VarChar(7) // "2026-04"
  accessedAt   DateTime  @default(now()) @map("accessed_at")
  lastEditedAt DateTime? @map("last_edited_at")
  coach        Coach     @relation(fields: [coachId], references: [id], onDelete: Cascade)

  @@unique([coachId, yearMonth])
  @@map("schedule_access_logs")
}
```

**Step 3: Prisma 클라이언트 생성**

Create `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**Step 4: 마이그레이션 생성 및 적용 (로컬 DB)**

```bash
npx prisma migrate dev --name init
```

**Step 5: 커밋**

```bash
git add prisma/ src/lib/prisma.ts
git commit -m "feat: add Prisma schema with 10 tables for Coach DB v2"
```

---

### Task 3: 기존 페이지/컴포넌트 정리

기존 MVP 페이지와 컴포넌트를 제거하고 새 구조의 빈 레이아웃을 준비한다.

**Files:**
- Delete: `src/components/MainView.tsx`, `CoachTable.tsx`, `CoachPanel.tsx`, `CoachCalendar.tsx`, `CoachMemos.tsx`, `FilterDropdown.tsx`, `ResponsiveChips.tsx`, `CopyButton.tsx`, `CoachDetailMobile.tsx`
- Delete: `src/app/coaches/[id]/page.tsx` (기존 모바일 상세 — 새 구조로 재작성)
- Delete: `src/app/api/coaches/` (기존 API 전체)
- Modify: `src/app/page.tsx` → 임시 리다이렉트 (`/dashboard`로)
- Modify: `src/app/layout.tsx` → 기존 Supabase provider 제거
- Keep: `src/components/Toast.tsx` (재사용)
- Keep: `src/app/login/page.tsx` (Task 4에서 수정)
- Keep: `src/app/auth/callback/route.ts` (Task 4에서 수정)
- Keep: `src/middleware.ts` (Task 4에서 수정)

**Step 1: 기존 컴포넌트/페이지 삭제**

```bash
rm -f src/components/MainView.tsx src/components/CoachTable.tsx \
  src/components/CoachPanel.tsx src/components/CoachCalendar.tsx \
  src/components/CoachMemos.tsx src/components/FilterDropdown.tsx \
  src/components/ResponsiveChips.tsx src/components/CopyButton.tsx \
  src/components/CoachDetailMobile.tsx
rm -rf src/app/coaches/
rm -rf src/app/api/
```

**Step 2: 루트 페이지를 dashboard 리다이렉트로 변경**

`src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
```

**Step 3: layout.tsx 에서 Supabase 관련 코드 제거**

기존 레이아웃에서 Supabase provider를 제거하고 기본 HTML 구조만 유지.

**Step 4: 커밋**

```bash
git add -A
git commit -m "chore: remove legacy MVP code, prepare for v2 rebuild"
```

---

## Phase 1: 인증

### Task 4: 매니저 인증 (NextAuth.js + Google OAuth)

매니저용 Google OAuth 인증을 NextAuth.js v5로 구현한다. @day1company.co.kr 도메인만 허용.

**Files:**
- Create: `src/lib/auth.ts` — NextAuth 설정
- Create: `src/app/api/auth/[...nextauth]/route.ts` — NextAuth API 라우트
- Modify: `src/app/login/page.tsx` — NextAuth signIn 사용
- Delete: `src/app/auth/callback/route.ts` — Supabase 콜백 제거
- Modify: `src/middleware.ts` — NextAuth + 코치 토큰 분기

**Step 1: NextAuth 설정**

`src/lib/auth.ts`:
```typescript
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { prisma } from './prisma'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          hd: 'day1company.co.kr', // 도메인 제한
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email?.endsWith('@day1company.co.kr')) return false

      // managers 테이블에 자동 생성 또는 role 확인
      const manager = await prisma.manager.findUnique({
        where: { email: user.email },
      })

      if (manager?.role === 'blocked') return false

      if (!manager) {
        await prisma.manager.create({
          data: {
            email: user.email,
            name: user.name || '',
            googleId: user.id || '',
          },
        })
      }

      return true
    },
    async session({ session }) {
      if (session.user?.email) {
        const manager = await prisma.manager.findUnique({
          where: { email: session.user.email },
        })
        if (manager) {
          (session as any).managerId = manager.id
          ;(session as any).managerRole = manager.role
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
```

**Step 2: API 라우트**

`src/app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```

**Step 3: 미들웨어 재작성**

`src/middleware.ts` — 매니저 경로와 코치 경로를 분기:
```typescript
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 공개 경로
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // 코치 경로: 토큰 인증 (Task 5에서 구현)
  if (pathname.startsWith('/coach')) {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    // 토큰 검증은 페이지/API에서 수행
    return NextResponse.next()
  }

  // 코치용 API
  if (pathname.startsWith('/api/coach/')) {
    // Bearer 토큰 또는 쿼리 파라미터로 인증
    return NextResponse.next()
  }

  // 매니저 경로: NextAuth 세션 확인
  // NextAuth v5는 미들웨어에서 auth() 사용 가능
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

**Step 4: 로그인 페이지 수정**

`src/app/login/page.tsx` — NextAuth signIn 사용으로 변경.

**Step 5: Supabase 콜백 삭제**

```bash
rm -rf src/app/auth/
```

**Step 6: 커밋**

```bash
git add -A
git commit -m "feat: replace Supabase Auth with NextAuth.js Google OAuth"
```

---

### Task 5: 코치 토큰 인증

코치용 64자 토큰 기반 인증 시스템을 구현한다. 링크 접속만으로 인증.

**Files:**
- Create: `src/lib/coach-auth.ts` — 토큰 생성/검증 유틸
- Modify: `src/middleware.ts` — 코치 API 경로 토큰 검증 추가

**Step 1: 토큰 유틸 작성**

`src/lib/coach-auth.ts`:
```typescript
import { randomBytes } from 'crypto'
import { prisma } from './prisma'

export function generateAccessToken(): string {
  return randomBytes(32).toString('hex') // 64자
}

export async function validateCoachToken(token: string) {
  const coach = await prisma.coach.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      name: true,
      deletedAt: true,
    },
  })

  if (!coach || coach.deletedAt) return null
  return { id: coach.id, name: coach.name }
}
```

**Step 2: 커밋**

```bash
git add src/lib/coach-auth.ts
git commit -m "feat: add coach token auth (64-char URL-safe token)"
```

---

## Phase 2: 매니저 API

### Task 6: 코치 CRUD API

매니저가 코치를 등록/조회/수정/삭제하는 API 엔드포인트.

**Files:**
- Create: `src/app/api/coaches/route.ts` — GET (목록), POST (등록)
- Create: `src/app/api/coaches/[id]/route.ts` — GET (상세), PUT (수정), DELETE (삭제)
- Create: `src/app/api/coaches/[id]/regenerate-token/route.ts` — POST
- Create: `src/app/api/coaches/export/route.ts` — POST (xlsx 추출)

**Step 1: 코치 목록 + 등록 API**

`GET /api/coaches` — 검색, 분야/상태 필터 지원
`POST /api/coaches` — 코치 등록 (토큰 자동 생성, 분야/커리큘럼 자동 추가)

**Step 2: 코치 상세/수정/삭제 API**

`GET /api/coaches/:id` — 코치 상세 (분야, 커리큘럼, 최근 투입이력 포함)
`PUT /api/coaches/:id` — 코치 정보 수정
`DELETE /api/coaches/:id` — soft delete (이메일 확인 필수)

**Step 3: 토큰 재발급 API**

`POST /api/coaches/:id/regenerate-token` — 새 토큰 발급

**Step 4: 엑셀 추출 API**

`POST /api/coaches/export` — 선택된 코치 ID 목록 → xlsx 파일 생성

**Step 5: 커밋**

```bash
git add src/app/api/coaches/
git commit -m "feat: add coach CRUD + token regeneration + xlsx export API"
```

---

### Task 7: 투입 이력(Engagements) API

**Files:**
- Create: `src/app/api/coaches/[id]/engagements/route.ts` — GET, POST
- Create: `src/app/api/engagements/[id]/route.ts` — PUT

**Step 1: API 구현**

`GET /api/coaches/:id/engagements` — 해당 코치 투입 이력 목록
`POST /api/coaches/:id/engagements` — 이력 등록
`PUT /api/engagements/:id` — 이력 수정

**Step 2: 커밋**

```bash
git add src/app/api/coaches/[id]/engagements/ src/app/api/engagements/
git commit -m "feat: add engagement CRUD API"
```

---

### Task 8: 문서 관리 API + Cloudflare R2

**Files:**
- Create: `src/lib/r2.ts` — R2 클라이언트 설정
- Create: `src/app/api/coaches/[id]/documents/route.ts` — GET, POST
- Create: `src/app/api/documents/[id]/route.ts` — DELETE

**Step 1: R2 클라이언트**

`src/lib/r2.ts`:
```typescript
import { S3Client } from '@aws-sdk/client-s3'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
```

**Step 2: 문서 업로드/조회/삭제 API**

`GET /api/coaches/:id/documents` — 문서 목록
`POST /api/coaches/:id/documents` — 파일 업로드 (multipart/form-data → R2)
`DELETE /api/documents/:id` — 문서 삭제 (R2 파일 + DB 레코드)

**Step 3: 커밋**

```bash
git add src/lib/r2.ts src/app/api/coaches/[id]/documents/ src/app/api/documents/
git commit -m "feat: add document upload/download via Cloudflare R2"
```

---

### Task 9: 마스터 데이터 + 대시보드 API

**Files:**
- Create: `src/app/api/master/fields/route.ts` — GET, POST
- Create: `src/app/api/master/curriculums/route.ts` — GET, POST
- Create: `src/app/api/schedules/[yearMonth]/route.ts` — GET (월간 캘린더)
- Create: `src/app/api/schedules/[yearMonth]/[date]/route.ts` — GET (날짜별 코치)
- Create: `src/app/api/schedules/[yearMonth]/open/route.ts` — POST (새 달 오픈)
- Create: `src/app/api/schedules/[yearMonth]/status/route.ts` — GET (입력 현황)

**Step 1: 마스터 데이터 API**

분야/커리큘럼 목록 조회 + 신규 추가.

**Step 2: 대시보드 API**

- `GET /api/schedules/2026-04` — 날짜별 가능 코치 수
- `GET /api/schedules/2026-04/20` — 4/20 가능 코치 목록 (시간, 평가, 최근이력 포함)
- `POST /api/schedules/2026-04/open` — 빈 상태로 해당 월 오픈
- `GET /api/schedules/2026-04/status` — 미접속/접속만/입력완료 현황

**Step 3: 커밋**

```bash
git add src/app/api/master/ src/app/api/schedules/
git commit -m "feat: add master data + dashboard schedule APIs"
```

---

## Phase 3: 코치 API + 스케줄 입력 UI

### Task 10: 코치용 API (토큰 인증)

**Files:**
- Create: `src/app/api/coach/me/route.ts` — GET (본인 정보)
- Create: `src/app/api/coach/schedule/[yearMonth]/route.ts` — GET, PUT
- Create: `src/app/api/coach/engagements/route.ts` — GET (본인 확정 일정)

**Step 1: 토큰 인증 헬퍼**

각 API에서 `Authorization: Bearer <token>` 또는 쿼리 파라미터로 코치 인증.

**Step 2: 스케줄 저장 API**

`PUT /api/coach/schedule/2026-04`:
- 요청 본문: `{ slots: [{ date: "2026-04-03", startTime: "09:00", endTime: "12:00" }, ...] }`
- 해당 coach_id + yearMonth의 기존 스케줄 삭제 후 새로 삽입 (덮어쓰기)
- `schedule_access_logs.last_edited_at` 업데이트

**Step 3: 접속 로그**

`GET /api/coach/schedule/:yearMonth` 호출 시 `schedule_access_logs.accessed_at` 자동 기록.

**Step 4: 커밋**

```bash
git add src/app/api/coach/
git commit -m "feat: add coach-facing APIs (token auth, schedule save)"
```

---

### Task 11: 코치 스케줄 입력 화면

**핵심 화면.** `무제 폴더/코치뷰_일정입력_데모.html`을 참고하여 React로 구현.

**Files:**
- Create: `src/app/coach/page.tsx` — 코치 스케줄 입력 메인 페이지
- Create: `src/components/coach/ScheduleCalendar.tsx` — 월간 캘린더
- Create: `src/components/coach/TimePanel.tsx` — 시간 선택 패널 (30분 단위)
- Create: `src/components/coach/ScheduleSummary.tsx` — 나의 스케줄 요약
- Create: `src/components/coach/CoachHeader.tsx` — 상단 헤더 (파란색)

**Step 1: 페이지 레이아웃**

`/coach?token=xxx` 접속 시:
1. 토큰으로 코치 정보 조회
2. 해당 월 스케줄 + 확정 일정(engagements) 로드
3. `accessed_at` 기록

**Step 2: 캘린더 컴포넌트**

- 월간 캘린더 그리드 (일~토)
- 날짜 상태 색상: 가용(초록), 확정(파랑), 미선택(회색)
- 과거 날짜 비활성, 오늘 테두리, 토/일 색상
- 이전/다음 월 이동

**Step 3: 시간 선택 패널**

- 날짜 클릭 시 사이드 패널 표시 (모바일은 하단)
- 30분 단위 시간 블록 (08:00~22:00)
- 종일/초기화/적용 버튼
- 확정 시간은 파란색, 수정 불가
- 선택 시간 요약 텍스트

**Step 4: 스케줄 요약**

- 확정 일정 목록 (클릭 시 상세 팝업)
- 마지막 투입, 다음 예정, 이번 달 투입 횟수

**Step 5: 저장**

- [저장] 버튼 → `PUT /api/coach/schedule/:yearMonth`
- 완료 화면 (선택 일수, 총 시간)
- 마지막 저장 시점 표시

**Step 6: 모바일 반응형**

데모 HTML의 미디어 쿼리 참고. 캘린더+사이드패널 → 세로 배치.

**Step 7: 커밋**

```bash
git add src/app/coach/ src/components/coach/
git commit -m "feat: add coach schedule input page (calendar + time picker)"
```

---

## Phase 4: 매니저 UI

### Task 12: 공통 레이아웃 + 로그인 페이지

**Files:**
- Modify: `src/app/layout.tsx` — 전체 레이아웃
- Modify: `src/app/login/page.tsx` — NextAuth 기반 로그인
- Modify: `src/components/Header.tsx` — 매니저 전용 헤더

**Step 1: 레이아웃**

`src/app/layout.tsx`:
- SessionProvider로 감싸기 (NextAuth)
- 매니저 페이지 공통 헤더
- 코치 페이지(`/coach`)는 별도 레이아웃 사용

**Step 2: 헤더**

`src/components/Header.tsx`:
- 앱 이름 "Coach DB"
- 네비게이션: 대시보드 / 코치 관리
- 사용자 아바타 + 로그아웃

**Step 3: 로그인 페이지**

NextAuth `signIn('google')` 호출.

**Step 4: 커밋**

```bash
git add src/app/layout.tsx src/app/login/ src/components/Header.tsx
git commit -m "feat: add manager layout, header, login page"
```

---

### Task 13: 매니저 대시보드

설계문서 #1의 5.3 화면 구현. 오늘 날짜 자동 선택, 날짜 기반 코치 조회.

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/dashboard/DashboardCalendar.tsx` — 월간 캘린더 (날짜별 가능 코치 수)
- Create: `src/components/dashboard/CoachList.tsx` — 가능 코치 목록
- Create: `src/components/dashboard/ScheduleStatus.tsx` — 입력 현황 배지

**Step 1: 페이지 구성**

```
스케줄 현황                    [🔄 새로고침] 미입력: N명
◀ 2026년 4월 ▶               [새 달 오픈] [내보내기]
필터: [분야 ▾] [평가 ▾] [상태 ▾]
캘린더 (날짜별 가능 코치 수 표시)
──────────────────
4/20 (일) 오늘
시간 필터: [전체] [09~12] [12~18] [18~22]
코치 목록 (시간대, 분야, 평가, 최근 이력)
총 N명 가능
```

**Step 2: 캘린더**

- 각 날짜 셀에 가능 코치 수 표시
- 날짜 클릭 시 하단 코치 목록 갱신
- 30초 폴링 + 수동 새로고침 버튼

**Step 3: 코치 목록**

- 시간대 필터 (전체/오전/오후/저녁)
- 분야, 평가, 상태 필터
- 코치별: 가용 시간, 분야, 평균 평점, 최근 투입 이력
- 체크박스 선택 (Post-MVP 배정 요청용 — 이번에는 UI만)

**Step 4: 새 달 오픈**

- [새 달 오픈] 버튼 → 확인 모달 → `POST /api/schedules/:yearMonth/open`
- 이미 오픈된 달 중복 방지 경고

**Step 5: 커밋**

```bash
git add src/app/dashboard/ src/components/dashboard/
git commit -m "feat: add manager dashboard (calendar + coach availability)"
```

---

### Task 14: 코치 목록 페이지

설계문서 #1의 5.4 화면 구현.

**Files:**
- Create: `src/app/coaches/page.tsx`
- Create: `src/components/coaches/CoachListTable.tsx`

**Step 1: 페이지 구성**

```
코치 관리                              [+ 코치 등록]
검색: [________]   분야: [전체 ▾]   상태: [전체 ▾]
[전체 선택]                    선택: N명 [📥 엑셀 추출]
☑ 김코치   010-1234-5678   AI/ML          활성
☐ 이코치   010-2345-6789   웹개발         활성
```

**Step 2: 기능**

- 이름/전화번호/이메일 검색
- 분야, 상태(활성/비활성/휴직) 필터
- 체크박스 다중선택 + 엑셀 추출
- 이름 클릭 → `/coaches/:id` (상세 페이지)

**Step 3: 커밋**

```bash
git add src/app/coaches/ src/components/coaches/
git commit -m "feat: add coach list page with search, filter, export"
```

---

### Task 15: 코치 상세 페이지 (4탭)

설계문서 #1의 5.5 화면 구현. 코치에 대한 모든 정보를 한 페이지에서 확인.

**Files:**
- Create: `src/app/coaches/[id]/page.tsx`
- Create: `src/components/coaches/detail/ProfileTab.tsx`
- Create: `src/components/coaches/detail/ScheduleTab.tsx`
- Create: `src/components/coaches/detail/EngagementTab.tsx`
- Create: `src/components/coaches/detail/DocumentTab.tsx`

**Step 1: 프로필 탭**

- 기본 정보 (이름, 생년월일, 연락처, 이메일, 소속, 근무유형, 시급, 상태)
- 분야, 커리큘럼 칩
- 코치 메모 (self_note), 매니저 메모 (manager_note) — 인라인 편집
- 고유 링크 (복사 버튼, [재발급] 버튼)

**Step 2: 스케줄 탭**

- 해당 코치의 월간 캘린더 (가용/확정 표시)
- 접속/입력 상태 표시 (미접속/접속만/입력완료)

**Step 3: 투입 이력 탭**

- 이력 목록 테이블 (코스명, 기간, 시간, 장소, 상태, 평점, 재고용 여부)
- [이력 등록] 버튼 → 모달 폼
- 이력 수정 (행 클릭)

**Step 4: 문서 탭**

- 업로드된 파일 목록 (이력서, 포트폴리오, 자격증)
- [업로드] 버튼 → 파일 선택 + 유형 선택
- 다운로드/삭제 버튼

**Step 5: 커밋**

```bash
git add src/app/coaches/[id]/ src/components/coaches/detail/
git commit -m "feat: add coach detail page (profile, schedule, engagement, document tabs)"
```

---

### Task 16: 코치 등록/수정 페이지

**Files:**
- Create: `src/app/coaches/new/page.tsx` — 신규 등록
- Create: `src/app/coaches/[id]/edit/page.tsx` — 수정
- Create: `src/components/coaches/CoachForm.tsx` — 공유 폼 컴포넌트

**Step 1: 공유 폼 컴포넌트**

```
이름*:      [________]
생년월일:   [YYYY-MM-DD]
전화번호:   [________]
이메일:     [________]
소속:       [________]
근무유형:   [정규직 ▾]
시급:       [________] 원
상태:       [활성 ▾]

분야:       [기존 선택 또는 새로 입력]  ← Combobox
커리큘럼:   [기존 선택 또는 새로 입력]  ← Combobox

코치 메모:  [________]
매니저 메모: [________]
```

- 분야/커리큘럼: 기존 목록에서 선택 또는 새 값 직접 입력 → 마스터 테이블 자동 추가

**Step 2: 등록 페이지**

- 폼 제출 → `POST /api/coaches` → 성공 시 상세 페이지로 이동
- 토큰 자동 생성, 고유 링크 표시

**Step 3: 수정 페이지**

- 기존 데이터 로드 → 폼 표시
- 폼 제출 → `PUT /api/coaches/:id`
- 토큰 재발급 버튼

**Step 4: 커밋**

```bash
git add src/app/coaches/new/ src/app/coaches/[id]/edit/ src/components/coaches/CoachForm.tsx
git commit -m "feat: add coach registration and edit pages"
```

---

## Phase 5: 데이터 마이그레이션 + 배포

### Task 17: 데이터 마이그레이션 스크립트

기존 시스템(노션/구글시트)의 코치 50명 데이터를 새 DB로 이관한다.

**Files:**
- Create: `scripts/migrate-coaches.ts` — 마이그레이션 스크립트
- Create: `scripts/seed-master-data.ts` — 분야/커리큘럼 초기 데이터

**Step 1: 초기 데이터 시드**

`scripts/seed-master-data.ts`:
- 기존 시스템에서 사용되던 분야(fields) 목록 삽입
- 기존 시스템에서 사용되던 커리큘럼 목록 삽입

**Step 2: 코치 마이그레이션**

`scripts/migrate-coaches.ts`:
- 이관 대상 50명의 데이터를 JSON/CSV로 준비
- coaches 테이블에 삽입 (access_token 자동 생성)
- coach_fields, coach_curriculums 연결
- 과거 투입 이력이 있으면 engagements에 삽입

**Step 3: 실행**

```bash
npx ts-node scripts/seed-master-data.ts
npx ts-node scripts/migrate-coaches.ts
```

**Step 4: 커밋**

```bash
git add scripts/
git commit -m "feat: add data migration scripts for 50 coaches"
```

---

### Task 18: 배포 설정 (Railway)

**Files:**
- Modify: `next.config.ts` — 프로덕션 설정
- Create: `Procfile` 또는 Railway 설정

**Step 1: Railway 환경 구성**

1. Railway에 PostgreSQL 서비스 추가 (Staging + Production)
2. 환경변수 설정 (DATABASE_URL, NEXTAUTH_*, GOOGLE_*, R2_*)
3. Prisma 마이그레이션 실행: `npx prisma migrate deploy`

**Step 2: Cloudflare R2 버킷 생성**

1. Staging 버킷 + Production 버킷
2. API 토큰 발급 → Railway 환경변수에 설정

**Step 3: 빌드 스크립트 확인**

`package.json`에 빌드 명령 확인:
```json
{
  "scripts": {
    "build": "prisma generate && next build",
    "start": "next start",
    "postinstall": "prisma generate"
  }
}
```

**Step 4: 배포 및 검증**

1. Staging 배포 → 테스트
2. Production 배포

**Step 5: 커밋**

```bash
git add next.config.ts package.json
git commit -m "chore: configure Railway deployment with Prisma"
```

---

## 구현 순서 요약

| Phase | Task | 내용 | 예상 규모 |
|-------|------|------|----------|
| 0 | 1 | 의존성 정리 + Prisma 설치 | 소 |
| 0 | 2 | Prisma 스키마 (10 테이블) | 중 |
| 0 | 3 | 기존 코드 정리 | 소 |
| 1 | 4 | 매니저 인증 (NextAuth) | 중 |
| 1 | 5 | 코치 토큰 인증 | 소 |
| 2 | 6 | 코치 CRUD API | 대 |
| 2 | 7 | 투입 이력 API | 중 |
| 2 | 8 | 문서 관리 API + R2 | 중 |
| 2 | 9 | 마스터 데이터 + 대시보드 API | 대 |
| 3 | 10 | 코치용 API | 중 |
| 3 | 11 | 코치 스케줄 입력 UI (핵심) | 대 |
| 4 | 12 | 공통 레이아웃 + 로그인 | 소 |
| 4 | 13 | 매니저 대시보드 UI | 대 |
| 4 | 14 | 코치 목록 페이지 | 중 |
| 4 | 15 | 코치 상세 페이지 (4탭) | 대 |
| 4 | 16 | 코치 등록/수정 페이지 | 중 |
| 5 | 17 | 데이터 마이그레이션 | 중 |
| 5 | 18 | 배포 설정 | 소 |

---

## 의존 관계

```
Task 1 → Task 2 → Task 3 (인프라)
                     ↓
              Task 4 + Task 5 (인증)
                     ↓
      Task 6 → Task 7, 8, 9 (매니저 API — 병렬 가능)
                     ↓
              Task 10 → Task 11 (코치 API + UI)
              Task 12 → Task 13, 14, 15, 16 (매니저 UI — 부분 병렬)
                     ↓
              Task 17 → Task 18 (마이그레이션 + 배포)
```

---

## Post-MVP 참고 (설계문서 #2)

이 계획 완료 후 다음 단계:
- `assignment_request_groups`, `assignment_requests` 테이블 추가
- 배정 요청 관리 페이지 (`/requests`)
- 코치 내 스케줄 뷰 (`/coach/schedule`)
- 대시보드에 체크박스 + [배정 요청 보내기] 버튼
- 코치 캘린더에 배정요청중(노랑) 상태 추가
