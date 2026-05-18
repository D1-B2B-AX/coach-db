# 노션 동기화 규칙

> 노션 DB → coaches 테이블 동기화의 전체 규칙.
> 구현: `src/app/api/admin/sync-notion/route.ts`, 코치 데이터 파싱: `src/lib/notion.ts`

## 1. 트리거 & 인증

| 항목 | 내용 |
|------|------|
| API | `GET /api/admin/sync-notion` (dry-run), `POST /api/admin/sync-notion` (실행) |
| 트리거 | 관리자 페이지 동기화 버튼 (수동) |
| 인증 방법 1 | Bearer 토큰 (`SYNC_API_SECRET`) |
| 인증 방법 2 | 매니저 세션 (`requireManager`, **admin 역할만**) |

## 2. 데이터 소스

| 소스 | 환경변수 | 조건 |
|------|----------|------|
| 2026 노션 DB | `NOTION_DATABASE_ID` | 항상 사용 (primary) |
| 2025 노션 DB | `NOTION_DATABASE_ID_2025` | `NOTION_INCLUDE_2025=true`일 때만 |

- Notion API v2022-06-28, 페이지 100개 단위 커서 페이지네이션
- 환경변수: `NOTION_API_KEY`

## 3. 컬럼 매핑

### 3-1. 2026 노션 DB → coaches

| 노션 필드 | DB 필드 | 비고 |
|-----------|---------|------|
| 이름 | `name` | 매칭 키 (이름으로 기존 코치 조회) |
| 연락처 | `phone` | |
| 이메일 | `email` | |
| 생년월일 | `birthDate` | `YYYY.MM.DD`, `YYYY-MM-DD`, `YYMMDD` 형식 지원 |
| 소속 | `affiliation` | |
| 근무 유형 / 근무유형 / 유형 | `workType` | 3개 필드 합산, `normalizeWorkTypeString` 정규화 |
| 이력서 및 포트폴리오 | `portfolioUrl` | |
| 특이사항 / 히스토리 | `selfNote` | `sanitizeHistoryNote`로 정제 |
| 근무 가능 기간 + 근무 가능 세부 내용 | `availabilityDetail` | 두 필드 합쳐서 저장 |
| 교육 및 가능 분야 + 전문 분야 | `fields` (coach_fields) | 합산 후 중복 제거 |
| 가능 커리큘럼 | `curriculums` (coach_curriculums) | |

### 3-2. 2025 노션 DB → coaches (보조)

| 노션 필드 | DB 필드 | 비고 |
|-----------|---------|------|
| 이름 | `name` | 매칭 키 |
| 연락처 (번호&메일) | `phone`, `email` | `email / phone` 형식 파싱, 010 시작이면 phone, @포함이면 email |
| 생년월일 | `birthDate` | |
| 소속 | `affiliation` | |
| 유형 | `workType` (subjects) | |
| 비고/참고사항 | `portfolioUrl` | |
| 가능 여부 특이사항 | `availabilityDetail` | |
| 가능분야 | `fields` (coach_fields) | |
| 가능 커리큘럼 + 보유 스킬 | `curriculums` (coach_curriculums) | 합산 후 중복 제거 |
| (빈 이름 필드) | `availability_status` | "활동중" → available, "미활동중"/"탈락" → unavailable |

## 4. 2026 / 2025 DB 병합 규칙

| 상황 | 처리 |
|------|------|
| 2026 DB에만 있는 코치 | `availability_status = available` |
| 2025 DB에만 있는 코치 | `availability_status = unavailable` |
| 양쪽 다 있는 코치 | 2026이 primary, 2025는 **빈 필드만 보완** |

### 2025 → 2026 보완 규칙 (양쪽 다 있는 코치)

- `phone`, `email`, `birth_date`, `organization`, `portfolio_url`, `available_fields`, `availability_detail`, `availability_period`: 2026 값이 비어있을 때만 2025 값으로 채움
- `skill_stack`: 2026이 빈 배열이면 2025 값 사용
- `subjects`: 두 소스 합산 (union)
- `availability_status`: **2026 DB에 있으면 무조건 available 유지** (2025 상태로 덮어쓰지 않음)

## 5. workType 정규화

