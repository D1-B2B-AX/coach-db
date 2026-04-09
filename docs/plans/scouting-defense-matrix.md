# Scouting Defense Matrix -- 96-Cell State Transition Matrix

> 섭외(Scouting) 상태 전이의 완전한 방어 매트릭스.
> 모든 (Course 상태 x Scouting 상태) 조합에 대해 8개 액션의 동작을 정의한다.
>
> **최종 검증:** 2026-04-09 — 모든 방어 로직 구현 완료 확인 (FIXED → OK)

## 차원 정의

### 행 (12): Course 상태 x Scouting 상태

| # | Course 상태 | Scouting 상태 | 설명 |
|---|------------|--------------|------|
| 1 | active | none | 섭외 레코드 없음 (아직 찜꽁 안 함) |
| 2 | active | scouting | 섭외 요청 중 (코치 응답 대기) |
| 3 | active | accepted | 코치 수락 (매니저 확정 대기) |
| 4 | active | rejected | 코치 거절 (최종 상태) |
| 5 | active | confirmed | 투입 확정 (Engagement 생성됨) |
| 6 | active | cancelled | 섭외 취소 (복원 가능) |
| 7 | deleted | none | 삭제된 과정, 섭외 없음 |
| 8 | deleted | scouting | 삭제된 과정, 섭외 중 (삭제 시 cancelled로 전이됨 -- 이론적 잔존) |
| 9 | deleted | accepted | 삭제된 과정, 수락 상태 (삭제 시 cancelled로 전이됨 -- 이론적 잔존) |
| 10 | deleted | rejected | 삭제된 과정, 거절 상태 |
| 11 | deleted | confirmed | 삭제된 과정, 확정 상태 (삭제 시 cancelled로 전이됨 -- 이론적 잔존) |
| 12 | deleted | cancelled | 삭제된 과정, 취소 상태 |

### 열 (8 Actions)

| # | 액션 | Actor | API Endpoint | 설명 |
|---|------|-------|-------------|------|
| A | Course PATCH | manager | `PATCH /api/courses/[id]` | 과정 정보 수정 (이름, 일정 등) |
| B | Course DELETE | manager | `DELETE /api/courses/[id]` | 과정 soft-delete |
| C | accept | coach | `PATCH /api/coach/scoutings/[id]` | 코치 수락 |
| D | reject | coach | `PATCH /api/coach/scoutings/[id]` | 코치 거절 |
| E | confirm | manager | `PATCH /api/scoutings/[id]` | 투입 확정 |
| F | cancel | manager | `PATCH /api/scoutings/[id]` | 섭외 취소 |
| G | modify/re-notify | manager | `PATCH /api/scoutings/[id]` | 섭외 내용 수정 + 코치 재알림 |
| H | restore | manager | `POST /api/scoutings` | 취소된 섭외 복원 (cancelled -> scouting) |

### 셀 필드 범례

각 셀은 5개 필드로 구성:

1. **Target** -- 전이 후 scouting 상태 (또는 N/A, blocked 409)
2. **Side Effects** -- Engagement/EngagementSchedule 생성/취소 등
3. **Notification** -- 알림 타입 + 수신자 (또는 none)
4. **UI** -- 버튼 표시/숨김/비활성화 상태
5. **Impl** -- 구현 상태 (OK / FIXED)

---

## Part 1: Course Active (행 1-6)

### Row 1: active + none (섭외 레코드 없음)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| **Side Effects** | 과정 메타 업데이트 | 과정 soft-delete | -- | -- | -- | -- | -- | -- |
| **Notification** | none | none | none | none | none | none | none | none |
| **UI** | 과정 편집 폼 표시 | 과정 삭제 버튼 표시 | 버튼 없음 (섭외 없음) | 버튼 없음 | 버튼 없음 | 버튼 없음 | 버튼 없음 | 버튼 없음 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

> 섭외 레코드가 없으므로 C-H 액션은 대상 자체가 없음. A/B는 과정 자체 CRUD로 동작.

---

