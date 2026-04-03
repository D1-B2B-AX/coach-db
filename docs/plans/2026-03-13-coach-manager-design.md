# Coach Manager 웹앱 설계 문서

> 작성일: 2026-03-13
> 상태: 승인됨

## 1. 프로젝트 개요

교육 프로그램 매니저들이 실습코치 정보를 한 곳에서 조회·탐색·연락할 수 있는 통합 관리 도구.

- **유저**: 매니저 50명+ (구글 로그인, @day1company.co.kr 도메인 제한)
- **관리 대상**: 코치 50~200명
- **기술 스택**: Next.js + Tailwind CSS + Supabase

## 2. 개발 단계

| 단계 | 범위 |
|------|------|
| MVP 1차 | 구글 OAuth, 구글시트 수동 동기화, 코치 목록/상세, 연락 메모 |
| MVP 1.5차 | 노션 API 동기화 (특이사항 페이지 연결) |
| MVP 2차 | 검색/필터, 코치 CRUD, 연락 양식 복사 팝업 |
| 3차 이후 | 강사 UI, 계약/정산, 첨부서류, 만족도, 문자 발송, 자동 동기화 등 |

## 3. 페이지 구조

| 경로 | 화면 | 설명 |
|------|------|------|
| `/login` | 로그인 | 구글 OAuth 버튼. 비인가 접근 시 리다이렉트 |
| `/` | 코치 목록 (메인) | 테이블 리스트 + 우측 슬라이드 패널. 상단에 동기화 버튼 |
| `/coaches/[id]` | 코치 상세 (모바일용) | 태블릿/모바일에서 행 클릭 시 이동하는 전체 페이지 버전 |

### 메인 화면 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│  Coach Manager                [동기화] [사용자아바타]    │
├────────────────────────────────┬────────────────────────┤
│  코치 목록 테이블               │  슬라이드 패널 (상세)   │
│                                │                        │
│  이름 | 주제 | 신규 | 가용     │  이름 / 소속            │
│  ─────────────────────         │  전화번호 (복사)        │
│  ▶ 김코치 | React | 🆕 | ✅   │  이메일 (복사)          │
│    박코치 | Java  |    | ❌   │  노션 | 포트폴리오      │
│    이코치 | PM    | 🆕 | ✅   │                        │
│                                │  ── 참여 과정 ──        │
│                                │  · 과정A (진행중)       │
│                                │  · 과정B (종료)         │
│                                │                        │
│                                │  ── 연락 메모 ──        │
│                                │  메모 입력창             │
│                                │  기존 메모 목록          │
└────────────────────────────────┴────────────────────────┘
```

- **데스크톱/노트북**: 테이블 70% + 패널 30%
- **태블릿/모바일**: 목록만 표시 → 행 탭 시 `/coaches/[id]` 페이지로 이동

### 슬라이드 패널 상세 구성

- 코치 기본 정보 (이름, 소속, 생년월일)
- 신규/재섭외 배지, 가용 여부 배지
- 전화번호 클릭 → 클립보드 복사 + "복사됨" 토스트
- 이메일 클릭 → 클립보드 복사 + "복사됨" 토스트
- 노션 URL → 새 탭 열기
- 포트폴리오 URL → 새 탭 열기
- 참여 교육 과정 목록
- 연락 메모 (작성/조회, 작성자+작성시간 자동 기록)

## 4. DB 스키마

### 핵심 테이블

```sql
-- 사용자 (구글 로그인)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 코치
CREATE TABLE coaches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   TEXT UNIQUE NOT NULL,          -- 사번 (구글시트 D열, 동기화 키)
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  birth_date    DATE,
  organization  TEXT,                          -- 소속
  subjects      TEXT[],                        -- 담당 주제/과목 (배열)
  is_new        BOOLEAN DEFAULT true,          -- 신규 여부 (D-021: 구글시트 Y/N → boolean)
  availability  TEXT DEFAULT 'unknown'         -- 가용 여부 (D-029: 가능/불가/미확인, 앱에서 수동 입력)
                  CHECK (availability IN ('available', 'unavailable', 'unknown')),
  skill_stack   TEXT[],                        -- 기술 스택 (D-016: 1차 비워둠, 1.5차 노션 동기화)
  notion_url    TEXT,
  portfolio_url TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 교육 과정
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  start_date    DATE,
  end_date      DATE,
  operator      TEXT,                          -- 담당 운영자
  status        TEXT DEFAULT 'active'
                  CHECK (status IN ('active', 'completed')),
  client        TEXT,                          -- 고객사
  lead          TEXT,                          -- 담당 LD
  instructor_name TEXT,                        -- 과정 강사 (텍스트, 3차에서 FK로 전환)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 코치 ↔ 과정 (다대다)
CREATE TABLE coach_courses (
  coach_id      UUID REFERENCES coaches(id) ON DELETE CASCADE,
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, course_id)
);

-- 연락 메모
CREATE TABLE coach_memos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 동기화 이력
CREATE TABLE sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_by     UUID REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  total_rows    INT,
  created_count INT,
  updated_count INT,
  error_message TEXT,
  started_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
```

### 3차 이후 대비 (UI 미구현, 스키마만)

```sql
-- 강사
CREATE TABLE instructors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  organization  TEXT,
  specialties   TEXT[],                        -- 전문분야/기술스택
  notes         TEXT,                          -- 특이사항
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 강사 ↔ 과정 (다대다)
CREATE TABLE instructor_courses (
  instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE,
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (instructor_id, course_id)
);
```

## 5. 구글시트 동기화 로직

- **동기화 키**: 사번 (`employee_id`, 구글시트 D열)
- **시트 구조**: 코치 1명이 여러 행에 등장 (행마다 다른 과정명, H열)
- **시트 URL**: `https://docs.google.com/spreadsheets/d/1hl6VxXYN1kJoQlRCpbpyWV2PFsu3LhFQ/edit?gid=1512869353`

### 동기화 흐름

1. 매니저가 [동기화] 버튼 클릭
2. `sync_logs`에 `started` 기록
3. Google Sheets API로 전체 행 읽기
4. 사번(`employee_id`) 기준으로 그룹핑:
   - DB에 없으면 → `coaches` INSERT
   - DB에 있으면 → `coaches` UPDATE (이름, 전화, 이메일 등)
5. H열 과정명 + 고용시작일/종료일 → `courses` 테이블에 UPSERT (`name` 기준) (D-013)
6. `coach_courses` 연결 갱신
   - 정산 컬럼 (기준시급/월급여, 계약서 발송 여부)은 동기화 대상 아님 (D-030)
7. `sync_logs` 업데이트 (`success`/`failed`, 건수)

## 6. RLS (Row Level Security)

- `@day1company.co.kr` 이메일로 인증된 사용자만 모든 테이블 SELECT/INSERT 가능
- `coach_memos`: 본인 작성 메모만 DELETE 가능
- 그 외 UPDATE/DELETE: 로그인 사용자 전원 동일 권한

## 7. 인증

- Supabase Auth + Google OAuth Provider
- 로그인 후 이메일 도메인 체크 (`@day1company.co.kr`)
- 미인증 사용자는 `/login`으로 리다이렉트
- 로그인 사용자는 모두 동일 권한 (역할 구분 없음)
