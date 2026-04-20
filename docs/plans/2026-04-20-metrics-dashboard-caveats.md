# 지표 대시보드 — 데이터 정확도 주의사항

작성일: 2026-04-20
대상 파일:
- `src/app/api/admin/metrics/summary/route.ts`
- `src/app/admin/metrics/page.tsx`

## 배경

지표 대시보드(`/admin/metrics`)의 "일별 입력수 추이" 히트맵이 일부 입력을 누락하거나 엉뚱한 날짜에 표시하는 문제가 보고됨(2026-04-20). 원인 추적 과정에서 다수의 날짜 집계 버그와 해석 모호성이 드러났음. 아래는 **이번 커밋에서 고친 것**과 **여전히 주의해야 할 것**의 정리.

## 이번 커밋에서 고친 것 (2026-04-20)

### 1. 타임존(KST) 보정
- 프로덕션 Postgres 타임존이 `Etc/UTC`. 기존 `TO_CHAR(last_edited_at, 'YYYY-MM-DD')`는 UTC 기준으로 일자를 뽑아 KST 00:00~09:00 사이 편집이 전날 컬럼에 찍히는 버그(4월 23건 중 6건).
- `summary/route.ts`의 다음 지점을 KST 보정:
  - `calcDailyTrend` 모든 `TO_CHAR` → `TO_CHAR(... AT TIME ZONE 'Asia/Seoul', ...)`
  - `calcWeeklyTrend` 동일
  - route handler의 `isCurrentMonth`는 KST 기준 `kstToday()` 비교
  - scouting/coach-pool 월 경계: `monthRange(...)` → `monthRangeKst(...)` (UTC가 아닌 KST 자정 경계)
  - 영향 지표: 섭외 응답률, 외부 구인 비율 분모, 매니저당 평균 코치 pool, 6개월 추이 차트

### 2. 히트맵 두 가지 해석 분리
- **이번 달 입력** (`scheduleEdits`, `year_month = 선택월` 필터): 기존 로직. "당월 스케줄을 저장한 코치 수" — KPI "일정 입력률"의 분자와 일치.
- **전체 입력** (`anyMonthEdits`, `last_edited_at` ∈ 선택월 KST): 신규. 어떤 달 스케줄이든 그 달력월에 저장한 이벤트 수. 코치가 다음 달 스케줄을 미리 입력하는 활동까지 포착.
- 예: 4/17 김시은이 9월 스케줄 저장 → "이번 달 입력"에는 0, "전체 입력"에는 7건(6개월치 저장이 한꺼번에 찍힘).

### 3. 히트맵 표시 범위 수정
- 기존 `data.filter((d) => d.day >= 3)` 제거. 매월 1, 2일 데이터가 항상 숨겨지던 문제와, 이로 인해 DS/DX 일별 차분의 첫 열(day 3)이 day 1~3 누적으로 부풀려지던 문제 동시 해결.

## 이번 커밋에서 **고치지 않은** 정확도 이슈

### A. 외부 데이터 소스 의존 (스테일 가능)
- **`sentCoachIds`**: 구글 링크 시트(`1HFG4pRM7vH4FhezmkQXokFfCJcpI9Dsp9kzc1CH-K2Q`)의 C열 URL 토큰을 파싱해 "실제 발송 대상 코치"를 결정. 시트 갱신이 늦으면 입력률 분모·삼전 현황·일정 제공 비율이 전부 실제와 다름.
- **`MetricSnapshot` 외부 채널 수치**: 관리자가 "수동 입력" 버튼으로 넣는 값(오픈채팅방/슬랙/알바몬/기타). 입력 누락 월은 `null`로 표시되며, 외부 구인 비율 산출 시 0으로 간주.

### B. 지표 의미의 모호성 (설계 의도 확인 필요)
- **"일정 입력률" KPI**: `year_month = 선택월`에 스케줄을 저장한 코치 비율. 코치가 **다음 달 스케줄만** 미리 저장하면 당월 KPI에 미반영. "활동" 지표로 쓰려면 히트맵의 "전체 입력" 해석이 더 적절함.
- **DS/DX 누적 입력 현황(삼전 일정 입력 현황)**: `year_month = 선택월`만 집계. 삼전 코치가 다른 달 스케줄을 저장해도 당월 DS/DX 막대에는 반영되지 않음. 현재는 설계 의도로 판단.

### C. 아직 살아있는 서버 로컬시각 의존
- `calcExternalHireHistory`의 개월 목록 생성: `new Date(currentYear, currentMonth - 1 - i, 1)`. 서버가 UTC이므로 월 경계에서 ±1월 틀어질 이론적 가능성 있음. 실제로는 `yearMonth` 문자열 기반 비교라 값 자체는 맞지만, 달력상 "어떤 달이 최신인지" 판단이 월 첫날 0~9시 KST 사이에 흔들릴 수 있음.
- `calcWeeklyTrend`의 `new Date(year, month - 1, weekStart).getDay()` — 주의 시작 요일 계산. UTC 서버에서 자정 경계일 때 요일이 다르게 나올 이론적 가능성. 실 데이터 영향은 낮지만 남아있음.

### D. 데이터 정합성 (지표 로직과 별개)
- 2026-04-06 12:10:03에 `coaches.deletedAt`에 **김씨 성 코치 35명 일괄 삭제** 등 벌크 변경 흔적. 의도된 정리인지 미확인.
- 사용자가 "최근 입력했다"고 알고 있는 케이스와 DB 상태가 어긋날 수 있음 (예: 박범찬 — 페이지 접속만 했고 저장은 하지 않음). 본 커밋에서 "전체 입력" 행을 추가해 **어떤 달 스케줄이든 실제 저장 이벤트**를 볼 수 있게 했지만, 아무 행에도 안 뜨면 해당 코치는 실제 저장 자체를 안 한 것.

## 향후 대응 후보 (우선순위 낮음)

1. `calcExternalHireHistory` / `calcWeeklyTrend.getDay()`도 KST 기반으로 전면 정리.
2. `ScheduleAccessLog`에 `firstEditedAt` 컬럼 추가 — "첫 입력 시점" 히트맵 옵션 제공. 현 스키마는 `lastEditedAt`만 보존해 재편집 시 과거 날짜 수가 감소.
3. `MetricSnapshot` 입력 UX 개선(월 바뀌면 알림 등)으로 수동 입력 누락 방지.
4. 링크 시트 동기화 상태 체크(시트 마지막 수정일 노출) 기능.