### Row 2: active + scouting (섭외 요청 중)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | scouting (유지, 재알림) | cancelled | accepted | rejected | blocked (409) | cancelled | scouting (유지, 재알림) | N/A (이미 scouting) |
| **Side Effects** | none | 기존 T1 알림 만료 | none | none | -- | 기존 T1 알림 만료 | 기존 T1 알림 만료 | -- |
| **Notification** | `scouting_request_modified` -> coach | `engagement_cancelled` -> coach (accepted/confirmed만 해당, scouting은 알림 없이 만료) | `coach_accepted` -> manager | `coach_rejected` -> manager | 409 에러 응답 ("코치 수락이 필요합니다") | none (만료만) | `scouting_request_modified` -> coach | -- |
| **UI** | 과정 편집 폼 표시 | 과정 삭제 버튼 표시 | 수락 버튼 활성 | 거절 버튼 활성 | 확정 버튼 비활성 (tooltip: "코치 수락 필요") | 취소 버튼 표시 | 수정 폼 표시 | 버튼 없음 (scouting 상태) |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

**핵심 인용:**
- Course PATCH -> scouting 리셋: `src/app/api/courses/[id]/route.ts:73-111` -- `activeScoutings` 조회 후 `updateMany` to `'scouting'`, 수정 알림 발송
- accept: `src/app/api/coach/scoutings/[id]/route.ts:56-63` -- `canTransition(scouting, accepted, coach)` 검증 후 update
- confirm 차단: `src/app/api/scoutings/[id]/route.ts:42-47` -- `canTransition` false 시 "코치 수락이 필요합니다" 409

---

### Row 3: active + accepted (코치 수락)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | scouting (리셋) | cancelled | blocked (409) | blocked (409) | confirmed | cancelled | blocked (409) | N/A (cancelled 아님) |
| **Side Effects** | none | 기존 알림 만료 | -- | -- | Engagement 생성 + EngagementSchedule 생성 | 기존 알림 만료 | -- | -- |
| **Notification** | `scouting_request_modified` -> coach (리셋 후 재알림) | `engagement_cancelled` -> coach | 409 에러 ("이미 처리된 섭외입니다") | 409 에러 ("이미 처리된 섭외입니다") | `engagement_confirmed` -> coach | `engagement_cancelled` -> coach | 409 에러 (canTransition false) | -- |
| **UI** | 과정 편집 폼 표시 | 과정 삭제 버튼 표시 | 수락 버튼 숨김 (이미 수락) | 거절 버튼 숨김 (이미 수락) | 확정 버튼 활성 | 취소 버튼 표시 | 수정 불가 (수락 후) | 버튼 없음 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

**핵심 인용:**
- Course PATCH -> scouting 리셋: `src/app/api/courses/[id]/route.ts:73-79` -- `status: { in: ['accepted', 'confirmed'] }` 필터 후 리셋
- Course DELETE -> cancelled: `src/app/api/courses/[id]/route.ts:136-142` -- `status: { in: ['scouting', 'accepted', 'confirmed'] }` 필터 후 cancelled
- confirm: `src/app/api/scoutings/[id]/route.ts:104-151` -- Engagement findFirst/create + EngagementSchedule 중복 체크 후 create
- cancel: `src/lib/scouting-state-machine.ts:69-74` -- `accepted->cancelled` 트리거에 `engagement_cancelled` 알림 구현 완료

---

### Row 4: active + rejected (코치 거절 -- 최종 상태)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | N/A (rejected는 리셋 대상 아님) | N/A (rejected는 cascade 대상 아님) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | blocked (409) |
| **Side Effects** | 과정 메타만 업데이트 | 과정 soft-delete (rejected 섭외는 건드리지 않음) | -- | -- | -- | -- | -- | -- |
| **Notification** | none | none | 409 에러 | 409 에러 | 409 에러 | 409 에러 | 409 에러 | 409 에러 |
| **UI** | 과정 편집 폼 표시 | 과정 삭제 버튼 표시 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

> rejected는 최종 상태. `scouting-state-machine.ts:18` -- "rejected는 최종 상태 -- 같은 날짜 재섭외 불가, 새 날짜로 별도 생성"
> Course PATCH의 `activeScoutings` 쿼리는 `{ in: ['accepted', 'confirmed'] }`이므로 rejected 제외. Course DELETE도 `{ in: ['scouting', 'accepted', 'confirmed'] }`이므로 rejected 제외.

---

