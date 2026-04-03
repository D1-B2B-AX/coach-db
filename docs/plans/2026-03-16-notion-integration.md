# 노션 연동 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 노션 DB의 코치 상세 정보(스킬, 포트폴리오, 가용성 등)를 기존 코치 레코드에 매칭하여 동기화한다.

**Architecture:** 기존 구글시트 동기화 후 노션 동기화를 순차 실행. 노션 API로 전체 페이지를 가져와 이름+연락처/이메일로 DB 코치에 매칭하고, 추가 필드를 배치 업데이트. 매칭 안 된 노션 코치 목록을 응답에 포함.

**Tech Stack:** Notion API (REST, fetch), Supabase (Postgres), Next.js API Route, TypeScript

---

### Task 1: DB 마이그레이션 — 새 컬럼 3개 추가

**Files:**
- Create: `supabase/migrations/002_notion_fields.sql`

**Step 1: Supabase 대시보드에서 SQL 실행**

Supabase SQL Editor에서 아래 쿼리 실행:

```sql
ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS available_fields text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability_detail text,
  ADD COLUMN IF NOT EXISTS notes text;
```

**Step 2: 마이그레이션 파일 저장**

위 SQL을 `supabase/migrations/002_notion_fields.sql`에 저장 (기록용).

---

### Task 2: TypeScript 타입 업데이트

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Coach 인터페이스에 새 필드 추가**

`src/lib/types.ts`의 Coach 인터페이스에 추가:

```typescript
export interface Coach {
  // ... 기존 필드 ...
  available_fields: string[];
  availability_detail: string | null;
  notes: string | null;
}
```

**Step 2: 빌드 확인**

```bash
npm run build
```

빌드 에러 없이 통과해야 함.

---

### Task 3: 노션 API 유틸리티

**Files:**
- Create: `src/lib/notion.ts`

**Step 1: .env.local에 노션 키 추가**

```
NOTION_API_KEY=<your-notion-api-key>
NOTION_DATABASE_ID=<your-notion-database-id>
```

**Step 2: 노션 데이터 페치 함수 작성**

`src/lib/notion.ts` 생성:

```typescript
export interface NotionCoach {
  name: string;
  phone: string;
  email: string;
  birth_date: string;
  organization: string;
  skill_stack: string[];
  portfolio_url: string;
  notion_url: string;
  available_fields: string[];
  availability_detail: string;
  notes: string;
}

export async function fetchNotionCoaches(): Promise<NotionCoach[]> {
  const apiKey = process.env.NOTION_API_KEY!;
  const dbId = process.env.NOTION_DATABASE_ID!;
  const coaches: NotionCoach[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    for (const page of data.results ?? []) {
      const p = page.properties;
      coaches.push({
        name: getText(p["이름"], "title"),
        phone: getText(p["연락처"], "rich_text"),
        email: getText(p["이메일"], "rich_text"),
        birth_date: getText(p["생년월일"], "rich_text"),
        organization: getText(p["소속"], "rich_text"),
        skill_stack: getMultiSelect(p["가능 커리큘럼"]),
        portfolio_url: getText(p["이력서 및 포트폴리오"], "rich_text"),
        notion_url: page.url ?? "",
        available_fields: getMultiSelect(p["교육 및 가능 분야"]),
        availability_detail: getText(p["근무 가능 세부 내용"], "rich_text"),
        notes: getText(p["특이사항 / 히스토리"] ?? p[" 특이사항 / 히스토리"], "rich_text"),
      });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return coaches;
}

function getText(
  prop: { title?: { plain_text: string }[]; rich_text?: { plain_text: string }[] } | undefined,
  type: "title" | "rich_text"
): string {
  if (!prop) return "";
  const arr = type === "title" ? prop.title : prop.rich_text;
  return arr?.map((t) => t.plain_text).join("") ?? "";
}

function getMultiSelect(
  prop: { multi_select?: { name: string }[] } | undefined
): string[] {
  return prop?.multi_select?.map((s) => s.name) ?? [];
}
```

**Step 3: 빌드 확인**

```bash
npm run build
```

---

### Task 4: 동기화 라우트에 노션 동기화 추가

**Files:**
- Modify: `src/app/api/sync/route.ts`