- 근무 유형 / 근무유형 / 유형 3개 필드를 합산
- 제외 태그: `기존`, `신규`, `취소` (EXCLUDED_TYPE_TAGS)
- `normalizeWorkTypeString`으로 최종 정규화

## 6. selfNote 정제 (sanitizeHistoryNote)

다음 패턴의 라인 제거:
- `삼전 전용으로...` (삼성 전용 코치 정보 — 민감 데이터)
- `컨택 가능` 포함 라인
- `일정에 한해` 포함 라인
- `일정을 받고` 포함 라인

## 7. fields / curriculums 동기화

| 테이블 | 동작 |
|--------|------|
| `coach_fields` | 기존 코치: **전체 삭제 후 재생성** (delete + create) |
| `coach_curriculums` | 기존 코치: **전체 삭제 후 재생성** |
| `fields` | `upsert` (name 기준, 없으면 생성) |
| `curriculums` | `upsert` (name 기준, 없으면 생성) |

- fields 소스: "교육 및 가능 분야" + "전문 분야" 합산, 중복 제거
- curriculums 소스: "가능 커리큘럼" 단독, 중복 제거

## 8. 충돌 처리

### 핵심 원칙: 코치DB 데이터는 절대 삭제하지 않는다

노션은 코치 정보의 주요 입력 소스이지만, 코치DB에만 존재하는 데이터(별점, 복귀일, 메모, 가용 상태 등)가 있다.
동기화는 **노션에 값이 있을 때만 업데이트**하고, **코치DB의 기존 값을 삭제하거나 null로 덮어쓰는 일은 절대 없어야 한다.**

- 노션에 값이 있으면 → DB 업데이트
- 노션에 값이 비어있으면 → **기존 DB 값 유지** (`phone ?? existing.phone` 패턴)
- fields/curriculums → 노션에 값이 있을 때만 delete + recreate, 비어있으면 기존 유지

### 동작 정리

| 상황 | 처리 |
|------|------|
| DB에 없는 코치 | **자동 생성** (name, phone, email, birthDate, affiliation, workType, portfolioUrl, selfNote, availabilityDetail, accessToken) |
| DB에 있는 코치 + 노션에 값 있음 | **업데이트** (해당 필드만) |
| DB에 있는 코치 + 노션에 값 없음 | **기존 DB 값 유지** (절대 삭제 안 함) |
| 이름 비어있는 노션 페이지 | **스킵** |

### 구글시트와의 우선순위

| 필드 | 우선순위 | 이유 |
|------|----------|------|
| `workType` | **노션 > 구글시트** | 노션이 마스터 |
| `email`, `phone` | **구글시트 > 노션** | 계약서가 최신 (단, 구글시트 동기화는 빈 값만 보완) |
| `fields`, `curriculums` | **노션 단독** | 구글시트에 해당 데이터 없음 |
| `portfolioUrl`, `selfNote`, `availabilityDetail` | **노션 단독** | |

## 9. Dry-run 모드

`GET /api/admin/sync-notion` — 실제 DB 변경 없이 diff 확인

```typescript
{
  dryRun: true,
  notionCount: number,    // 노션 페이지 수
  toCreate: number,       // 신규 생성 예정
  toUpdate: number,       // 업데이트 예정
  skipped: number,        // 이름 없어서 스킵
  changes: [{
    name: string,
    action: "created" | "updated" | "skipped",
    details?: string,     // 변경 필드 목록 or "변경 없음"
    diffs?: [{            // 필드별 DB값 vs 노션값
      field: string,
      db: string | null,
      notion: string | null,
    }] | null,
  }],
}
```

## 10. 실행 모드 리턴값

`POST /api/admin/sync-notion`

```typescript
{
  success: true,
  notionCount: number,
  created: number,
  updated: number,
  skipped: number,
  logs: string[],         // "+ 이름" (생성) or "↻ 이름" (업데이트)
}
```

## 11. 앱에서 건드리지 않는 필드 (노션 동기화 대상 아님)

| 필드 | 관리 주체 |
|------|-----------|
| `availability` | 매니저 수동 입력 |
| `coach_memos` | 매니저 직접 작성 |
| `coach_schedules` | 코치 직접 입력 |
| `managerNote` | 매니저 직접 작성 |
| `dxTag` | 삼성 동기화 전용 |