### Row 5: active + confirmed (투입 확정)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | scouting (리셋) | cancelled | blocked (409) | blocked (409) | confirmed (수정 재확정) | cancelled | blocked (409) | N/A (cancelled 아님) |
| **Side Effects** | EngagementSchedule soft-cancel (3-tuple) + Engagement 상태 확인 | EngagementSchedule soft-cancel (3-tuple) + Engagement 상태 확인 + 기존 알림 만료 | -- | -- | Engagement/EngagementSchedule upsert (기존 있으면 재사용) | EngagementSchedule soft-cancel (3-tuple) + Engagement 상태 확인 + 기존 알림 만료 | -- | -- |
| **Notification** | `scouting_request_modified` -> coach (리셋 후 재알림) | `engagement_cancelled` -> coach | 409 에러 ("이미 처리된 섭외입니다") | 409 에러 ("이미 처리된 섭외입니다") | `engagement_confirmed` -> coach | `engagement_cancelled` -> coach | 409 에러 (canTransition false) | -- |
| **UI** | 과정 편집 폼 표시 | 과정 삭제 버튼 표시 | 버튼 숨김 | 버튼 숨김 | 재확정 버튼 활성 | 취소 버튼 표시 | 버튼 숨김 (confirmed 상태) | 버튼 없음 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

**핵심 인용:**
- Course PATCH -> EngagementSchedule cascade: `src/app/api/courses/[id]/route.ts:82-84` -- confirmed 필터 후 `cancelEngagementScheduleForScouting` 호출
- Course DELETE -> cascade: `src/app/api/courses/[id]/route.ts:145-147` -- confirmed 필터 후 `cancelEngagementScheduleForScouting` 호출
- confirm (재확정): `src/lib/scouting-state-machine.ts:19` -- `{ from: 'confirmed', to: 'confirmed', actor: 'manager' }`
- cancel -> cascade: `src/app/api/scoutings/[id]/route.ts:64-68` -- `scouting.status === 'confirmed'` 조건부 `cancelEngagementScheduleForScouting`
- EngagementSchedule 3-tuple: `src/lib/engagement-cascade.ts:28-36` -- `(engagementId, coachId, date)` 기준 soft-cancel

---

### Row 6: active + cancelled (섭외 취소)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | N/A (cancelled는 리셋 대상 아님) | N/A (cancelled는 cascade 대상 아님) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | scouting (복원) |
| **Side Effects** | 과정 메타만 업데이트 | 과정 soft-delete (cancelled 섭외는 건드리지 않음) | -- | -- | -- | -- | -- | 메타데이터 갱신 가능 (courseId, note 등) |
| **Notification** | none | none | 409 에러 | 409 에러 | 409 에러 | 409 에러 | 409 에러 | `scouting_request` -> coach (T1 알림) |
| **UI** | 과정 편집 폼 표시 | 과정 삭제 버튼 표시 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 복원(재섭외) 버튼 표시 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

**핵심 인용:**
- restore (cancelled -> scouting): `src/lib/scouting-state-machine.ts:21` -- `{ from: 'cancelled', to: 'scouting', actor: 'manager' }`
- restore 구현: `src/app/api/scoutings/route.ts:119-161` -- `existing.status === 'cancelled'` 시 scouting으로 업데이트 + T1 알림 발송
- Course PATCH 쿼리: `src/app/api/courses/[id]/route.ts:74` -- `{ in: ['accepted', 'confirmed'] }` -- cancelled 제외
- Course DELETE 쿼리: `src/app/api/courses/[id]/route.ts:137` -- `{ in: ['scouting', 'accepted', 'confirmed'] }` -- cancelled 제외

---

## Part 2: Course Deleted (행 7-12)

> Course가 soft-delete된 상태 (`deletedAt != null`).
> Course PATCH는 `deletedAt` 체크로 404 반환. Course DELETE는 이미 삭제되어 404.
> 코치 accept/reject, 매니저 confirm은 `course.deletedAt` guard로 409 반환.

### Row 7: deleted + none (삭제된 과정, 섭외 없음)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | blocked (404) | blocked (404) | N/A | N/A | N/A | N/A | N/A | N/A |
| **Side Effects** | -- | -- | -- | -- | -- | -- | -- | -- |
| **Notification** | none | none | none | none | none | none | none | none |
| **UI** | 편집 버튼 숨김 (삭제된 과정) | 삭제 버튼 숨김 (이미 삭제) | 버튼 없음 | 버튼 없음 | 버튼 없음 | 버튼 없음 | 버튼 없음 | 버튼 없음 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

