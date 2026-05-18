# 계약시트 동기화 규칙 (조교실습코치_일반계약요청)

> 구글시트 "조교실습코치_일반계약요청" → DB 동기화의 전체 규칙.
> 구현: `src/lib/sync/engagements.ts`, API: `POST /api/sync/engagements`

## 1. 트리거 & 인증

| 항목 | 내용 |
|------|------|
| 트리거 | 대시보드 캘린더 새로고침 버튼 (수동) |
| 인증 방법 1 | Bearer 토큰 (`SYNC_API_SECRET`) — cron/GitHub Actions용 |
| 인증 방법 2 | 매니저 세션 (`requireManager`) — 버튼 클릭용 |
| 로깅 | `syncLog` 테이블, `triggeredBy`: `cron:github-actions` 또는 `button:{email}` |

## 2. 데이터 소스 접근

- Google Drive API (서비스 계정, `drive.readonly` 스코프)
- 파일 ID: `GOOGLE_SHEET_ID` 환경변수
- xlsx 바이너리 다운로드 → `XLSX.read` 파싱
- 시트 이름 정확히 `"조교실습코치_일반계약요청"` 매칭 (못 찾으면 에러)

## 3. 컬럼 매핑

### 3-1. → coaches (보완만, 덮어쓰기 아님)

| 시트 컬럼 | DB 필드 | 규칙 |
|-----------|---------|------|
| D열 (사번) | `employeeId` | 노이즈 제거 → 유니크 값 join (예: `"91000025, 81000012"`) |
| N열 (E-mail) | `email` | 기존 값 **없을 때만** 보완 |
| O열 (연락처) | `phone` | 기존 값 **없을 때만** 보완, 숫자 추출 → `010-xxxx-xxxx` 정규화 |
| F열 (담당직무) | `workType` | **동기화 안 함** — 노션이 마스터 (우선순위: 노션 > 시트) |

### 3-2. → engagements

| 시트 컬럼 | DB 필드 | 규칙 |
|-----------|---------|------|
| E열 (근무자 성명) | `coachId` | 이름으로 coaches 조회, 매칭 실패 시 스킵 |
| H열 (과정명) | `courseName` | |
| J열 (고용시작일) | `startDate` | YYYY.MM.DD / YYYY-MM-DD / Excel 시리얼 넘버 |
| K열 (고용종료일) | `endDate` | 동일 |
| I열 (시급) | `hourlyRate` | 쉼표/원/공백 제거, 0 < rate < 1,000,000 |
| G열 (담당Manager) | `hiredBy` | |
| F열 (담당직무) | `workType` | engagement 레벨에는 저장 |
| M열 첫 번째 스케줄 | `startTime`, `endTime` | M열 파싱 결과의 첫 번째 시간대 |
| (계산) | `status` | endDate < now → completed, startDate ≤ now ≤ endDate → in_progress, else → scheduled |

### 3-3. → engagement_schedules

| 시트 컬럼 | DB 필드 | 규칙 |
|-----------|---------|------|
| M열 (소정근로일별 근로시간) | `date`, `startTime`, `endTime` | 15+ 형식 파싱, 날짜별 개별 레코드 |

## 4. 스킵 조건

| 조건 | 체크 |
|------|------|
| 이름 또는 과정명 비어있음 | `!name \|\| !courseName` |
| 취소 행 | H열(과정명)에 "취소" 포함 **또는** A열(계약서발송)에 "취소" 포함 **또는** H열에 취소선(strikethrough) 서식 |
| 날짜 파싱 실패 | J열/K열 중 하나라도 파싱 불가 |
| DB에 없는 코치 | 이름 매칭 실패 → 스킵 (자동 생성 안 함) |
| 중복 engagement | `coachId + courseName + startDate` 기존 존재 시 스킵 |

## 5. 사번(D열) 정규화

- 노이즈 필터: `취소`, `입사취소`, `입사 취소`, `계약취소`, `근무취소`, `사번없음`, `-`
- 접미사 제거: `-숫자` (예: `91000025-1` → `91000025`)
- 괄호 내용 제거: `91000025(재입사)` → `91000025`
- 같은 이름에 사번 여러 개면 정렬 후 join: `"81000012, 91000025"`

## 6. M열 파싱 (소정근로일별 근로시간)

### 지원 형식

