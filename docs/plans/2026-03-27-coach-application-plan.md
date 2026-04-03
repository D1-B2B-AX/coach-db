# 코치 신청 동기화 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 구글폼 신청 데이터를 구글시트에서 가져와 pending 상태 코치로 등록하고, 관리자가 승인/거절하는 플로우 구현

**Architecture:** 기존 engagements sync 패턴을 그대로 따름 — `src/lib/sync/applications.ts` 모듈 + API route + 관리자 페이지 "신청 관리" 탭. CoachStatus에 `pending` 추가, 중복은 이름+연락처로 판단.

**Tech Stack:** Next.js API Routes, Google Sheets API (via googleapis + xlsx), Prisma

---

### Task 1: CoachStatus에 pending 추가

**Files:**
- Modify: `prisma/schema.prisma:12-16`

**Step 1: enum에 pending 추가**

```prisma
enum CoachStatus {
  pending
  active
  inactive
  on_leave
}
```

**Step 2: DB에 반영**

Run: `npx prisma db push`
Expected: schema synced (로컬 + 프로덕션)

**Step 3: Prisma client 재생성**

Run: `npx prisma generate`

**Step 4: 기존 코드 확인 — pending 코치가 목록/대시보드에 안 나오는지**

확인 대상:
- `src/app/api/coaches/route.ts` — coach 목록 API에 `status` 필터가 있는지
- `src/app/api/schedules/[yearMonth]/route.ts` — `coach: { status: 'active' }` 조건
- `src/app/api/schedules/[yearMonth]/[date]/route.ts` — 같은 조건

pending 코치는 `status: 'active'`가 아니므로 대시보드/코치 목록에 자동 제외됨. 코치 목록 페이지에서도 확인 필요 — pending은 표시 안 해야 함.

**Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add pending status to CoachStatus enum"
```

---

### Task 2: 신청 동기화 모듈 작성

**Files:**
- Create: `src/lib/sync/applications.ts`

**Step 1: 동기화 함수 작성**

구글시트 ID: `1xrkRqw3niREpZRIYuB6cEjOGm7Y45bEWkqP02vESR20`
탭: 첫 번째 시트 (구글폼 응답)

컬럼 매핑 (0-indexed):
- A(0): 타임스탬프
- B(1): 개인정보 동의
- C(2): 이름 → `Coach.name`
- D(3): 연락처 → `Coach.phone`
- E(4): 생년월일 → `Coach.birthDate`
- F(5): 이메일 → `Coach.email`
- G(6): 소속 → `Coach.affiliation`
- H(7): 수행 업무 → `Coach.workType`
- I(8): 근무 가능 기간 → `Coach.availabilityDetail` (J와 합침)
- J(9): 근무 가능 기간 세부 → `Coach.availabilityDetail`
- K(10): 교육 분야 → `CoachField`
- L(11): 가능 분야 → `CoachField` (K와 합침)
- M(12): 보유 스킬 → `CoachCurriculum`
- N(13): 희망 교육 형태 → `Coach.selfNote`
- O(14): 교육 경력 사항 → `Coach.selfNote` (N과 합침)
- P(15): 포트폴리오/이력서 → `CoachDocument` (Google Drive URL)
- Q(16): 기타 요청 사항 → `Coach.selfNote` (합침)
- R(17): DS/DX 찜꽁 → skip
- S(18): 사전 미팅 → skip

```typescript
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { generateAccessToken } from '@/lib/coach-auth'
import { toDateOnly } from '@/lib/date-utils'

export interface ApplicationSyncResult {
  totalRows: number
  created: number
  skipped: number
  errors: number
  errorDetail: string[]
}