> `src/app/api/courses/[id]/route.ts:18` -- `!course || course.deletedAt` -> 404
> `src/app/api/courses/[id]/route.ts:130` -- `!course || course.deletedAt` -> 404

---

### Row 8: deleted + scouting (삭제된 과정 + 섭외 중)

> 정상 시나리오에서는 발생하지 않음 (Course DELETE 시 scouting -> cancelled로 cascade).
> 레이스 컨디션 또는 데이터 보정으로 잔존 가능.

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | blocked (404) | blocked (404) | blocked (409) | blocked (409) | blocked (409) | cancelled | scouting (유지) | N/A (이미 scouting) |
| **Side Effects** | -- | -- | -- | -- | -- | 기존 T1 알림 만료 | 기존 T1 만료 + 새 알림 | -- |
| **Notification** | none | none | 409 ("과정이 삭제되어 처리할 수 없습니다") | 409 ("과정이 삭제되어 처리할 수 없습니다") | 409 ("과정이 삭제되어 확정할 수 없습니다") | none | `scouting_request_modified` -> coach | -- |
| **UI** | 편집 버튼 숨김 | 삭제 버튼 숨김 | 수락 버튼 비활성 (삭제된 과정 표시) | 거절 버튼 비활성 (삭제된 과정 표시) | 확정 버튼 비활성 | 취소 버튼 표시 | 수정 가능 (취소 유도) | 버튼 없음 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

**핵심 인용:**
- coach accept 409 guard: `src/app/api/coach/scoutings/[id]/route.ts:49-54` -- `scouting.course?.deletedAt` 체크
- manager confirm 409 guard: `src/app/api/scoutings/[id]/route.ts:34-39` -- `scouting.course?.deletedAt` 체크

---

### Row 9: deleted + accepted (삭제된 과정 + 수락 상태)

> 정상 시나리오에서는 발생하지 않음 (Course DELETE 시 accepted -> cancelled로 cascade).

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | blocked (404) | blocked (404) | blocked (409) | blocked (409) | blocked (409) | cancelled | blocked (409) | N/A (cancelled 아님) |
| **Side Effects** | -- | -- | -- | -- | -- | 기존 알림 만료 | -- | -- |
| **Notification** | none | none | 409 에러 | 409 에러 | 409 ("과정이 삭제되어 확정할 수 없습니다") | `engagement_cancelled` -> coach | 409 에러 | -- |
| **UI** | 편집 버튼 숨김 | 삭제 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 확정 버튼 비활성 (삭제된 과정) | 취소 버튼 표시 | 버튼 숨김 | 버튼 없음 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

---

### Row 10: deleted + rejected (삭제된 과정 + 거절)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | blocked (404) | blocked (404) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | blocked (409) |
| **Side Effects** | -- | -- | -- | -- | -- | -- | -- | -- |
| **Notification** | none | none | 409 에러 | 409 에러 | 409 에러 | 409 에러 | 409 에러 | 409 에러 |
| **UI** | 편집 버튼 숨김 | 삭제 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

> rejected + deleted: 모든 섭외 액션 차단. 과정도 이미 삭제.

---

### Row 11: deleted + confirmed (삭제된 과정 + 확정)

> 정상 시나리오에서는 발생하지 않음 (Course DELETE 시 confirmed -> cancelled + EngagementSchedule cascade).

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | blocked (404) | blocked (404) | blocked (409) | blocked (409) | blocked (409) | cancelled | blocked (409) | N/A (cancelled 아님) |
| **Side Effects** | -- | -- | -- | -- | -- | EngagementSchedule soft-cancel (3-tuple) + 기존 알림 만료 | -- | -- |
| **Notification** | none | none | 409 에러 | 409 에러 | 409 ("과정이 삭제되어 확정할 수 없습니다") | `engagement_cancelled` -> coach | 409 에러 | -- |
| **UI** | 편집 버튼 숨김 | 삭제 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 취소 버튼 표시 | 버튼 숨김 | 버튼 없음 |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

---

### Row 12: deleted + cancelled (삭제된 과정 + 취소)