| 형식 | 예시 |
|------|------|
| 단일 날짜+시간 | `2023.02.13(월) 09:00~17:00` |
| 풀 날짜 범위 | `2023. 1. 2 ~ 2023. 2. 24 (월~금) 08:00 ~ 17:00` |
| 같은 달 짧은 범위 | `2023. 1.9(월)~12(목) 08:00 ~ 11:30` |
| 복수 시간대 | `2023. 1.04 (수) 10:00 - 11:00 , 20:00 - 22:00` |
| 연도 없는 날짜 | `8월 22일(목) 07:00 ~ 12:00` (contextYear로 보완) |
| M/D 형식 | `11/28, 12/5` |
| 연속 근무 (2일 걸침) | `3월 5일 18:00 ~ 3월 6일 09:00` → 첫날 start~23:59 + 다음날 00:00~end |

### 요일 필터

| 패턴 | 예시 | 결과 |
|------|------|------|
| 범위 | `(월~금)` | 월~금만 포함 |
| 키워드 | `(주말 제외)` | 월~금만 포함 |
| 리스트 | `(월, 화, 수, 금)` | 해당 요일만 포함 |

### 파싱 규칙

- `HH:MM` 패턴이 없는 라인은 스킵
- 여러 줄(`\n`)은 각각 독립 파싱
- 모든 Date는 **UTC 정오(12:00:00)** 생성 — 타임존 밀림 방지
- contextYear: startDate의 연도 사용, 없으면 현재 연도

## 7. source 필드 (engagement 출처 구분)

| 값 | 의미 | 설정 시점 |
|----|------|-----------|
| `sheet` | 계약시트 동기화로 생성 | 동기화 시 신규 생성 |
| `manual` | 매니저가 앱에서 직접 생성 | POST /api/coaches/:id/engagements |

기존 레코드는 모두 `manual` (기본값).

## 8. 충돌 처리 (날짜 겹침 + source 기반)

### 코치 매칭

| 상황 | 처리 |
|------|------|
| DB에 없는 코치 (2026년~) | **자동 생성** (name, accessToken, employeeId, email, phone, workType) |
| DB에 없는 코치 (~2025년) | **스킵** (과거 이력만 있는 코치 자동 생성 방지) |
| DB에 있는 코치 + 시트에 새 정보 | email/phone/employeeId **빈 값일 때만 보완** |
| 앱 수동 입력 필드 (availability, memos) | **절대 건드리지 않음** |
| workType | engagement에는 저장, coach 테이블은 건드리지 않음 |

### Engagement 매칭

중복 판단: `coachId + 날짜 겹침` (startDate ≤ existing.endDate AND endDate ≥ existing.startDate)

| 상황 | 처리 |
|------|------|
| 날짜 겹치는 `manual` engagement 있음 | **빈 필드만 보완** (courseName, startTime, endTime, hourlyRate, workType, hiredBy 중 null인 것만) |
| 날짜 겹치는 `sheet` engagement 있음 | **시트 데이터로 전체 업데이트** + engagement_schedules 재생성 |
| 매칭 없음 | **신규 생성** (source: sheet) |

핵심 원칙: **매니저가 직접 입력한 데이터는 절대 덮어쓰지 않는다.** 빈 필드만 채워준다.

## 9. Course 자동 매칭 (매니저 연결)

- engagement **신규 생성** 시 G열(hiredBy) 매니저 이름으로 `managers` 테이블 조회
- 매칭되는 매니저가 있으면 `courses` 테이블에 자동 생성
- 중복 판단 키: `managerId + name + startDate` (+ `deletedAt: null`)
- 매핑: courseName → `name`, startDate → `startDate`, endDate → `endDate`, hourlyRate → `hourlyRate`
- 매니저 이름 매칭 실패 시 → Course 생성 안 함 (engagement는 정상 생성)

## 10. engagement_schedule 생성

- engagement **신규 생성** 시 M열 파싱 결과로 레코드 생성
- `sheet` engagement **업데이트** 시 기존 schedules 삭제 후 재생성
- `manual` engagement 매칭 시 → schedules 건드리지 않음

## 11. Dry-run 모드

`GET /api/sync/engagements` — 실제 DB 변경 없이 변경사항 미리보기

## 12. 리턴값 (SyncResult)

```typescript
{
  totalRows: number      // 헤더 제외 전체 행 수
  created: number        // 신규 생성 수
  updated: number        // 업데이트 수 (manual 보완 + sheet 업데이트)
  skipped: number        // 스킵된 행 수
  errors: number         // 에러 수
  errorDetail: string[]  // 미매칭 코치 목록 등
  changes?: SyncChange[] // dry-run 시 변경 상세
}
```
