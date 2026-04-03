# 마이페이지 + 섭외 상태관리 설계

## 배경

매니저가 대시보드에서 코치에게 섭외를 걸고, 직접 연락(전화/카톡) 후 결과를 시스템에 반영해야 함. 현재 Scouting은 생성/삭제 토글만 지원하여 상태 추적 불가.

## 데이터 모델 변경

### ScoutingStatus enum 추가

```
scouting   — 섭외중 (기본)
confirmed  — 확정 (코치 수락)
cancelled  — 취소 (코치 거절 또는 매니저 취소)
```

### Scouting 모델 변경

- `status ScoutingStatus @default(scouting)` 필드 추가
- 기존 삭제 방식 → status 변경 방식으로 전환
- 기존 unique constraint `[coachId, date, managerId]` 유지

## 마이페이지 (`/mypage`)

### 목적
현재 매니저의 섭외 현황을 한눈에 확인하고 상태를 관리하는 페이지.

### UI 구성
- 필터: 섭외중+확정 기본 표시, 취소 토글
- 테이블: 코치명, 날짜, 상태, 액션 버튼
- 섭외중 → [확정] [취소] 버튼
- 확정/취소 → 상태 라벨만 표시 (변경 불가)
- 날짜 내림차순 정렬

### 접근
- 헤더에 마이페이지 링크 추가
- 로그인한 매니저 본인의 섭외만 표시

## API 변경

### GET /api/scoutings
- `managerId` 파라미터 추가 (마이페이지용)
- `status` 파라미터 추가 (필터링)
- 응답에 `status` 필드 포함

### PATCH /api/scoutings/:id
- 상태 변경 전용 엔드포인트 (신규)
- body: `{ status: "confirmed" | "cancelled" }`
- 본인 섭외만 변경 가능

### POST /api/scoutings (기존 토글)
- 생성: status=scouting으로 생성
- 삭제: delete → status=cancelled로 변경
- 이미 cancelled인 것을 다시 토글 → status=scouting으로 복원

## 기존 기능 영향

- 대시보드 섭외 표시: `status = scouting` 또는 `confirmed`인 것만 표시
- 코치 상세 ScheduleTab: 동일하게 scouting/confirmed만 표시
- cancelled는 대시보드/코치상세에서 숨김 (마이페이지에서만 조회)