**Step 1: 노션 동기화 로직 추가**

기존 구글시트 동기화 완료 후, 응답 반환 전에 노션 동기화를 추가:

```typescript
import { fetchNotionCoaches } from "@/lib/notion";

// ... 기존 구글시트 동기화 코드 끝나는 부분 (sync_logs update 전) ...

// 5. 노션 동기화
const notionCoaches = await fetchNotionCoaches();

// DB에서 전체 코치 조회 (매칭용)
const { data: allDbCoaches } = await serviceClient
  .from("coaches")
  .select("id, name, phone, email");

const unmatchedNotion: string[] = [];
let notionMatchCount = 0;

for (const nc of notionCoaches) {
  if (!nc.name) continue;

  // 이름 + 연락처/이메일로 매칭
  const match = allDbCoaches?.find(
    (db) =>
      db.name === nc.name &&
      ((nc.phone && db.phone === nc.phone) ||
       (nc.email && db.email === nc.email))
  );

  if (!match) {
    unmatchedNotion.push(nc.name);
    continue;
  }

  const updateData: Record<string, unknown> = {
    notion_url: nc.notion_url || null,
  };
  if (nc.skill_stack.length > 0) updateData.skill_stack = nc.skill_stack;
  if (nc.portfolio_url) updateData.portfolio_url = nc.portfolio_url;
  if (nc.birth_date) updateData.birth_date = nc.birth_date;
  if (nc.organization) updateData.organization = nc.organization;
  if (nc.available_fields.length > 0) updateData.available_fields = nc.available_fields;
  if (nc.availability_detail) updateData.availability_detail = nc.availability_detail;
  if (nc.notes) updateData.notes = nc.notes;

  await serviceClient.from("coaches").update(updateData).eq("id", match.id);
  notionMatchCount++;
}
```

**Step 2: 응답에 노션 결과 포함**

응답 JSON에 추가:

```typescript
return NextResponse.json({
  success: true,
  total_rows: rawRows.length,
  created_count: createdCount,
  updated_count: updatedCount,
  notion_matched: notionMatchCount,
  notion_unmatched: unmatchedNotion,
});
```

**Step 3: 빌드 확인**

```bash
npm run build
```

---

### Task 5: 동기화 토스트에 노션 결과 표시

**Files:**
- Modify: `src/components/MainView.tsx`

**Step 1: handleSync의 토스트 메시지 업데이트**

```typescript
showToast(
  `동기화 완료: ${data.created_count}명 추가, ${data.updated_count}명 갱신, 노션 ${data.notion_matched}명 매칭` +
  (data.notion_unmatched?.length > 0
    ? `\n매칭 안 됨: ${data.notion_unmatched.join(", ")}`
    : "")
);
```

---

### Task 6: 상세 패널 UI에 새 필드 표시

**Files:**
- Modify: `src/components/CoachPanel.tsx`

**Step 1: 교육 및 가능 분야 배지 추가**

구분 배지 아래에 추가:

```tsx
{coach.available_fields?.length > 0 && (
  <div className="flex flex-wrap gap-1">
    {coach.available_fields.map((f) => (
      <span key={f} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700">
        {f}
      </span>
    ))}
  </div>
)}
```

**Step 2: 근무 가능 세부 내용 표시**

연락처 섹션 아래에 추가:

```tsx
{coach.availability_detail && (
  <div className="space-y-1">
    <h3 className="text-sm font-medium text-gray-900">근무 가능</h3>
    <p className="text-sm text-gray-600">{coach.availability_detail}</p>
  </div>
)}
```

**Step 3: 특이사항/히스토리 표시**

메모 섹션 위에 추가:

```tsx
{coach.notes && (
  <div className="space-y-1">
    <h3 className="text-sm font-medium text-gray-900">특이사항</h3>
    <p className="whitespace-pre-wrap text-sm text-gray-600">{coach.notes}</p>
  </div>
)}
```

**Step 4: 빌드 확인**

```bash
npm run build
```

---

### Task 7: .env.local.example 업데이트

**Files:**
- Modify: `.env.local.example`

**Step 1: 노션 키 추가**

```
NOTION_API_KEY=
NOTION_DATABASE_ID=
```
