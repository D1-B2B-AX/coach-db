# Coach Manager MVP 1차 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 코치 정보를 구글시트에서 동기화하여 조회·탐색·연락할 수 있는 웹앱 MVP를 구축한다.

**Architecture:** Next.js App Router + Supabase(DB/Auth). 구글시트 동기화는 서버 API Route에서 Google Sheets API로 처리. 프론트엔드는 Supabase 클라이언트로 직접 DB 조회. RLS로 도메인 제한 접근 제어.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, Supabase (Postgres + Auth), Google Sheets API (googleapis), TypeScript

---

### Task 1: 프로젝트 초기화

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `postcss.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `.env.local.example`

**Step 1: Next.js 프로젝트 생성**

```bash
cd /Users/ga/oldworkspace/ClaudeCode/coach
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

**Step 2: 필요 패키지 설치**

```bash
npm install @supabase/supabase-js @supabase/ssr googleapis
```

**Step 3: 환경변수 템플릿 생성**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=1hl6VxXYN1kJoQlRCpbpyWV2PFsu3LhFQ
```

**Step 4: .gitignore에 .env.local 확인**

`create-next-app`이 자동으로 추가하지만 확인.

**Step 5: 초기 커밋**

```bash
git init
git add -A
git commit -m "chore: init Next.js project with Tailwind and Supabase deps"
```

---

### Task 2: Supabase 설정 및 DB 마이그레이션

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/types.ts`

**Step 1: Supabase CLI 설치 및 초기화**

```bash
npx supabase init
```

**Step 2: 마이그레이션 파일 작성**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
-- 코치
CREATE TABLE coaches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  birth_date    DATE,
  organization  TEXT,
  subjects      TEXT[] DEFAULT '{}',
  is_new        BOOLEAN DEFAULT true,          -- D-021: 구글시트 Y/N → boolean
  availability  TEXT DEFAULT 'unknown'         -- D-029: 가능/불가/미확인 (앱에서 수동 입력, 동기화 대상 아님)
                  CHECK (availability IN ('available', 'unavailable', 'unknown')),
  skill_stack   TEXT[] DEFAULT '{}',           -- D-016: 1차 비워둠, 1.5차 노션 동기화
  notion_url    TEXT,
  portfolio_url TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 교육 과정
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT UNIQUE NOT NULL,
  start_date    DATE,
  end_date      DATE,
  operator      TEXT,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  client        TEXT,
  lead          TEXT,
  instructor_name TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 코치 ↔ 과정
CREATE TABLE coach_courses (
  coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, course_id)
);

-- 연락 메모
CREATE TABLE coach_memos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 동기화 이력
CREATE TABLE sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_by     UUID REFERENCES auth.users(id),
  status        TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  total_rows    INT,
  created_count INT,
  updated_count INT,
  error_message TEXT,
  started_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

-- 강사 (3차 대비, UI 미구현)
CREATE TABLE instructors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  organization  TEXT,
  specialties   TEXT[] DEFAULT '{}',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 강사 ↔ 과정
CREATE TABLE instructor_courses (
  instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE,
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (instructor_id, course_id)
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coaches_updated_at BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER instructors_updated_at BEFORE UPDATE ON instructors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Step 3: RLS 마이그레이션 작성**

Create `supabase/migrations/002_rls_policies.sql`:
```sql
-- RLS 활성화
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- 회사 도메인 체크 함수
CREATE OR REPLACE FUNCTION is_company_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT email LIKE '%@day1company.co.kr'
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- coaches: 회사 유저 전원 읽기/쓰기
CREATE POLICY "company_users_all" ON coaches
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());

-- courses: 회사 유저 전원 읽기/쓰기
CREATE POLICY "company_users_all" ON courses
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());

-- coach_courses: 회사 유저 전원 읽기/쓰기
CREATE POLICY "company_users_all" ON coach_courses
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());

-- coach_memos: 회사 유저 전원 읽기/쓰기, 삭제는 본인만
CREATE POLICY "company_users_read_insert" ON coach_memos
  FOR SELECT USING (is_company_user());
CREATE POLICY "company_users_insert" ON coach_memos
  FOR INSERT WITH CHECK (is_company_user() AND auth.uid() = user_id);
CREATE POLICY "own_memo_delete" ON coach_memos
  FOR DELETE USING (auth.uid() = user_id);

-- sync_logs: 회사 유저 전원 읽기/쓰기
CREATE POLICY "company_users_all" ON sync_logs
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());
```

**Step 4: Supabase 클라이언트 유틸 작성**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서는 무시
          }
        },
      },
    }
  );
}
```

**Step 5: 타입 정의**

Create `src/lib/types.ts`:
```typescript
export interface Coach {
  id: string;
  employee_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  organization: string | null;
  subjects: string[];
  is_new: boolean;
  availability: "available" | "unavailable" | "unknown";
  skill_stack: string[];
  notion_url: string | null;
  portfolio_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  operator: string | null;
  status: "active" | "completed";
  client: string | null;
  lead: string | null;
  instructor_name: string | null;
}