export async function syncApplications(): Promise<ApplicationSyncResult> {
  const result: ApplicationSyncResult = { totalRows: 0, created: 0, skipped: 0, errors: 0, errorDetail: [] }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })

  const drive = google.drive({ version: 'v3', auth })
  const fileId = '1xrkRqw3niREpZRIYuB6cEjOGm7Y45bEWkqP02vESR20'

  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer))
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) { result.errorDetail.push('시트를 찾을 수 없습니다'); return result }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
  result.totalRows = rows.length - 1 // 헤더 제외

  // 기존 코치 조회 (이름+연락처 중복 체크용)
  const existingCoaches = await prisma.coach.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, phone: true },
  })
  const existingSet = new Set(existingCoaches.map(c => `${c.name}|${normalizePhone(c.phone)}`))

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[2] || '').trim()
    const phoneRaw = String(row[3] || '').trim()
    const birthRaw = String(row[4] || '').trim()
    const email = String(row[5] || '').trim() || null
    const affiliation = String(row[6] || '').trim() || null
    const workType = String(row[7] || '').trim() || null
    const availPeriod = String(row[8] || '').trim()
    const availDetail = String(row[9] || '').trim()
    const fieldRaw1 = String(row[10] || '').trim()
    const fieldRaw2 = String(row[11] || '').trim()
    const skillRaw = String(row[12] || '').trim()
    const eduForm = String(row[13] || '').trim()
    const career = String(row[14] || '').trim()
    const portfolioUrl = String(row[15] || '').trim() || null
    const extraRequest = String(row[16] || '').trim()

    if (!name) { result.skipped++; continue }

    // 전화번호 정규화
    const phone = normalizePhone(phoneRaw)

    // 중복 체크
    const key = `${name}|${phone}`
    if (existingSet.has(key)) { result.skipped++; continue }

    // 생년월일 파싱 (ex. 980101 → 1998-01-01)
    const birthDate = parseBirthDate(birthRaw)

    // 가용 기간 합치기
    const availabilityDetail = [availPeriod, availDetail].filter(Boolean).join('\n') || null

    // selfNote 합치기 (희망 교육 형태 + 교육 경력 + 기타 요청)
    const selfNoteParts: string[] = []
    if (eduForm) selfNoteParts.push(`[희망 교육 형태] ${eduForm}`)
    if (career) selfNoteParts.push(`[교육 경력] ${career}`)
    if (extraRequest) selfNoteParts.push(`[기타 요청] ${extraRequest}`)
    const selfNote = selfNoteParts.join('\n') || null

    // 분야 합치기 (교육 분야 + 가능 분야, 쉼표 구분)
    const fieldNames = [...new Set([...splitMulti(fieldRaw1), ...splitMulti(fieldRaw2)])]
    // 스킬
    const curriculumNames = splitMulti(skillRaw)

    try {
      const coach = await prisma.coach.create({
        data: {
          name,
          phone,
          email,
          birthDate: birthDate ? toDateOnly(birthDate) : null,
          affiliation,
          workType,
          availabilityDetail,
          selfNote,
          status: 'pending',
          accessToken: generateAccessToken(),
        },
      })

      // Field 연결
      for (const fname of fieldNames) {
        const field = await prisma.field.upsert({ where: { name: fname }, create: { name: fname }, update: {} })
        await prisma.coachField.create({ data: { coachId: coach.id, fieldId: field.id } })
      }

      // Curriculum 연결
      for (const cname of curriculumNames) {
        const curr = await prisma.curriculum.upsert({ where: { name: cname }, create: { name: cname }, update: {} })
        await prisma.coachCurriculum.create({ data: { coachId: coach.id, curriculumId: curr.id } })
      }

      // 포트폴리오 URL → CoachDocument
      if (portfolioUrl) {
        // Drive URL에서 파일 ID 추출 시도
        await prisma.coachDocument.create({
          data: {
            coachId: coach.id,
            fileUrl: portfolioUrl,
            fileName: `${name}_포트폴리오`,
            fileType: 'portfolio',
          },
        })
      }

      existingSet.add(key)
      result.created++
    } catch (err) {
      result.errors++
      result.errorDetail.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}

function normalizePhone(raw: string | null): string {
  if (!raw) return ''
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3')
  return raw.trim()
}