| | A. Course PATCH | B. Course DELETE | C. accept | D. reject | E. confirm | F. cancel | G. modify | H. restore |
|---|---|---|---|---|---|---|---|---|
| **Target** | blocked (404) | blocked (404) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | blocked (409) | blocked (409) |
| **Side Effects** | -- | -- | -- | -- | -- | -- | -- | -- |
| **Notification** | none | none | 409 에러 | 409 에러 | 409 에러 | 409 에러 | 409 에러 | 409 에러 |
| **UI** | 편집 버튼 숨김 | 삭제 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 | 버튼 숨김 (삭제된 과정 복원 불가) |
| **Impl** | OK | OK | OK | OK | OK | OK | OK | OK |

> deleted + cancelled: 과정 삭제 + 섭외 취소 조합. 복원도 차단 (삭제된 과정에 재섭외 의미 없음).

---

## 구현 완료 셀 요약 (2026-04-09 검증)

아래 6건은 plan-v2에서 MISSING/WRONG으로 식별되었으며, **모두 구현 완료**되었다.

| # | 셀 좌표 | 문제 | 해결 | 구현 위치 |
|---|---------|------|------|----------|
| 1 | (active, accepted) x cancel | 코치 취소 알림 미발송 | TRIGGER_MAP에 `engagement_cancelled` 추가 | `scouting-state-machine.ts:69-74` |
| 2 | (active, confirmed) x Course PATCH | ES cascade 누락 | `cancelEngagementScheduleForScouting` 호출 추가 | `courses/[id]/route.ts:84-87` |
| 3 | (active, confirmed) x Course DELETE | ES cascade 누락 | `cancelEngagementScheduleForScouting` 호출 추가 | `courses/[id]/route.ts:148-149` |
| 4 | (active, confirmed) x cancel | ES cascade 누락 | confirmed 조건부 `cancelEngagementScheduleForScouting` | `scoutings/[id]/route.ts:68-70` |
| 5 | (deleted, accepted) x cancel | 취소 알림 미발송 | #1과 동일 TRIGGER_MAP으로 해결 | `scouting-state-machine.ts:69-74` |
| 6 | (deleted, confirmed) x cancel | ES cascade 필요 | #4와 동일 로직으로 커버 (course null 허용) | `engagement-cascade.ts:10` |

---

## Happy-Path Regression Markers

다음 3개 플로우는 현재 정상 동작하며 이번 스프린트에서 **변경 없음**:

### 1. scouting -> accepted -> confirmed (정상 확정 플로우)

```
[코치] accept -> scouting->accepted
  인용: scouting-state-machine.ts:12, coach/scoutings/[id]/route.ts:56-69
  알림: coach_accepted -> manager
[매니저] confirm -> accepted->confirmed
  인용: scouting-state-machine.ts:16, scoutings/[id]/route.ts:104-151
  알림: engagement_confirmed -> coach
  부수효과: Engagement 생성 + EngagementSchedule 생성
```

**변경 없음** -- 기존 구현 정상 동작 확인.

### 2. cancelled -> scouting (복구)

```
[매니저] restore (POST toggle) -> cancelled->scouting
  인용: scouting-state-machine.ts:21, scoutings/route.ts:119-161
  알림: scouting_request -> coach (T1)
  부수효과: 메타데이터 갱신 가능
```

**변경 없음** -- POST toggle 복원 로직 정상 동작 확인.

### 3. confirmed -> confirmed (수정 재확정)

```
[매니저] confirm (수정) -> confirmed->confirmed
  인용: scouting-state-machine.ts:19, scoutings/[id]/route.ts:104-151
  알림: engagement_confirmed -> coach
  부수효과: Engagement upsert + EngagementSchedule upsert (중복 체크)
```

**변경 없음** -- 재확정 시 기존 Engagement 재사용 + 스케줄 중복 방지 정상 동작 확인.

---

## State Machine 전이 요약 (Quick Reference)

```
scouting  --[coach accept]-->   accepted
scouting  --[coach reject]-->   rejected    (최종)
scouting  --[mgr modify]-->     scouting    (재알림)
scouting  --[mgr cancel]-->     cancelled

accepted  --[mgr confirm]-->    confirmed   (+Engagement)
accepted  --[mgr cancel]-->     cancelled

confirmed --[mgr confirm]-->    confirmed   (수정 재확정)
confirmed --[mgr cancel]-->     cancelled   (+EngagementSchedule cascade)

cancelled --[mgr restore]-->    scouting    (복원)

rejected  -->  (전이 없음, 최종 상태)
```