export interface CoachMemo {
  id: string;
  coach_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export interface CoachWithCourses extends Coach {
  courses: Course[];
}

export interface SyncLog {
  id: string;
  synced_by: string;
  status: "started" | "success" | "failed";
  total_rows: number | null;
  created_count: number | null;
  updated_count: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}
```

**Step 6: 커밋**

```bash
git add supabase/ src/lib/
git commit -m "feat: add Supabase schema, RLS policies, client utils, and types"
```

---

### Task 3: 인증 (구글 OAuth + 도메인 제한)

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Modify: `src/app/layout.tsx`

**Step 1: 미들웨어 작성 (인증 체크 + 리다이렉트)**

Create `src/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 페이지와 auth 콜백은 통과
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname.startsWith("/auth/")
  ) {
    return supabaseResponse;
  }

  // 미인증 → 로그인으로
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 도메인 체크
  if (!user.email?.endsWith("@day1company.co.kr")) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "unauthorized_domain");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Step 2: OAuth 콜백 라우트**

Create `src/app/auth/callback/route.ts`:
```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(origin);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

**Step 3: 로그인 페이지**

Create `src/app/login/page.tsx`:
```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: "day1company.co.kr",
        },
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-sm w-full space-y-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Coach Manager</h1>
        <p className="text-gray-500">실습코치 관리 시스템</p>

        {error === "unauthorized_domain" && (
          <p className="text-red-500 text-sm">
            @day1company.co.kr 계정으로만 로그인할 수 있습니다.
          </p>
        )}
        {error === "auth_failed" && (
          <p className="text-red-500 text-sm">
            로그인에 실패했습니다. 다시 시도해주세요.
          </p>
        )}

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Google 계정으로 로그인
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
```

**Step 4: 레이아웃 업데이트**

Modify `src/app/layout.tsx` — 기본 레이아웃에 한국어 lang 설정:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach Manager",
  description: "실습코치 관리 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

**Step 5: 동작 확인**

```bash
npm run build
```
Expected: 빌드 성공 (Supabase 환경변수 없어도 빌드는 통과해야 함)

**Step 6: 커밋**

```bash
git add src/middleware.ts src/app/login/ src/app/auth/ src/app/layout.tsx
git commit -m "feat: add Google OAuth login with domain restriction"
```

---

### Task 4: 앱 레이아웃 + 헤더

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/Toast.tsx`
- Modify: `src/app/page.tsx`

**Step 1: 토스트 컴포넌트**

Create `src/components/Toast.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  show: boolean;
  onClose: () => void;
}

export default function Toast({ message, show, onClose }: ToastProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}
```

**Step 2: 헤더 컴포넌트**

Create `src/components/Header.tsx`:
```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface HeaderProps {
  userEmail: string;
  userName: string;
  avatarUrl: string | null;
  onSync: () => void;
  isSyncing: boolean;
}

export default function Header({
  userEmail,
  userName,
  avatarUrl,
  onSync,
  isSyncing,
}: HeaderProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">Coach Manager</h1>

      <div className="flex items-center gap-3">
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSyncing ? "동기화 중..." : "동기화"}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-100"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={userName}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-sm font-medium text-gray-600">
                {userName.charAt(0)}
              </div>
            )}
          </button>

          {showMenu && (
            <div className="absolute right-0 top-12 z-50 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <p className="px-4 py-2 text-xs text-gray-500">{userEmail}</p>
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

**Step 3: 메인 페이지 스켈레톤**

Modify `src/app/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import MainView from "@/components/MainView";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <MainView
      userEmail={user?.email ?? ""}
      userName={user?.user_metadata?.full_name ?? user?.email ?? ""}
      avatarUrl={user?.user_metadata?.avatar_url ?? null}
    />
  );
}
```

Create `src/components/MainView.tsx` (클라이언트 래퍼):
```tsx
"use client";

