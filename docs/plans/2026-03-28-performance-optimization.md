# 성능 최적화 계획

> 2026-03-28 작성 | 코치 272명, 과정 168개 기준

## 현황 요약

클린코드 리팩토링(가독성/유지보수성) 대신 **런타임 성능 최적화**에 집중.
사용자 체감 속도 개선이 목표.

---

## 1. DB 인덱스 추가 — HIGH (5분, 효과 큼)

**문제**: 자주 사용하는 WHERE 조건에 인덱스 없음

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| `engagement_schedules` | `(coach_id, date)` | 코치별 일정 조회, 근무일 집계 |
| `coach_schedules` | `(coach_id, date)` | 가용 스케줄 조회 |
| `audit_logs` | `(created_at)` | 3개월 범위 필터링 |
| `engagements` | `(coach_id)` | 코치별 투입이력 조회 |

**상태**: [x] 완료

---

## 2. N+1 쿼리 최적화 — HIGH

### GET /api/coaches (코치 목록)

**문제**: 메인 쿼리 후 rating groupBy + workDay raw SQL 순차 실행 (3회 왕복)

**해결**: rating groupBy와 workDay raw SQL을 `Promise.all`로 메인 쿼리와 병렬 실행

**파일**: `src/app/api/coaches/route.ts`

**상태**: [x] 완료 — 이미 `Promise.all`로 코치+카운트 병렬이었으나, rating/workDay는 순차. 3개 쿼리를 모두 병렬로 변경.

---

## 3. 감사로그 서브쿼리 분리 — HIGH

**문제**: `WHERE recordId IN (await prisma.engagement.findMany(...))` — WHERE 절 안에서 서브쿼리 실행

**해결**: engagement ID를 먼저 조회 후 OR 조건에 사용 (코드 구조 동일하지만 의도 명확화)

**파일**: `src/app/api/coaches/[id]/audit-logs/route.ts`

**상태**: [x] 완료

---

## 4. API Cache-Control 헤더 — MEDIUM

**문제**: 마스터 데이터(분야, 커리큘럼)가 거의 변하지 않는데 매번 DB 조회

**해결**: GET 응답에 `Cache-Control: private, max-age=3600` 추가

**대상 API**:
- `GET /api/master/fields`
- `GET /api/master/curriculums`

**상태**: [x] 완료

---

## 5. 탭 컴포넌트 Lazy Loading — MEDIUM

**문제**: 코치 상세 페이지에서 ProfileTab, ScheduleTab, EngagementTab, DocumentTab 전부 즉시 import

**해결**: `next/dynamic`으로 lazy loading. 활성 탭만 로드.

**파일**: `src/app/(manager)/coaches/[id]/page.tsx`

**상태**: [x] 완료

---

## 향후 고려사항 (이번 범위 밖)

| 항목 | 설명 | 우선순위 |
|------|------|----------|
| React Query 도입 | 클라이언트 캐싱, 자동 revalidation | HIGH |
| 리스트 가상화 | 코치 500명 렌더링 시 DOM 부하 | MEDIUM |
| 폰트 프리로드 | Pretendard CDN 로딩 최적화 | LOW |
| 스케줄 벌크 API | 6개월 prefetch를 단일 요청으로 | LOW |