인용: `src/lib/scouting-state-machine.ts:11-22` -- `VALID_TRANSITIONS` 배열

---

## 확장 가이드: 새로운 코치 액션 추가 방법

새로운 코치 액션(예: "보류(pending)", "위임(delegate)")을 추가할 때 다음 순서로 작업한다:

### Step 1: 매트릭스 확장

이 문서에 새 열(column) 추가. 12행 x 1열 = 12셀을 전부 정의해야 한다.
각 셀에 5필드(Target, Side Effects, Notification, UI, Impl) 빠짐없이 기술.

### Step 2: State Machine 등록

`src/lib/scouting-state-machine.ts`의 `VALID_TRANSITIONS` 배열에 새 전이 규칙 추가:

```typescript
// 예: 보류 액션
{ from: 'scouting', to: 'pending', actor: 'coach' },
```

### Step 3: 알림 트리거 등록

같은 파일의 `TRIGGER_MAP`에 해당 전이의 알림 규칙 추가 (알림이 불필요하면 `null`):

```typescript
'scouting->pending': {
  type: 'coach_pending',
  recipientRole: 'manager',
  messageTemplate: '{coachName}님이 {date} 섭외를 보류했습니다',
  clickUrlPattern: '/coaches/{coachId}',
},
```

### Step 4: API Route 구현

- 코치 액션: `src/app/api/coach/scoutings/[id]/route.ts`의 `action` 검증 및 분기 추가
- 매니저 액션: `src/app/api/scoutings/[id]/route.ts`의 `status` 처리 분기 추가
- 부수효과(Engagement/EngagementSchedule)가 있다면 해당 로직 구현

### Step 5: Course cascade 검토

- `src/app/api/courses/[id]/route.ts`의 PATCH/DELETE에서 새 상태를 cascade 대상에 포함할지 결정
- PATCH `activeScoutings` 쿼리: `status: { in: [...] }` 배열 확장 여부
- DELETE `activeScoutings` 쿼리: `status: { in: [...] }` 배열 확장 여부

### Step 6: UI 반영

- 코치 페이지: 새 버튼/상태 표시 추가
- 매니저 페이지: 새 상태 배지 + 가능한 액션 버튼 추가

### Step 7: 테스트

- `canTransition()` 양성/음성 케이스 추가
- `getNotificationTrigger()` 반환값 검증
- API route integration test (정상 전이 + 잘못된 전이 409)

### Step 8: 매트릭스 갱신

이 문서의 모든 행에 새 열 반영 완료 후 Impl 상태를 OK로 표기.

---

## 횡단 시나리오 (12개)

> 각 시나리오: 2명 이상 액터, 3단계 이상, 매트릭스 체크포인트 2개 이상 횡단.

### S-01. 정상 섭외 → 확정 → 과정 삭제

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 과정 생성 + 코치 섭외 | scouting, T1 코치에게 |
| 2 | 코치 | 수락 | → accepted, T2 매니저에게 |
| 3 | 매니저 | 확정 | → confirmed, Engagement+ES 생성, T4 코치에게 |
| 4 | 매니저 | 과정 삭제 | → cancelled, ES soft-cancel, T5 코치에게 |

**체크포인트:** Row3-E(confirm) + Row5-B(DELETE cascade)

### S-02. 섭외 수정 → 코치 재수락 → 확정

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 코치 섭외 | scouting, T1 |
| 2 | 매니저 | 수정 알림 보내기 | scouting 유지, T1 만료, T1m 발송 |
| 3 | 코치 | 수락 | → accepted, T2 |
| 4 | 매니저 | 확정 | → confirmed, Engagement+ES 생성 |

**체크포인트:** Row2-G(modify) + Row2-C(accept) + Row3-E(confirm)

### S-03. 확정 후 과정 수정 → 리셋 → 재수락 → 재확정

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 섭외 → 코치 수락 → 확정 | confirmed, ES 생성 |
| 2 | 매니저 | 과정 수정 (PATCH) | → scouting 리셋, ES soft-cancel, T1m |
| 3 | 코치 | 재수락 | → accepted |
| 4 | 매니저 | 재확정 | → confirmed, 새 ES 생성 |

**체크포인트:** Row5-A(PATCH reset + ES cascade) + Row3-E(confirm)