import { useState } from "react";
import Header from "./Header";
import Toast from "./Toast";

interface MainViewProps {
  userEmail: string;
  userName: string;
  avatarUrl: string | null;
}

export default function MainView({
  userEmail,
  userName,
  avatarUrl,
}: MainViewProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "" });

  const showToast = (message: string) => {
    setToast({ show: true, message });
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `동기화 완료: ${data.created_count}명 추가, ${data.updated_count}명 갱신`
        );
      } else {
        showToast(`동기화 실패: ${data.error}`);
      }
    } catch {
      showToast("동기화 중 오류가 발생했습니다.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <Header
        userEmail={userEmail}
        userName={userName}
        avatarUrl={avatarUrl}
        onSync={handleSync}
        isSyncing={isSyncing}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Task 6에서 CoachTable 추가 */}
        <div className="flex-1 p-6">
          <p className="text-gray-500">코치 목록이 여기에 표시됩니다.</p>
        </div>
      </div>

      <Toast
        message={toast.message}
        show={toast.show}
        onClose={() => setToast({ show: false, message: "" })}
      />
    </div>
  );
}
```

**Step 4: 빌드 확인**

```bash
npm run build
```

**Step 5: 커밋**

```bash
git add src/components/ src/app/page.tsx
git commit -m "feat: add app layout with header, sync button, and toast"
```

---

### Task 5: 구글시트 동기화 API

**Files:**
- Create: `src/lib/google-sheets.ts`
- Create: `src/app/api/sync/route.ts`

**Step 1: 구글시트 읽기 유틸**

Create `src/lib/google-sheets.ts`:
```typescript
import { google } from "googleapis";

interface SheetRow {
  employee_id: string;
  name: string;
  phone: string;
  email: string;
  birth_date: string;
  organization: string;
  subjects: string;
  is_new: string;
  is_available: string;
  notion_url: string;
  portfolio_url: string;
  course_name: string;
}

export async function fetchSheetData(): Promise<SheetRow[]> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "A2:Z", // 헤더 제외, 전체 행
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) return [];

  // 컬럼 매핑 (실제 시트 구조에 맞게 조정 필요)
  // D열=사번(index 3), H열=과정명(index 7)
  return rows
    .filter((row) => row[3]) // 사번이 있는 행만
    .map((row) => ({
      employee_id: row[3]?.trim() ?? "",
      name: row[1]?.trim() ?? "",       // B열: 이름 (추정, 시트 확인 후 조정)
      phone: row[4]?.trim() ?? "",      // E열 (추정)
      email: row[5]?.trim() ?? "",      // F열 (추정)
      birth_date: row[6]?.trim() ?? "", // G열 (추정)
      organization: row[2]?.trim() ?? "",// C열 (추정)
      subjects: row[8]?.trim() ?? "",   // I열 (추정)
      is_new: row[9]?.trim() ?? "",     // J열 (추정)
      is_available: row[10]?.trim() ?? "",// K열 (추정)
      notion_url: row[11]?.trim() ?? "",// L열 (추정)
      portfolio_url: row[12]?.trim() ?? "",// M열 (추정)
      course_name: row[7]?.trim() ?? "",// H열: 과정명
    }));
}

export interface GroupedCoach {
  employee_id: string;
  name: string;
  phone: string;
  email: string;
  birth_date: string;
  organization: string;
  subjects: string[];
  is_new: boolean;
  is_available: boolean;
  notion_url: string;
  portfolio_url: string;
  course_names: string[];
}