function parseBirthDate(raw: string): string | null {
  if (!raw) return null
  // 6자리: YYMMDD → 19YY or 20YY
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length === 6) {
    const yy = parseInt(digits.slice(0, 2))
    const year = yy >= 50 ? 1900 + yy : 2000 + yy
    return `${year}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
  }
  // 8자리: YYYYMMDD
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }
  return null
}

function splitMulti(raw: string): string[] {
  if (!raw) return []
  return raw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
}
```

**Step 2: Commit**

```bash
git add src/lib/sync/applications.ts
git commit -m "feat: add coach application sync module"
```

---

### Task 3: API route 생성

**Files:**
- Create: `src/app/api/sync/applications/route.ts`

**Step 1: 기존 engagements route 패턴 그대로**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '@/lib/api-auth'
import { syncApplications } from '@/lib/sync/applications'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const log = await prisma.syncLog.create({
    data: { type: 'applications', status: 'running', triggeredBy: `button:${auth.manager.email}` },
  })

  try {
    const result = await syncApplications()
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        totalRows: result.totalRows,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
        errorDetail: result.errorDetail.length > 0 ? result.errorDetail.join('\n') : null,
        finishedAt: new Date(),
      },
    })
    return NextResponse.json(result)
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'error', errorDetail: error instanceof Error ? error.message : String(error), finishedAt: new Date() },
    })
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/sync/applications/route.ts
git commit -m "feat: add coach application sync API route"
```

---

### Task 4: 승인/거절 API

**Files:**
- Create: `src/app/api/admin/applications/[id]/route.ts`

**Step 1: PATCH — 승인(active) 또는 거절(soft delete)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/api-auth'

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireManager()
  if (!auth || auth.manager.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { action, reason } = await request.json() as { action: 'approve' | 'reject'; reason?: string }

  const coach = await prisma.coach.findUnique({ where: { id }, select: { id: true, status: true, deletedAt: true, managerNote: true } })
  if (!coach || coach.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (coach.status !== 'pending') return NextResponse.json({ error: '이미 처리된 신청입니다' }, { status: 400 })

  if (action === 'approve') {
    await prisma.coach.update({ where: { id }, data: { status: 'active' } })
    return NextResponse.json({ success: true, status: 'active' })
  } else {
    const note = reason ? `[거절 사유] ${reason}` : null
    const managerNote = [coach.managerNote, note].filter(Boolean).join('\n') || null
    await prisma.coach.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: auth.manager.email, managerNote },
    })
    return NextResponse.json({ success: true, status: 'rejected' })
  }
}
```

**Step 2: Commit**

```bash
git add 'src/app/api/admin/applications/[id]/route.ts'
git commit -m "feat: add approve/reject API for coach applications"
```

---

### Task 5: 관리자 페이지 — 신청 관리 탭

**Files:**
- Modify: `src/app/(manager)/admin/page.tsx`

**Step 1: pending 코치 fetch 추가**

기존 `fetchManagers`, `fetchDeletedCoaches`와 같은 패턴으로:
```typescript
const [pendingCoaches, setPendingCoaches] = useState([])

async function fetchPendingCoaches() {
  const res = await fetch('/api/admin/applications')
  if (res.ok) { const data = await res.json(); setPendingCoaches(data.coaches || []) }
}
```

API: `GET /api/admin/applications` — pending 코치 목록 반환 (Task 4의 route에 GET 추가 또는 별도 route)

**Step 2: 탭에 "신청 관리" 추가**

기존 탭: managers, links, deleted, sync
→ managers, **applications**, links, deleted, sync

탭 내용:
- "동기화" 버튼 → `POST /api/sync/applications` 호출
- pending 코치 테이블: 이름 / 연락처 / 이메일 / 수행 업무 / 신청일
- 각 행에 "승인" / "거절" 버튼
- 승인 → `PATCH /api/admin/applications/:id { action: 'approve' }`
- 거절 → `PATCH /api/admin/applications/:id { action: 'reject' }`
- 승인 후 코치 링크 표시 (accessToken 기반)

**Step 3: GET /api/admin/applications route 추가**

```typescript
// src/app/api/admin/applications/route.ts
export async function GET() {
  const auth = await requireManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const coaches = await prisma.coach.findMany({
    where: { status: 'pending', deletedAt: null },
    include: {
      fields: { include: { field: true } },
      curriculums: { include: { curriculum: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    coaches: coaches.map(c => ({
      ...c,
      fields: c.fields.map(f => f.field.name),
      curriculums: c.curriculums.map(cc => cc.curriculum.name),
    }))
  })
}
```

**Step 4: Commit**

```bash
git add src/app/api/admin/applications/route.ts 'src/app/(manager)/admin/page.tsx'
git commit -m "feat: admin 신청 관리 탭 — 동기화/승인/거절 UI"
```

---

### Task 6: 코치 목록에서 pending 제외 확인 + 테스트

**Step 1: 코치 목록 API 확인**

`src/app/api/coaches/route.ts`에서 `where: { deletedAt: null }` 조건만 있으면 pending도 나옴.
→ `where: { deletedAt: null, status: { not: 'pending' } }` 추가 필요할 수 있음.

**Step 2: 대시보드 API 확인**

스케줄 API들은 이미 `coach: { status: 'active' }` 조건이 있으므로 문제 없음.

**Step 3: 수동 테스트**

1. 관리자 페이지 → 신청 관리 탭 → "동기화" 클릭
2. pending 코치 목록 확인
3. "승인" 클릭 → status: active 확인
4. 코치 목록/대시보드에서 확인

**Step 4: Commit**

```bash
git commit -m "fix: exclude pending coaches from coach list"
```
