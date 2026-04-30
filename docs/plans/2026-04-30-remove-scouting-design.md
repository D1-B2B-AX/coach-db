# 섭외(Scouting) 기능 제거 설계

> 2026-04-30 | 섭외 플로우 전체 제거, 계약 시트 기반 읽기 전용 전환

## 배경

섭외 스테이지(제안→수락→확정) 기능을 제거한다. 계약 시트를 읽어서 확정된 계약을 코치/매니저 페이지에서 보여주기만 한다.

## 방침

- **제거**: Scouting 모델, 상태머신, 제안/수락/확정 UI, 관련 API 전체
- **유지**: Engagement 테이블 데이터 (섭외에서 생성된 건 포함, 덮어쓰기 없음)
- **유지**: 구글시트→Engagement 동기화 (기존 동작 그대로)
- **변경**: 매니저/코치 페이지에서 Engagement를 읽기 전용으로 표시

## 현황

- Scouting 테이블: 8건 (cancelled 5, confirmed 3)
- confirmed 3건은 모두 같은 Engagement 1건으로 전환 완료 (김시은/JB금융 6월 과정)
- 구글시트→Engagement 자동 동기화 이미 동작 중 (`src/lib/sync/engagements.ts`)

## 삭제 파일 (8개)

| 파일 | 이유 |
|------|------|
| `src/app/api/scoutings/route.ts` | 섭외 CRUD API |
| `src/app/api/scoutings/[id]/route.ts` | 섭외 상태변경 API |
| `src/app/api/coach/scoutings/[id]/route.ts` | 코치 수락/거절 API |
| `src/lib/scouting-state-machine.ts` | 상태전이 로직 |
| `src/lib/__tests__/scouting-state-machine.test.ts` | 테스트 |
| `src/app/(manager)/mypage/ScoutingTab.tsx` | 매니저 섭외 탭 |
| `src/app/(manager)/mypage/ConfirmModal.tsx` | 확정 모달 |
| `src/components/coach/ScoutingAlerts.tsx` | 코치 알림 UI |

## 편집 파일

| 파일 | 변경 |
|------|------|
| `prisma/schema.prisma` | Scouting 모델, ScoutingStatus enum, 관계 필드 제거 |
| `src/app/(manager)/mypage/page.tsx` | 섭외 탭 제거 |
| `src/app/(manager)/mypage/utils.ts` | Scouting 타입/함수 제거 |
| `src/app/coach/page.tsx` | ScoutingAlerts 제거, 배정과정 읽기 전용 |
| `src/app/(manager)/schedule/_components/DashboardContent.tsx` | 섭외 일괄생성 제거 |
| `src/components/Header.tsx` | 섭외 알림 뱃지 제거 |
| `src/components/coach/ScheduleCalendar.tsx` | 섭외 하이라이트 제거 |
| `src/lib/notification-service.ts` | 섭외 알림 트리거 제거 |
| `src/lib/engagement-cascade.ts` | 삭제 가능 (섭외 캐스케이드 전용) |
| `src/app/api/coach/notifications/route.ts` | scouting_request 필터 제거 |
| `src/app/api/admin/metrics/summary/route.ts` | 섭외 통계 제거 |
| `src/app/admin/metrics/page.tsx` | 섭외 지표 UI 제거 |

## DB 마이그레이션

```sql
DROP TABLE IF EXISTS scoutings;
DROP TYPE IF EXISTS "ScoutingStatus";
```

Engagement/EngagementSchedule 테이블은 건드리지 않음.

## 안 하는 것

- Engagement 데이터 삭제/덮어쓰기
- 시트 동기화 로직 변경
- 새로운 섭외 대체 UI