export function groupByCoach(rows: SheetRow[]): GroupedCoach[] {
  const map = new Map<string, GroupedCoach>();

  for (const row of rows) {
    const existing = map.get(row.employee_id);
    if (existing) {
      if (row.course_name && !existing.course_names.includes(row.course_name)) {
        existing.course_names.push(row.course_name);
      }
    } else {
      map.set(row.employee_id, {
        employee_id: row.employee_id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        birth_date: row.birth_date,
        organization: row.organization,
        subjects: row.subjects
          ? row.subjects.split(",").map((s) => s.trim())
          : [],
        is_new: row.is_new === "Y" || row.is_new === "신규",
        is_available: row.is_available !== "N" && row.is_available !== "불가",
        notion_url: row.notion_url,
        portfolio_url: row.portfolio_url,
        course_names: row.course_name ? [row.course_name] : [],
      });
    }
  }

  return Array.from(map.values());
}
```

> **NOTE:** 컬럼 매핑(index)은 실제 구글시트 헤더를 확인한 뒤 조정해야 합니다. 첫 동기화 시 시트의 실제 컬럼 순서를 확인하고 `fetchSheetData`의 인덱스를 수정하세요.

**Step 2: 동기화 API 라우트**

Create `src/app/api/sync/route.ts`:
```typescript
import { createClient } from "@/lib/supabase/server";
import { fetchSheetData, groupByCoach } from "@/lib/google-sheets";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();

  // 인증 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 동기화 시작 로그
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ synced_by: user.id, status: "started" })
    .select()
    .single();

  try {
    // 1. 구글시트 데이터 읽기
    const rawRows = await fetchSheetData();
    const coaches = groupByCoach(rawRows);

    let createdCount = 0;
    let updatedCount = 0;

    for (const coach of coaches) {
      // 2. 코치 upsert
      const { data: existing } = await supabase
        .from("coaches")
        .select("id")
        .eq("employee_id", coach.employee_id)
        .single();

      const coachData = {
        employee_id: coach.employee_id,
        name: coach.name,
        phone: coach.phone || null,
        email: coach.email || null,
        birth_date: coach.birth_date || null,
        organization: coach.organization || null,
        subjects: coach.subjects,
        is_new: coach.is_new,
        is_available: coach.is_available,
        notion_url: coach.notion_url || null,
        portfolio_url: coach.portfolio_url || null,
      };

      let coachId: string;

      if (existing) {
        await supabase
          .from("coaches")
          .update(coachData)
          .eq("id", existing.id);
        coachId = existing.id;
        updatedCount++;
      } else {
        const { data: newCoach } = await supabase
          .from("coaches")
          .insert(coachData)
          .select("id")
          .single();
        coachId = newCoach!.id;
        createdCount++;
      }

      // 3. 과정 upsert + 연결
      for (const courseName of coach.course_names) {
        // 과정 upsert (name 기준)
        const { data: course } = await supabase
          .from("courses")
          .upsert({ name: courseName }, { onConflict: "name" })
          .select("id")
          .single();

        if (course) {
          // coach_courses 연결 (중복 무시)
          await supabase
            .from("coach_courses")
            .upsert(
              { coach_id: coachId, course_id: course.id },
              { onConflict: "coach_id,course_id" }
            );
        }
      }
    }

    // 4. 동기화 완료 로그
    await supabase
      .from("sync_logs")
      .update({
        status: "success",
        total_rows: rawRows.length,
        created_count: createdCount,
        updated_count: updatedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncLog!.id);

    return NextResponse.json({
      success: true,
      total_rows: rawRows.length,
      created_count: createdCount,
      updated_count: updatedCount,
    });
  } catch (error) {
    // 실패 로그
    await supabase
      .from("sync_logs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncLog!.id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
```

**Step 3: 빌드 확인**

```bash
npm run build
```

**Step 4: 커밋**

```bash
git add src/lib/google-sheets.ts src/app/api/sync/
git commit -m "feat: add Google Sheets sync API with coach grouping logic"
```

---

### Task 6: 코치 목록 테이블

**Files:**
- Create: `src/components/CoachTable.tsx`
- Modify: `src/components/MainView.tsx`

**Step 1: 코치 테이블 컴포넌트**

Create `src/components/CoachTable.tsx`:
```tsx
"use client";

import { Coach } from "@/lib/types";

interface CoachTableProps {
  coaches: Coach[];
  selectedId: string | null;
  onSelect: (coach: Coach) => void;
}

export default function CoachTable({
  coaches,
  selectedId,
  onSelect,
}: CoachTableProps) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">이름</th>
            <th className="px-4 py-3">소속</th>
            <th className="px-4 py-3">담당 주제</th>
            <th className="px-4 py-3">구분</th>
            <th className="px-4 py-3">가용</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {coaches.map((coach) => (
            <tr
              key={coach.id}
              onClick={() => onSelect(coach)}
              className={`cursor-pointer transition-colors hover:bg-blue-50 ${
                selectedId === coach.id ? "bg-blue-50" : ""
              }`}
            >
              <td className="px-4 py-3 font-medium text-gray-900">
                {coach.name}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {coach.organization ?? "-"}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {coach.subjects.map((s) => (
                    <span
                      key={s}
                      className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                {coach.is_new ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    신규
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    재섭외
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {coach.is_available ? (
                  <span className="text-green-600">가능</span>
                ) : (
                  <span className="text-red-500">불가</span>
                )}
              </td>
            </tr>
          ))}
          {coaches.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                코치 데이터가 없습니다. 동기화 버튼을 눌러 데이터를 가져오세요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: MainView에 코치 목록 데이터 로딩 추가**

Modify `src/components/MainView.tsx` — 코치 데이터 fetch + 테이블 연결:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Coach } from "@/lib/types";
import Header from "./Header";
import CoachTable from "./CoachTable";
import Toast from "./Toast";

interface MainViewProps {
  userEmail: string;
  userName: string;
  avatarUrl: string | null;
}

export default function MainView({
  userEmail,
  userName,
  avatarUrl,
}: MainViewProps) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "" });

  const showToast = (message: string) => {
    setToast({ show: true, message });
  };

  const fetchCoaches = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("coaches")
      .select("*")
      .order("name");
    if (data) setCoaches(data);
  }, []);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `동기화 완료: ${data.created_count}명 추가, ${data.updated_count}명 갱신`
        );
        await fetchCoaches();
      } else {
        showToast(`동기화 실패: ${data.error}`);
      }
    } catch {
      showToast("동기화 중 오류가 발생했습니다.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectCoach = (coach: Coach) => {
    // 모바일에서는 상세 페이지로 이동
    if (window.innerWidth < 1024) {
      window.location.href = `/coaches/${coach.id}`;
      return;
    }
    setSelectedCoach(coach);
  };

  return (
    <div className="flex h-screen flex-col">
      <Header
        userEmail={userEmail}
        userName={userName}
        avatarUrl={avatarUrl}
        onSync={handleSync}
        isSyncing={isSyncing}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <CoachTable
            coaches={coaches}
            selectedId={selectedCoach?.id ?? null}
            onSelect={handleSelectCoach}
          />
        </div>

        {/* Task 7에서 슬라이드 패널 추가 */}
        {selectedCoach && (
          <div className="hidden w-[400px] border-l border-gray-200 lg:block">
            <p className="p-6 text-gray-500">
              패널: {selectedCoach.name}
            </p>
          </div>
        )}
      </div>

      <Toast
        message={toast.message}
        show={toast.show}
        onClose={() => setToast({ show: false, message: "" })}
      />
    </div>
  );
}
```

**Step 3: 빌드 확인**

```bash
npm run build
```

**Step 4: 커밋**

```bash
git add src/components/CoachTable.tsx src/components/MainView.tsx
git commit -m "feat: add coach list table with status badges"
```

---

### Task 7: 코치 상세 슬라이드 패널

**Files:**
- Create: `src/components/CoachPanel.tsx`
- Create: `src/components/CopyButton.tsx`
- Modify: `src/components/MainView.tsx`

**Step 1: 클립보드 복사 버튼**

Create `src/components/CopyButton.tsx`:
```tsx
"use client";

