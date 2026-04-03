# 대시보드 분리 설계 — 일반 + 삼전

## 배경

삼전 DS/DX 코치는 특정 기간 동안 일반 대시보드에서 가용 일정을 노출하지 않아야 한다. 삼전 담당 매니저는 별도 대시보드에서 삼전 코치 전체 일정을 확인한다.

## 라우팅

| 경로 | 용도 | 보이는 코치 |
|------|------|-----------|
| `/dashboard` | 일반 대시보드 | 전체 - 삼전 DS/DX (숨김 기간 내) |
| `/dashboard/samsung` | 삼전 대시보드 | 삼전 DS + DX만 |

## 숨김 규칙 (일반 대시보드)

- **삼전 DS**: `SAMSUNG_DS_HIDE_FROM` ~ `SAMSUNG_HIDE_UNTIL` 범위 월에서 제외
- **삼전 DX**: `SAMSUNG_DX_HIDE_FROM` ~ `SAMSUNG_HIDE_UNTIL` 범위 월에서 제외
- 환경변수로 관리, Railway에서 변경 시 재배포 없이 반영

```
SAMSUNG_DS_HIDE_FROM=2026-05
SAMSUNG_DX_HIDE_FROM=2026-04
SAMSUNG_HIDE_UNTIL=2026-12
```

초기값: DS 5월~12월, DX 4월~12월 (2026년).

## API 변경

### `/api/schedules/[yearMonth]` (월간 요약)
- `?coachFilter=exclude-samsung` — 삼전 코치 제외 (일반 대시보드)
- `?coachFilter=samsung-only` — 삼전 코치만 (삼전 대시보드)
- 파라미터 없으면 기존 동작 (전체)

### `/api/schedules/[yearMonth]/[date]` (일별 상세)
- 동일한 `coachFilter` 파라미터

### 필터링 로직 (서버)
1. `coachFilter=exclude-samsung`: 조회 월이 DS/DX 숨김 범위이면 해당 workType 코치 WHERE 조건에서 제외
2. `coachFilter=samsung-only`: `workType LIKE '%삼전 DS%' OR workType LIKE '%삼전 DX%'`인 코치만

## 프론트엔드

### 컴포넌트 재사용
- `DashboardCalendar`, `DashboardCoachList` 그대로 사용
- 대시보드 page에서 `variant: "general" | "samsung"` prop으로 API 호출 시 coachFilter 결정

### 페이지 구조
```
src/app/(manager)/dashboard/
├── page.tsx                    # 일반 대시보드 (variant="general")
├── samsung/
│   └── page.tsx                # 삼전 대시보드 (variant="samsung")
└── _components/
    └── DashboardContent.tsx    # 공통 로직 추출
```

### 네비게이션
- 헤더 또는 대시보드 내에서 일반/삼전 전환 링크

## 접근 권한

삼전 대시보드는 삼전 담당 매니저 + admin만 접근 가능.

- 기존 `ManagerRole` enum에 `samsung_admin`이 이미 존재 → DB 변경 불필요
- 접근 조건: `role === 'admin' || role === 'samsung_admin'`
- 헤더: 조건 충족 시에만 "삼전" 네비게이션 노출
- API: `coachFilter=samsung-only` 요청 시 role 체크
- 관리자 페이지: 매니저 role을 `samsung_admin`으로 설정하여 관리

## 삼전 대시보드 특이사항

- 날짜 제한 없음 (모든 월의 일정 표시)
- 삼전 DS + DX 코치만 표시
- 나머지 UI/필터/기능은 일반 대시보드와 동일