### S-04. 코치 수락 직후 매니저 취소 (경쟁 조건)

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 코치 섭외 | scouting |
| 2 | 코치 | 수락 | → accepted |
| 3 | 매니저 | 취소 | → cancelled, T5 코치에게 |
| 4 | 코치 | ScoutingAlerts 새로고침 | 해당 알림 사라짐 |

**체크포인트:** Row3-F(cancel + T5) + 알림 정합성

### S-05. 과정 삭제 직후 코치 수락 시도 (경쟁 조건)

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 섭외 | scouting |
| 2 | 매니저 | 과정 삭제 | → cancelled (cascade) |
| 3 | 코치 | stale 알림으로 수락 시도 | 409 "과정이 삭제되어 처리할 수 없습니다" |
| 4 | 코치 | ScoutingAlerts 새로고침 | 알림 사라짐 (expired 필터) |

**체크포인트:** Row2-B(DELETE cascade) + Row8-C(accept 409 guard)

### S-06. 취소 → 복구 → 재수락 → 확정

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 섭외 → 취소 | → cancelled |
| 2 | 매니저 | 복구 | → scouting, 새 T1 발송 |
| 3 | 코치 | 수락 | → accepted, T2 |
| 4 | 매니저 | 확정 | → confirmed, Engagement+ES 생성 |

**체크포인트:** Row6-H(restore) + Row2-C(accept) + Row3-E(confirm)

### S-07. 확정 수정 재확정 (confirmed → confirmed)

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 섭외 → 수락 → 확정 | confirmed |
| 2 | 매니저 | ConfirmModal에서 시간/스케줄 수정 | → confirmed 유지, T4 재발송 |
| 3 | 코치 | 새 T4 확인 | 수정된 내용 표시 |

**체크포인트:** Row5-E(confirm 수정) + 알림 재발송

### S-08. 다수 코치 벌크 취소

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 과정에 코치 A,B,C 섭외 | 3x scouting |
| 2 | 코치 A,B | 각각 수락 | 2x accepted, 1x scouting |
| 3 | 매니저 | "모두 취소" 벌크 | 3x → cancelled, T5 (accepted 2건만) |

**체크포인트:** Row2-F(scouting cancel) + Row3-F(accepted cancel + T5)

### S-09. 코치 거절 후 같은 과정 다른 날짜 섭외

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 코치 A를 4/10에 섭외 | scouting |
| 2 | 코치 A | 거절 | → rejected (최종) |
| 3 | 매니저 | 같은 코치를 4/15에 새로 섭외 | 새 scouting (별도 레코드) |
| 4 | 코치 A | 수락 | → accepted |

**체크포인트:** Row4(rejected 최종) + Row2-C(새 날짜 accept 독립)

### S-10. 확정 후 매니저 직접 취소 → ES 정리

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 섭외 → 수락 → 확정 | Engagement+ES 생성 |
| 2 | 매니저 | 취소 | → cancelled, ES.cancelledAt 설정 |
| 3 | (검증) | ES 조회 | cancelledAt != null. 활성 ES 0건이면 Engagement도 cancelled |

**체크포인트:** Row5-F(cancel + ES soft-cancel) + Engagement cascade

### S-11. 과정 수정으로 다수 확정 리셋

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 과정에 코치 A,B 확정 | 2x confirmed, 2x ES |
| 2 | 매니저 | 과정 수정 (PATCH) | 2x → scouting, 2x ES soft-cancel, 2x T1m |
| 3 | 코치 A | 재수락 | → accepted |
| 4 | 코치 B | 거절 | → rejected |

**체크포인트:** Row5-A(PATCH reset + ES cascade) + 개별 코치 응답 독립

### S-12. 과정 삭제 시 확정+수락+섭외 혼재

| 단계 | 액터 | 액션 | 기대 결과 |
|------|------|------|-----------|
| 1 | 매니저 | 과정에 코치 3명: A(confirmed), B(accepted), C(scouting) | 혼재 상태 |
| 2 | 매니저 | 과정 삭제 | 3x → cancelled |
| 3 | (검증) | A: ES soft-cancel + T5. B: T5. C: 알림 만료만 (T5 없음) | 상태별 차등 처리 |

**체크포인트:** Row5-B + Row3-B + Row2-B — 상태별 cascade 차등