interface CopyButtonProps {
  text: string;
  label: string;
  onCopy: () => void;
}

export default function CopyButton({ text, label, onCopy }: CopyButtonProps) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    onCopy();
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 rounded px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
      title="클릭하여 복사"
    >
      <span>{label}</span>
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    </button>
  );
}
```

**Step 2: 코치 상세 패널**

Create `src/components/CoachPanel.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Coach, Course } from "@/lib/types";
import CopyButton from "./CopyButton";

interface CoachPanelProps {
  coach: Coach;
  onClose: () => void;
  onCopy: (message: string) => void;
}

export default function CoachPanel({ coach, onClose, onCopy }: CoachPanelProps) {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    const fetchCourses = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("coach_courses")
        .select("course_id, courses(*)")
        .eq("coach_id", coach.id);

      if (data) {
        setCourses(
          data
            .map((d) => d.courses as unknown as Course)
            .filter(Boolean)
        );
      }
    };
    fetchCourses();
  }, [coach.id]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{coach.name}</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-6 p-6">
        {/* 배지 */}
        <div className="flex gap-2">
          {coach.is_new ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              신규
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
              재섭외
            </span>
          )}
          {coach.is_available ? (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              가용 가능
            </span>
          ) : (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              가용 불가
            </span>
          )}
        </div>

        {/* 기본 정보 */}
        <div className="space-y-3">
          {coach.organization && (
            <div className="text-sm">
              <span className="text-gray-500">소속: </span>
              <span className="text-gray-900">{coach.organization}</span>
            </div>
          )}
          {coach.birth_date && (
            <div className="text-sm">
              <span className="text-gray-500">생년월일: </span>
              <span className="text-gray-900">{coach.birth_date}</span>
            </div>
          )}
          {coach.subjects.length > 0 && (
            <div className="text-sm">
              <span className="text-gray-500">담당 주제: </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {coach.subjects.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 연락처 */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-900">연락처</h3>
          {coach.phone && (
            <CopyButton
              text={coach.phone}
              label={coach.phone}
              onCopy={() => onCopy("전화번호가 복사되었습니다")}
            />
          )}
          {coach.email && (
            <CopyButton
              text={coach.email}
              label={coach.email}
              onCopy={() => onCopy("이메일이 복사되었습니다")}
            />
          )}
        </div>

        {/* 외부 링크 */}
        <div className="space-y-2">
          {coach.notion_url && (
            <a
              href={coach.notion_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              노션 페이지 열기
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
          {coach.portfolio_url && (
            <a
              href={coach.portfolio_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              포트폴리오 열기
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* 참여 과정 */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-900">참여 교육 과정</h3>
          {courses.length > 0 ? (
            <ul className="space-y-1">
              {courses.map((course) => (
                <li
                  key={course.id}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                  {course.name}
                  <span
                    className={`text-xs ${
                      course.status === "active"
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  >
                    ({course.status === "active" ? "진행중" : "종료"})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">참여 과정 없음</p>
          )}
        </div>

        {/* Task 8에서 CoachMemos 추가 */}
      </div>
    </div>
  );
}
```

**Step 3: MainView에 패널 연결**

Modify `src/components/MainView.tsx`에서 placeholder를 `CoachPanel`로 교체:
```tsx
// import 추가
import CoachPanel from "./CoachPanel";

// 기존 selectedCoach && (...) 블록을 교체:
{selectedCoach && (
  <div className="hidden w-[400px] border-l border-gray-200 lg:block">
    <CoachPanel
      coach={selectedCoach}
      onClose={() => setSelectedCoach(null)}
      onCopy={showToast}
    />
  </div>
)}
```

**Step 4: 빌드 확인**

```bash
npm run build
```

**Step 5: 커밋**

```bash
git add src/components/CoachPanel.tsx src/components/CopyButton.tsx src/components/MainView.tsx
git commit -m "feat: add coach detail slide panel with copy and external links"
```

---

### Task 8: 연락 메모

**Files:**
- Create: `src/components/CoachMemos.tsx`
- Modify: `src/components/CoachPanel.tsx`

**Step 1: 메모 컴포넌트**

Create `src/components/CoachMemos.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CoachMemo } from "@/lib/types";

interface CoachMemosProps {
  coachId: string;
}

export default function CoachMemos({ coachId }: CoachMemosProps) {
  const [memos, setMemos] = useState<CoachMemo[]>([]);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMemos = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("coach_memos")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    if (data) setMemos(data);
  }, [coachId]);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.from("coach_memos").insert({
        coach_id: coachId,
        user_id: user.id,
        content: content.trim(),
      });
      setContent("");
      await fetchMemos();
    }
    setIsSubmitting(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-900">연락 메모</h3>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="메모를 입력하세요..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          저장
        </button>
      </form>

      <div className="space-y-2">
        {memos.map((memo) => (
          <div key={memo.id} className="rounded-lg bg-gray-50 p-3">
            <p className="text-sm text-gray-800">{memo.content}</p>
            <p className="mt-1 text-xs text-gray-400">
              {memo.user_email ?? memo.user_id} · {formatDate(memo.created_at)}
            </p>
          </div>
        ))}
        {memos.length === 0 && (
          <p className="text-sm text-gray-400">아직 메모가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: CoachPanel에 메모 추가**

Modify `src/components/CoachPanel.tsx` — `{/* Task 8에서 CoachMemos 추가 */}` 주석을 교체:
```tsx
// import 추가
import CoachMemos from "./CoachMemos";

// 주석 교체:
<CoachMemos coachId={coach.id} />
```

**Step 3: 빌드 확인**

```bash
npm run build
```

**Step 4: 커밋**

```bash
git add src/components/CoachMemos.tsx src/components/CoachPanel.tsx
git commit -m "feat: add coach contact memo with author and timestamp"
```

---

### Task 9: 모바일 코치 상세 페이지

**Files:**
- Create: `src/app/coaches/[id]/page.tsx`

**Step 1: 모바일 상세 페이지**

Create `src/app/coaches/[id]/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import CoachDetailMobile from "@/components/CoachDetailMobile";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CoachDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: coach } = await supabase
    .from("coaches")
    .select("*")
    .eq("id", id)
    .single();

  if (!coach) notFound();

  return <CoachDetailMobile coach={coach} />;
}
```

Create `src/components/CoachDetailMobile.tsx`:
```tsx
"use client";

import { Coach } from "@/lib/types";
import CoachPanel from "./CoachPanel";
import Toast from "./Toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CoachDetailMobile({ coach }: { coach: Coach }) {
  const router = useRouter();
  const [toast, setToast] = useState({ show: false, message: "" });

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-4 py-3">
        <button
          onClick={() => router.back()}
          className="mr-3 rounded p-1 text-gray-600 hover:bg-gray-100"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold">{coach.name}</h1>
      </div>

      <CoachPanel
        coach={coach}
        onClose={() => router.back()}
        onCopy={(msg) => setToast({ show: true, message: msg })}
      />

      <Toast
        message={toast.message}
        show={toast.show}
        onClose={() => setToast({ show: false, message: "" })}
      />
    </div>
  );
}
```

**Step 2: 빌드 확인**

```bash
npm run build
```

**Step 3: 커밋**

```bash
git add src/app/coaches/ src/components/CoachDetailMobile.tsx
git commit -m "feat: add mobile coach detail page with back navigation"
```

---

### Task 10: Supabase 프로젝트 연결 및 마이그레이션 적용

**Files:**
- Modify: `.env.local`

**Step 1: Supabase 프로젝트 설정**

```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
```

**Step 2: Supabase Dashboard에서 Google OAuth 설정**

1. Supabase Dashboard → Authentication → Providers → Google
2. Google Cloud Console에서 OAuth 2.0 Client ID 생성
3. Redirect URL: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Client ID / Secret을 Supabase에 입력

**Step 3: 마이그레이션 실행**

```bash
npx supabase db push
```

**Step 4: 환경변수 설정**

`.env.local` 파일 생성 (`.env.local.example` 복사 후 실제 값 입력):
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
GOOGLE_PRIVATE_KEY=<private-key>
GOOGLE_SHEET_ID=1hl6VxXYN1kJoQlRCpbpyWV2PFsu3LhFQ
```

**Step 5: 로컬에서 동작 확인**

```bash
npm run dev
```

1. `http://localhost:3000` → `/login` 리다이렉트 확인
2. Google 로그인 → 메인 페이지 확인
3. 동기화 버튼 클릭 → 데이터 로딩 확인

**Step 6: 커밋** (env 파일 제외)

```bash
git add -A -- ':!.env.local'
git commit -m "chore: configure Supabase project and verify deployment"
```

---

## 구현 진행 현황

- [x] Task 1: 프로젝트 초기화
- [x] Task 2: Supabase 설정 + DB 스키마 (← Task 1)
- [x] Task 3: 인증 — Google OAuth (← Task 2)
- [x] Task 4: 앱 레이아웃 + 헤더 (← Task 3)
- [x] Task 5: 구글시트 동기화 API (← Task 2, Task 4와 병렬 가능)
- [x] Task 6: 코치 목록 테이블 (← Task 4)
- [x] Task 7: 코치 상세 슬라이드 패널 (← Task 6)
- [x] Task 8: 연락 메모 (← Task 7)
- [x] Task 9: 모바일 코치 상세 페이지 (← Task 7)
- [x] Task 10: Supabase 연결 + 배포 확인 (← Task 1-9)
