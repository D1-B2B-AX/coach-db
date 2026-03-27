# 데이터 동기화 규칙

> 소스별 데이터 매핑, 충돌 처리, 동기화 주기를 정리한 운영 참조 문서.

## 1. 동기화 주기

| 대상 | 트리거 | 주기 | API |
|---|---|---|---|
| 계약/일정 (engagements) | 대시보드 캘린더 새로고침 버튼 | 수동 | `POST /api/sync/engagements` |
| 삼성 스케줄 | 관리자 페이지 동기화 버튼 | 수동 | `POST /api/sync/samsung-schedule` |
| 삼성 스케줄 | GitHub Actions | 매월 마지막 주 화요일 | 같은 API |
| 노션 | CLI 스크립트 | 수동 | `npx tsx scripts/import-notion-*.ts` |

## 2. 소스별 매핑

### 2-1. 구글시트 → coaches

시트: "조교실습코치_일반계약요청"

| 시트 컬럼 | DB 필드 | 비고 |
|---|---|---|
| D열 (사번) | `employeeId` | 동기화 키 |
| E열 (근무자 성명) | `name` | 최초 생성 시. 이후 수동 수정 가능 |
| N열 (E-mail) | `email` | 계약서 데이터 |
| O열 (연락처) | `phone` | 계약서 데이터 |
| G열 (담당Manager) | `hiredBy` | |
| F열 (담당직무) | `workType` | 노션에 없을 때만 보완 |

### 2-2. 구글시트 → engagements

시트: "조교실습코치_일반계약요청"

| 시트 컬럼 | DB 필드 | 비고 |
|---|---|---|
| E열 (근무자 성명) | `coachId` | 이름으로 coaches 조회 |
| H열 (과정명) | `courseName` | |
| J열 (고용시작일) | `startDate` | |
| K열 (고용종료일) | `endDate` | |
| I열 (시급) | `hourlyRate` | 과정별 — 코치 상세에서 미표시 (D-033) |
| G열 (담당Manager) | `hiredBy` | |
| F열 (담당직무) | `workType` | |
| - | `status` | 계산: startDate/endDate 기준 |

### 2-3. 구글시트 → engagement_schedules

시트: "조교실습코치_일반계약요청"

| 시트 컬럼 | DB 필드 | 비고 |
|---|---|---|
| M열 (소정근로일별 근로시간) | `date`, `startTime`, `endTime` | 15+ 형식 파싱 지원 |

시트: "26년 일정" (삼성)

| 시트 컬럼 | DB 필드 | 비고 |
|---|---|---|
| C열 (시작일) ~ D열 (종료일) | `date` | 범위 전개 |
| - | `startTime`, `endTime` | 고정 09:00~18:00 |

### 2-4. 노션 → coaches

| 노션 필드 | DB 필드 | 비고 |
|---|---|---|
| 이력서 및 포트폴리오 | `portfolioUrl` | |
| 특이사항/히스토리 | `selfNote` | |
| 근무 가능 기간 | `availabilityDetail` | |
| 근무 유형 | `workType` | 우선순위: 노션 > 구글시트 |
| 교육 및 가능 분야 | `fields` (coach_fields) | |
| 전문 분야 | `fields` (coach_fields) | |
| 가능 커리큘럼 | `curriculums` (coach_curriculums) | |

## 3. 충돌 처리 규칙

### 동기화 시 행동 원칙

| 상황 | 처리 |
|---|---|
| DB에 없는 코치 | **자동 생성** (2026년 계약 데이터인 경우) |
| DB에 있는 코치 + 시트에 새 정보 | **덮어쓰기** (email, phone 등 시트 소유 필드) |
| 앱 수동 입력 필드 | **건드리지 않음** (availability, memos) |
| 같은 engagement 키 존재 | **스킵** (coachId + courseName + startDate) |
| "취소" 표시 행 | **스킵** |
| 코치 이름 매칭 실패 | **로그 남기고 스킵** |

### 소스 간 우선순위

| 필드 | 우선순위 | 이유 |
|---|---|---|
| `workType` (coaches) | 노션 > 구글시트 | 노션이 마스터 |
| `email`, `phone` | 구글시트 | 계약서가 최신 |
| `fields`, `curriculums` | 노션 단독 | |

### 삼성 스케줄 특이사항

| 상황 | 처리 |
|---|---|
| 재동기화 시 | 기존 삼성 engagement + engagement_schedule **삭제 후 재생성** |
| "/" 구분 코치명 | 분리 후 각각 매칭 |
| 코스명 | 고정 "삼성전자 SW학부 교육과정" |
| 시간 미지정 | 고정 09:00~18:00 |
| UI 표시 (투입이력) | 코치별 1건 통합 표시 (2026-03-01~06-30), 개별 차수 분리 안 함 |
| UI 표시 (코치뷰/스케줄) | 날짜별 engagement_schedule로 표시, 과정명은 "삼성전자 SW학부 교육과정" |

## 4. 앱 전용 데이터 (외부 소스 없음)

| 데이터 | 설명 |
|---|---|
| `coaches.availability` | 매니저가 수동 입력 (D-029) |
| `coach_memos` | 매니저가 직접 작성 |
| `sync_logs` | 동기화 실행 시 자동 기록 |
| `coach_schedules` | 코치가 직접 입력하는 가용 시간 |

## 5. 중복 판단 키

| 테이블 | 키 | 동작 |
|---|---|---|
| `engagements` | coachId + courseName + startDate | 중복 시 스킵 |
| `coach_schedules` | coachId + date + startTime + endTime | 중복 시 스킵 |
| `engagement_schedules` (삼성) | - | 재동기화 시 전체 삭제 후 재생성 |

## 6. M열 파싱 지원 형식

| 형식 | 예시 |
|---|---|
| 단일 날짜+시간 | `2023.02.13(월) 09:00~17:00` |
| 풀 날짜 범위 | `2023. 1. 2 ~ 2023. 2. 24 (월~금) 08:00 ~ 17:00` |
| 같은 달 짧은 범위 | `2023. 1.9(월)~12(목) 08:00 ~ 11:30` |
| 복수 시간대 | `2023. 1.04 (수) 10:00 - 11:00 , 20:00 - 22:00` |
| 요일 필터 | `(월~금)`, `(주말 제외)`, `(월, 화, 수, 금)` |
| 연도 없는 날짜 | `8월 22일(목) 07:00 ~ 12:00` |
| M/D 형식 | `11/28, 12/5` |
| 연속 근무 (2일) | `3월 5일 18:00 ~ 3월 6일 09:00` |
