# 구현 후 검수

## 2026-04-04

### 코치뷰 — 일정 상세 표시 + 알림 개선

**구현 완료**
- 캘린더 확정 날짜 클릭 → 과정명/시간 표시 (파란색 카드)
- 캘린더 스카우팅 날짜 클릭 → 과정명/매니저/시간 표시 (노란색 카드, 클릭 시 받은 요청으로 스크롤)
- 확정/스카우팅 상세 표시 시 시간 버튼(오전/오후/저녁/전일) 숨김
- 스카우팅 API에 courseName/hireStart/hireEnd 추가, status=scouting 필터
- 수락 시 확인 다이얼로그 추가, 수락/거절 후 캘린더 즉시 갱신
- 알림 셀에서 이메일 제거 (팝업에서만 표시), 팝업 UI 간소화
- "나의 일정" 섹션 플랫 리스트로 간소화, 통계 제거

**확인 필요**
- [ ] 확정 날짜 클릭 → 과정명+시간 카드 표시
- [ ] 스카우팅 날짜 클릭 → 노란 카드 → 클릭 시 받은 요청으로 스크롤
- [ ] 수락 클릭 → "수락하시겠습니까?" 확인 후 처리 + 캘린더 갱신
- [ ] 코치뷰 알림 팝업에서 과정설명/기타 분리 표시

---

### 마이페이지 전면 재설계

**구현 완료**
- 1,074줄 모놀리식 → 6파일 분리 (page/CourseTab/ScoutingTab/ConfirmModal/EditCourseModal/utils)
- 헤더에서 찜꽁스테이지/과정관리 직접 메뉴 (URL 파라미터 ?tab=scoutings/courses)
- 과정관리: 카드 클릭 → 인라인 펼침 수정, 날짜별 스케줄 빌더 (날짜칩 토글 + 일괄입력 + 프리셋)
- 찜꽁스테이지: 코치 칩 클릭 → 팝오버 액션 (확정/수정/취소/복구/프로필)
- 확정 모달: courseId 있으면 자동채움, 시간 파싱 실패 시 확정 차단
- 모두 확정/취소 시 코치 이름 표시

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/(manager)/mypage/page.tsx` | 리라이트 — 탭 네비 + 공유 상태 |
| `src/app/(manager)/mypage/CourseTab.tsx` | 신규 — 인라인 과정 생성 + 카드 펼침 수정 |
| `src/app/(manager)/mypage/ScoutingTab.tsx` | 신규 — 칩 팝오버 + 아코디언 |
| `src/app/(manager)/mypage/ConfirmModal.tsx` | 신규 — 확정 모달 (시간 검증 포함) |
| `src/app/(manager)/mypage/EditCourseModal.tsx` | 신규 — 스케줄 빌더 포함 |
| `src/app/(manager)/mypage/utils.ts` | 신규 — 타입 + 유틸 |
| `src/components/Header.tsx` | 네비 재구성, 관리자 뱃지 제거 |

**확인 필요**
- [ ] 찜꽁→수락→확정→자동취소 전체 플로우
- [ ] 과정 생성 → 찜꽁스테이지에서 해당 과정 아코디언 표시
- [ ] 카드 클릭 → 인라인 수정 펼침 → 저장 → 접힘
- [ ] 스케줄 빌더: 날짜칩 토글 + 일괄입력 + 개별 오버라이드 → workHours 저장

---

### 대시보드 개선

**구현 완료**
- 시간 필터 다중 범위 개별 전달 (08-13,18-22 → 합치지 않고 AND 로직)
- 코치 행 2줄 구조: 이름+분야태그+평점 / 근무유형+가능시간+참여과정
- 참여과정 vs 참여예정과정 endDate 기준 자동 구분 (과거 우선)
- workType API 응답에 추가
- 0명 날짜에 `-` 표시
- 분야 등록 코치 우선 정렬, 평점순 2차 정렬
- 대시보드에서 과정 생성 UI 제거 (과정관리 전용)
- 과정 0건 시 과정관리 이동 안내 배너
- 찜꽁 모달: 과정에서 내용 자동채움 + 기타 필드 + 컨택 시간 제거 (workHours에서 자동 추출)
- 초기화 버튼: 날짜+코치+시간필터 모두 리셋
- 새로고침 버튼 제거 (30초 폴링 충분)

**DB 변경**
- `courses.work_hours`: VarChar(100) → Text (프로덕션 적용 완료)

**확인 필요**
- [ ] 오전+오후 선택 → 둘 다 가능한 코치만 표시 (캘린더 숫자와 리스트 일치)
- [ ] 오전만 선택 → 오전 가능 코치 표시
- [ ] workHours 없는 과정으로 찜꽁 시 코치에게 시간 표시 확인
- [ ] 초기화 클릭 → 날짜/코치/필터 모두 리셋
- [ ] 과정 0건 → 안내 배너 표시 → 과정관리로 이동

---

### 과정관리 — 과거 투입 이력 + 코치 평가

**구현 완료**
- `GET /api/engagements/mine` — 로그인 매니저의 `hiredBy` 이름 매칭으로 과거 투입 이력 조회
- `PATCH /api/engagements/[id]/review` — 별점(1~5)/한줄평/재투입 저장, 본인 담당 검증, AuditLog 기록
- `EngagementHistory.tsx` — 과정명별 접기/펼치기 그룹핑, 코치 이름 클릭→상세 이동
- 별점 클릭 + 한줄평 인라인 + 재투입 체크박스, 500ms debounce 자동저장
- `utils.ts`에 `EngagementHistory` 타입, `groupEngagements()`, `ENGAGEMENT_STATUS` 상수 추가
- `page.tsx`에서 `fetchEngagementHistory` → CourseTab 아래 렌더

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/engagements/mine/route.ts` | 신규 — 내 이력 조회 API |
| `src/app/api/engagements/[id]/review/route.ts` | 신규 — 평가 저장 API |
| `src/app/(manager)/mypage/EngagementHistory.tsx` | 신규 — UI 컴포넌트 |
| `src/app/(manager)/mypage/utils.ts` | 타입/유틸/상수 추가 |
| `src/app/(manager)/mypage/page.tsx` | fetch + 렌더 연동 |

**확인 필요**
- [ ] 과정관리 탭 하단에 과거 투입 이력 표시 확인
- [ ] 과정명 클릭 시 펼침/접기 동작
- [ ] 별점 클릭 → 새로고침 후 유지 확인
- [ ] 한줄평 입력 → debounce 저장 확인
- [ ] 재투입 체크 → 저장 확인
- [ ] 다른 매니저 이력에 평가 시도 → 403 반환 확인
- [ ] 코치 이름 클릭 → `/coaches/[id]` 이동

---

### API 접속 로깅

**구현 완료**
- `api_access_logs` 테이블 생성 (path, method, actorType, actorId, actorName, userAgent, ip, statusCode)
- 코치 API 5개 라우트에 `logAccess` 호출 추가 (schedule GET/PUT, me GET/PUT, engagements, notifications, scoutings)
- `viewer=manager` 파라미터로 코치 본인 vs 매니저 접속 구분
- 관리자 페이지 + 코치 등록 페이지에 "들어가기" 버튼 추가

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `prisma/schema.prisma` | ApiAccessLog 모델 추가 |
| `prisma/migrations/20260404_add_api_access_logs/` | 마이그레이션 |
| `src/lib/access-log.ts` | logAccess 유틸 (fire-and-forget) |
| `src/app/api/coach/schedule/[yearMonth]/route.ts` | 로깅 추가 |
| `src/app/api/coach/me/route.ts` | 로깅 추가 |
| `src/app/api/coach/engagements/route.ts` | 로깅 추가 |
| `src/app/api/coach/notifications/route.ts` | 로깅 추가 |
| `src/app/api/coach/scoutings/[id]/route.ts` | 로깅 추가 |
| `src/app/(manager)/admin/page.tsx` | 들어가기 버튼 |
| `src/app/(manager)/coaches/new/page.tsx` | 들어가기 버튼 |

**확인 필요**
- [ ] 코치 토큰 URL 접속 시 api_access_logs에 기록 확인
- [ ] viewer=manager 파라미터로 actor_type 구분 확인
- [ ] userAgent에서 기기 정보(Mac/Windows) 확인 가능한지

---

### 대시보드 시간필터 UX 개선

**구현 완료**
- 과정 선택 시 helper에 과정명 + 시간 범위 표시 (예: "테스트1 (09:00~18:00) — 주간 과정")
- 자동적용 칩 초록색, 수동필터/직접수정 칩 주황색으로 분리
- 초기화 버튼을 프리셋(전체/오전/오후/저녁) 옆으로 이동, 스타일 구분
- helper 텍스트를 프리셋 위에 배치, truncate + tooltip

**확인 필요**
- [ ] 과정 선택 시 helper에 과정명 표시 확인
- [ ] 시간 프리셋 수동 변경 시 주황색 칩 표시

---

### 대시보드 찜꽁 날짜 선택 버그 수정

**구현 완료**
- 모달 열 때 `getSelectedDateRange()`를 `bulkDates`에 캡처 → stale closure 방지
- 과정 선택 시 날짜 우선순위: 기존 선택 > workHours 날짜 > 전체 고용기간
- 찜꽁 모달 닫을 때 전체 값 초기화 (`closeBulkModal`)

**확인 필요**
- [ ] 과정 선택 후 날짜 해제 → 찜꽁 모달에서 해제된 날짜 제외 확인
- [ ] workHours에 날짜가 있는 과정 선택 시 해당 날짜만 선택 확인
- [ ] 모달 닫고 다시 열 때 이전 description/extra 잔류 없음 확인

---

### 찜꽁스테이지 개선

**구현 완료**
- 날짜 행에 `hireStart~hireEnd` 시간 표시 (같은 날짜에 다른 시간이면 모두 표시)
- 과정 삭제 시 연결된 찜꽁(scouting/accepted) `cancelled`로 변경 + 알림 만료
- 과정 soft delete (`deletedAt` 컬럼 추가)
- ConfirmModal 제거 → `confirm("확정하시겠습니까?")` 다이얼로그로 대체
- 과정 그룹 내 모두 확정 / 모두 취소 버튼 추가
- 과정 수정 일괄입력창 기본값/placeholder 비우기
- 매니저 찜꽁 취소 시 `expireScoutingRequestNotifications` 호출

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/(manager)/mypage/ScoutingTab.tsx` | 시간 표시, 모두 확정/취소, ConfirmModal 제거 |
| `src/app/(manager)/mypage/EditCourseModal.tsx` | 일괄입력 기본값 비우기 |
| `src/app/api/courses/[id]/route.ts` | soft delete + 찜꽁 취소 + 알림 만료 |
| `src/app/api/scoutings/[id]/route.ts` | 취소 시 알림 만료 추가 |
| `prisma/schema.prisma` | Course에 deletedAt 추가 |

**확인 필요**
- [ ] 과정 삭제 시 연결된 찜꽁 cancelled 확인
- [ ] 모두 확정 후 상태 갱신 확인
- [ ] 날짜 행 시간 표시 확인

---

### 코치뷰 알림 개선

**구현 완료**
- 과정명 기준 그룹핑 (폰트 14px), 그룹 내 날짜순 정렬
- 그룹별 "전부 수락" / "전부 거절" 버튼
- 전체 `pendingAlerts` 기준 정확한 건수 표시 (더보기 전에도 정확)
- 매니저 취소 시 코치 알림 즉시 만료 (사라짐)

**확인 필요**
- [ ] 여러 과정 알림이 과정별로 그룹핑 표시
- [ ] 전부 수락 → 모든 항목 처리 + 리스트 갱신
- [ ] 매니저 취소 후 코치뷰에서 해당 알림 사라짐

---

### 계약 작성 기능

**구현 완료**
- 확정 시 자동으로 계약 작성 미리보기 모달 표시 (개별/모두 확정 모두)
- 미리보기 테이블: 시트 컬럼 순서 (불필요 컬럼 숨김)
- 고용시작/종료에 course startDate/endDate 사용
- 근로시간에 날짜별 포맷 스케줄 (`2026-04-15(수) 9:00 ~ 18:00 (휴게 1H, 총 8H)`)
- 같은 코치는 1행으로 합침
- "엑셀 다운로드" / "복사하기" 선택 (복사 시 TSV, A열 붙여넣기 안내)
- "계약하러 가기" 버튼 (구글시트 링크)
- 모달 너비 내용에 맞게 조정

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/(manager)/mypage/utils.ts` | buildContractRows, downloadContractExcel, copyContractToClipboard |
| `src/app/(manager)/mypage/ScoutingTab.tsx` | 계약 작성 버튼 + 미리보기 모달 |
| `src/app/(manager)/mypage/page.tsx` | 엑셀 다운로드 import 정리 |

**확인 필요**
- [ ] 확정 후 미리보기 모달 자동 표시
- [ ] 엑셀 다운로드 파일 내용 확인 (17컬럼)
- [ ] 복사 후 구글시트 A열 붙여넣기 정상
- [ ] 같은 코치 여러 날짜 → 1행 합침 확인

---

### 확정 시 engagement 자동 생성

**구현 완료**
- `PATCH /api/scoutings/:id`에서 confirmed 시 engagement + engagementSchedule 자동 생성
- 같은 코치+과정 engagement 중복 체크 → 기존 건에 schedule 추가
- engagementSchedule 날짜별 중복 체크

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/scoutings/[id]/route.ts` | 확정 시 engagement/schedule 생성 로직 |

**확인 필요**
- [ ] 개별 확정 시 engagement 생성 확인
- [ ] 모두 확정 시 같은 과정 engagement 1건 + schedule N건 확인
- [ ] 코치 달력에 확정 일정 즉시 반영
- [ ] 구글시트 동기화 돌려도 중복 미생성

---

### 매일 구글시트 동기화

**구현 완료**
- engagement sync API에 Bearer 토큰 인증 추가 (cron 지원)
- GitHub Actions 매일 07:00 KST 자동 동기화
- 실패 시 GitHub 이메일 알림

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/sync/engagements/route.ts` | Bearer 토큰 인증 추가 |
| `.github/workflows/sync-engagements.yml` | 매일 cron 워크플로우 |

**확인 필요**
- [ ] GitHub Actions secrets에 APP_URL, SYNC_API_SECRET 설정 확인
- [ ] 수동 workflow_dispatch 실행 테스트

---

### 코드 리뷰 지적사항 수정 (5건)

**CRITICAL**
- `closeBulkModal()` 무한 재귀 — `replace_all`로 `setShowScoutModal(false)`를 `closeBulkModal()`로 바꿨을 때 함수 내부도 치환됨. `setShowScoutModal(false)`로 복원.

**HIGH**
- `logAccess` catch 무시 — `.catch(() => {})` → `.catch((e) => console.error('[access-log]', e.message))` 로 변경. 프로덕션에서 로그 유실 감지 가능.
- engagement `findFirst` courseName 기반 매칭 — 동일 과정명 다른 기수 충돌 가능. `courseName + startDate + endDate`로 매칭 조건 강화.
- course soft delete 후 개별 조회 필터 누락 — `PATCH`/`DELETE` 핸들러에서 `deletedAt` 체크 추가. 삭제된 과정 수정/재삭제 방지.
- 코치뷰 전부수락/거절 실패 피드백 — 실패 건수 카운팅 + `alert` 표시. 부분 처리 시 사용자 인지 가능.

**변경 파일**
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/(manager)/dashboard/_components/DashboardContent.tsx` | closeBulkModal 재귀 수정 |
| `src/lib/access-log.ts` | catch 에러 로깅 |
| `src/app/api/scoutings/[id]/route.ts` | engagement findFirst 조건 강화 |
| `src/app/api/courses/[id]/route.ts` | deletedAt 필터 추가 |
| `src/components/coach/ScoutingAlerts.tsx` | 실패 피드백 추가 |

---

## 2026-04-02 ~ 2026-04-03

### 과정 중심 섭외 관리

**구현 완료**
- Course 테이블 + CRUD API
- 마이페이지 과정별 그룹핑 뷰 (아코디언)
- 대시보드 날짜 범위 선택 + 코치 다중선택 컨택
- 과정 선택 시 날짜 자동 채움 + 날짜별 토글
- 대시보드 시간 필터 과정 workHours 기반 자동 적용
- 컨택 모달에 과정설명/기타 입력
- 코치뷰 알림 UX 개선 (회사명 익명화, 벨→받은요청 버튼)
- 헤더 네비게이션: 대시보드 | 코치풀 | 찜꽁스테이지 | 과정관리
- 과정 수정 모달 — 날짜별 스케줄 빌더
- workHours VarChar→Text 변경

**확인 필요**
- [ ] 과정 CRUD 정상 동작
- [ ] 대시보드 과정 선택 → 날짜 자동 채움 → 컨택 정상

---

## 2026-04-01

### 마이페이지 전면 리빌드 — 구인 이력 관리

**브랜치:** `feat/dual-dashboard`

#### 구현 완료

**탭 구조 & 데이터 표시**
- 전체 / 컨택중 / 확정 / 취소 4개 탭
- 전체 탭: 모든 상태 (취소 포함) 표시
- 취소 탭: 복구 버튼으로 컨택중 상태로 되돌리기
- 그리드 컬럼: 체크박스 → 상태 → 날짜 → 코치명 → 액션

**확정 패널 (과정 정보 입력)**
- 과정명 텍스트 입력 (선택사항)
- 시작일/종료일 date picker
- 날짜 범위 내 모든 날짜 칩 표시 (주말/공휴일 포함, 기본 해제+빨간 스타일)
- 전체 적용 시간 입력: `9~18`, `9.5~18`(→09:30~18:00), `09:00~18:00` 포맷 지원
- 날짜별 개별 시간 오버라이드 가능
- 휴게시간 자동 계산: ≥8시간 → 1H 휴게, ≥4시간 → 0.5H 휴게
- 출력 포맷: `2026-04-07(월) 09:00 ~ 18:00 (휴게 1H, 총 8H)`
- 확정 시 과정명/시작일/종료일/근로시간 모두 DB 저장

**확정 후 수정/취소**
- 확정 항목에 수정/취소 버튼
- 수정 시 DB에 저장된 과정명을 패널에 로드
- 수정 후 재확정 시 DB 업데이트

**다중선택 + 내보내기**
- 체크박스 다중선택 → 클립보드 복사 / 엑셀 다운로드
- DB에 저장된 데이터 기반 (확정 패널 열지 않아도 복사 가능)
- 엑셀 컬럼: 빈칸, 신규V, 빈칸, 사번, 성명, 담당직무, 매니저, 과정명, 15000, 시작일, 종료일, 빈칸, 근로시간, 이메일, 연락처, 빈칸, 빈칸
- 클립보드 복사: 헤더 제외, 탭 구분
- 엑셀: 헤더 포함

**DB 스키마 변경**
- Scouting 모델에 `courseName`, `hireStart`, `hireEnd`, `scheduleText` 필드 추가
- 마이그레이션 2개: `20260401_scouting_course_name`, `20260401_scouting_hire_schedule`

**API 변경**
- GET `/api/scoutings`: try-catch 에러 핸들링 추가, 새 필드 select에 포함
- PATCH `/api/scoutings/:id`: courseName/hireStart/hireEnd/scheduleText 저장 지원, 'scouting' 상태 복구 허용

**대시보드 연동**
- 대시보드 컨택중 토글 → 마이페이지에서 즉시 조회 가능
- 대시보드 초기 로드 시 날짜 자동 선택 제거 (selectedStart: null)

#### 주요 버그 수정
- Prisma client 캐시 문제: 스키마 변경 후 `.next` 캐시가 stale → `prisma generate` + `.next` 삭제로 해결
- `buildSheetRow`에서 `lines` 변수 중복 정의 → `outputLines` 참조로 수정
- 내보내기가 페이지 상태에 의존하던 문제 → DB 저장 데이터 기반으로 아키텍처 변경

#### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `prisma/schema.prisma` | Scouting에 courseName/hireStart/hireEnd/scheduleText 추가 |
| `prisma/migrations/20260401_scouting_course_name/` | course_name 컬럼 추가 |
| `prisma/migrations/20260401_scouting_hire_schedule/` | hire_start/hire_end/schedule_text 컬럼 추가 |
| `src/app/(manager)/mypage/page.tsx` | 전면 리빌드 — 탭/확정패널/내보내기 |
| `src/app/api/scoutings/route.ts` | 에러 핸들링 + 새 필드 select |
| `src/app/api/scoutings/[id]/route.ts` | 과정 정보 저장 + 복구 상태 허용 |
| `src/app/(manager)/dashboard/_components/DashboardContent.tsx` | 초기 날짜 선택 제거 |

#### 확인 필요
- [ ] 대시보드 컨택중 토글 → 마이페이지 조회 정상
- [ ] 확정 패널에서 과정 정보 입력 → DB 저장 확인
- [ ] 다중선택 → 클립보드 복사 (DB 저장 데이터 기반)
- [ ] 다중선택 → 엑셀 다운로드 포맷 확인
- [ ] 취소 → 복구 정상 동작
- [ ] 확정 후 수정 → 과정명 로드 + 재저장

---

### UI 소소한 개선
- 코치 상세 스케줄: 선택중 색상을 오렌지→blue-gray로 변경 (섭외중과 구분)
- 시간대 라벨: "오전+오후" → "오전, 오후" 쉼표 구분으로 변경
- 전체 코치 목록: 등록 버튼 높이를 검색창/필터와 동일하게 맞춤
- 코치뷰 저장 버튼: "✓ 저장됨" 2초 후 "저장하기"로 자동 복귀

---

### 마이페이지 섭외 기능 검증 (validated-plan)

#### 버그 수정
- **confirmed→confirmed 전환 불가 (수정 재확정 409 에러):** `scouting-state-machine.ts`에 `{ from: 'confirmed', to: 'confirmed', actor: 'manager' }` 전환 규칙 누락. 추가하여 해결.
- **GET /api/scoutings 보안 갭:** `managerId`를 클라이언트 query parameter 그대로 사용 → 다른 매니저의 섭외 건 조회 가능. `auth.manager.id`로 서버 강제 수정.

#### 검증 결과 (이상 없음)
- TSV 17열 전수 대조: `buildSheetRow` ↔ `SHEET_HEADERS` 불일치 0개
- `tsvCell` RFC 4180 준수: 줄바꿈→더블쿼트 감싸기, 내부 `"`→이중화
- 다날짜 순차 확정 UX: 과정 정보 state 유지 / 낙관적 갱신 비제거(`prev.map`) / 필터 자동 전환 없음
- '일련의 과정' placeholder 섹션 추가 (`mypage/page.tsx` 하단)
- Validation v2 28/28 pass, 테스트 24/24 pass, tsc 에러 0개

#### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/scouting-state-machine.ts` | confirmed→confirmed 전환 추가 |
| `src/lib/__tests__/scouting-state-machine.test.ts` | 전환+알림 테스트 2건 추가 |
| `src/app/api/scoutings/route.ts` | GET managerId 서버 강제 |
| `src/app/(manager)/mypage/page.tsx` | 일련의 과정 빈 영역 추가 |

---

### 인앱 알림 시스템

#### 구현 완료
- 섭외 상태 머신 9행 전이 규칙 + 알림 트리거 T1~T5 매핑
- Notification / PushSubscription DB 모델
- 매니저용: 알림 API (목록/안읽은수/읽음처리) + NotificationBell + NotificationDropdown
- 코치용: 알림 API + CoachNotificationBell + ScoutingAlerts (수락/거절 배너)
- Web Push: VAPID 키 설정, Service Worker (`public/sw.js`), `usePushSubscription` 훅
- 벨 첫 클릭 시 Push 구독 자동 요청, VAPID 키 없으면 Push만 스킵 (인앱 알림 정상 동작)

#### 통합 지점
| 파일 | 변경 내용 |
|------|-----------|
| `src/components/Header.tsx` | NotificationBell 추가 |
| `src/components/coach/CoachHeader.tsx` | CoachNotificationBell 추가 |
| `src/app/coach/page.tsx` | ScoutingAlerts 추가 |

#### 동작 방식
1. 벨 클릭 → 브라우저 "알림 허용?" → 허용 시 공개키로 Push 구독 등록 → DB 저장
2. 섭외/수락/확정 이벤트 → 비공개키로 서명 → Push 발송
3. VAPID 키 미설정 시 Push만 비발송, 인앱 알림(벨+드롭다운) 정상

---

### 대시보드 분리 (일반 + 삼전)

**브랜치:** `feat/dual-dashboard` (코드 완료, 미머지)

#### 구현 완료
- 일반 대시보드(`/dashboard`): 삼전DX 4월부터, 삼전DS 5월부터 12월까지 숨김
- 삼전 대시보드(`/dashboard/samsung`): 삼전 DS+DX 코치만 표시, admin/samsung_admin만 접근
- 환경변수로 숨김 범위 설정 (`SAMSUNG_DS_HIDE_FROM`, `SAMSUNG_DX_HIDE_FROM`, `SAMSUNG_HIDE_UNTIL`)
- API `coachFilter` 파라미터 추가 (월간 요약 + 일별 상세)
- `DashboardContent` 공통 컴포넌트 추출 (variant prop)
- `/api/auth/me` 엔드포인트 생성 (매니저 role 조회)
- 헤더 네비게이션: 대시보드 | 삼전 대시보드 | 전체 코치
- 삼전 대시보드 기본 시간 필터: 오전+오후 (08-18)
- 새로고침 버튼 색상: 평소 연회색, 동기화 중 파란색

#### 배포 시 할 일
- [ ] `feat/dual-dashboard` → `main` 머지
- [ ] Railway 환경변수 3개 추가 (SAMSUNG_DS_HIDE_FROM=2026-05, SAMSUNG_DX_HIDE_FROM=2026-04, SAMSUNG_HIDE_UNTIL=2026-12)
- [ ] 일반 대시보드에서 삼전 코치 숨김 확인
- [ ] 삼전 대시보드 권한 체크 확인
- [ ] samsung_admin role 매니저 지정

---

### 코치 스케줄 입력 UI 전면 개편

#### 구현 완료
- 30개 시간슬롯 개별선택 → 4버튼(오전/오후/저녁/전일)으로 단순화
- 날짜별 인라인 시간선택
- 전체 일괄 토글(bulk toggle) 기능 추가
- 캘린더 월 범위: 이번달~12월 제한
- 미저장 변경사항 confirm 다이얼로그 추가
- 불가 날짜 재토글 버그 수정

#### 확인 필요
- [ ] 4버튼 토글 정상 동작
- [ ] bulk toggle로 전체 날짜 일괄 변경
- [ ] 미저장 변경 시 페이지 이탈 경고

---

### 대시보드/코치상세 UI 통일

#### 구현 완료
- TIME_PRESETS 통일 (오전 08-13 / 오후 13-18 / 저녁 18-22)
- 새로고침 텍스트 버튼
- '가용 시간' → '가능 시간대' 라벨 변경

---

### 스케줄 데이터 보호

#### 구현 완료
- 코치 스케줄 저장 시 R2에 비동기 백업 (fire-and-forget)
- CoachSchedule `onDelete: Restrict` 적용

#### 확인 필요
- [ ] 스케줄 저장 시 R2 백업 정상
- [ ] 코치 삭제 시 스케줄 있으면 차단

---

### 삼전 코치 스케줄 열람 제한

#### 구현 완료
- ScheduleTab에서 삼전DS/DX 코치 스케줄 월별 제한
  - DS: 다음달부터 숨김 (매월 마지막주 월요일 이후 1개월 추가 열람)
  - DX: 이번달부터 숨김 (매월 마지막주 월요일 이후 1개월 추가 열람)
- 제한 시: fetch 스킵, 접속상태/새로고침/범례/우측패널 숨김
- 안내 배너 표시: "삼전 우선 배정 코치로, 다음 달 스케줄은 매월 마지막 주 월요일 이후 공개됩니다. 양해 부탁드립니다."
- DX 로직 버그 수정 (지난달 마지막주 월요일 기준으로 변경)

#### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/components/coaches/detail/ScheduleTab.tsx` | 삼전 제한 로직 + 배너 UI |
| `src/app/(manager)/coaches/[id]/page.tsx` | workType prop 전달 |

---

### 삼전 코치 self_note 정리

- 26명 삼전 코치 `self_note`에서 컨택 제한 안내 문구 일괄 삭제
- "삼전 전용으로 면접보신 분들이니 절대 컨택 X..." 3줄 블록 제거
- 개인 메모(취업 완, 강사 희망 등)는 보존
- PostgreSQL `regexp_replace`로 처리 (로컬 DB)

---

### 대시보드 시간대별 가용 판정 강화

- 투입 일정이 시간대(오전/오후/저녁)에 1슬롯이라도 겹치면 해당 시간대 전체 불가능 처리
- `clearOverlappingPeriods()` 함수 추가
- 테스트 4개 추가

---

### 코치뷰 컨택 예정 표시

#### 구현 완료
- 컨택중 날짜 선택 시 캘린더 아래(시간 버튼 위)에 "컨택 예정 — OOO 매니저" 노란 배너
- 캘린더 셀 tooltip에도 "컨택 예정 (OOO 매니저)" 표시
- coach schedule API에 scouting 데이터 포함 응답

#### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/components/coach/ScheduleCalendar.tsx` | 컨택 예정 배너 + tooltip |
| `src/app/coach/page.tsx` | scoutings 타입 추가 |

---

### 컨택중 표시 — 코치 상세

#### 구현 완료
- ScheduleTab에서 가능+컨택중 셀: 초록 배경+주황 테두리
- 날짜 클릭 시 우측 패널에 가능시간 + "컨택중 — 매니저이름" 한 줄 표시
- coach schedule API에 scouting 데이터 포함 응답

#### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/components/coaches/detail/ScheduleTab.tsx` | 컨택중 셀 스타일 + 패널 표시 |

---

### UI 개선

- "종일" → "전일" 라벨 변경 (코치뷰)
- 확정된 시간대 버튼 파란색+비활성 처리
- 시간 요약에 "약" 접두어 추가
- 벌크선택 라벨 "전체" → "모두 선택"
- 오전+오후+저녁이면 "전일"로 축약 표시
- 오늘 날짜: 테두리 → 글씨 크게+볼드+밑줄 (3개 캘린더 모두)
- "섭외중" → "컨택중" 용어 변경 전체 사이트 반영
- 마이페이지 UI 리디자인: 필터 칩+grid 테이블+rounded-2xl 카드, 제목 "내 섭외 현황"→"구인 이력"
- 로고 블루(#4A65EA) 전체 적용 시도 → Material Blue(#1976D2)로 원복

---

### 대시보드 — 컨택중 버튼 버그 수정

- 원인: Prisma client에 Scouting.status 필드 누락 (migration 적용 후 `prisma generate` 미실행)
- Turbopack 캐시가 stale client 계속 제공 → dev server 종료 + `.next/dev`, `.next/cache` 삭제 후 재시작으로 해결
- `handleScoutToggle`에 에러 핸들링 추가: 실패 시 toast 메시지 + console.error
- POST `/api/scoutings`에 try-catch 추가: 에러 메시지 응답 반환

---

### 대시보드 — 가능 시간대 표시 병합

- 개별 스케줄 블록(오전, 오후, 저녁)을 min start / max end로 합산하여 단일 라벨 표시
- `formatScheduleLabel()` 함수 추가: 오전 / 오후 / 저녁 / 오전·오후 / 오후·저녁 / 전일
- 기존 `coach.schedules.map(formatTimeRange).join(", ")` → `formatScheduleLabel(coach.schedules)`

---

### 마이페이지 — 확정 시 구글시트용 클립보드 복사

- 확정 버튼 클릭 → 과정명 인라인 입력(Enter/Esc 키보드 지원) → PATCH API 호출
- PATCH `/api/scoutings/:id`: status=confirmed 시 코치 정보(사번/이름/직무/이메일/연락처) + 매니저 이름 응답
- 프론트에서 A~Q열 tab-separated 행 생성 후 `navigator.clipboard.writeText`로 복사
- "복사됨!" 뱃지 3초간 표시
- 처음엔 Sheets API v4 직접 쓰기로 구현 → 프로덕션 데이터 안전 위해 복붙 방식으로 전환

#### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/scoutings/[id]/route.ts` | 확정 시 sheetRow 데이터 응답 추가 |
| `src/app/(manager)/mypage/page.tsx` | 과정명 입력 UI + 클립보드 복사 로직 |
| `src/components/dashboard/DashboardCoachList.tsx` | `formatScheduleLabel()` 추가 |
| `src/app/(manager)/dashboard/_components/DashboardContent.tsx` | 에러 핸들링 추가 |
| `src/app/api/scoutings/route.ts` | try-catch 에러 응답 추가 |

---

## 2026-03-25

### 로그인 페이지
- 로고를 텍스트에서 title.png 이미지로 변경
- 미들웨어에서 정적 이미지 파일(.png 등) 인증 차단 해제

### 대시보드

#### 달력
- 인원수 표시를 "1명"에서 숫자만 파란 원 뱃지로 변경
- 셀 높이/간격 확대하여 여유롭게
- 과거 날짜는 흐리게 처리 (뱃지는 유지)
- 2개월 후 이상 이동 시 "아직 입력이 열리지 않은 달입니다" 안내

#### 코치 테이블
- "최근 이력" 컬럼을 "누적 근무일"로 변경 (최근 6개월 고유 일수 집계)
- 컬럼 순서: 체크박스 → 이름 → 누적 근무일 → 가용 시간
- 정렬 드롭다운 추가 (기본 / 누적 근무일 많은 순 / 가용 시간 많은 순)
- 이력 필터 제거
- 이름/연락처/이메일 통합 내보내기

#### 필터/기타
- 가능 분야 드롭다운 제거 (데이터 비어서 나옴)
- 시간 지정 팝업 너비 확대
- 계약 시간 차감 임시 적용 → 근본 해결은 engagement_schedules (다음 세션)

### 코치 목록 페이지

#### 테이블
- 컬럼: 체크박스 / 이름 / 휴대폰 / 이메일 / 분야 / 근무일 / 평가
- 필터, 검색, 등록 버튼을 테이블 카드 안 상단 바에 통합
- 기본 정렬: 최근 6개월 누적 근무일 많은 순
- 2차 정렬: 근무일순 → 평점순, 평점순 → 근무일순

#### 필터
- 가능 분야 멀티셀렉트: 클라이언트사이드 Set 기반, 초기 전부 선택
- 근무유형 멀티셀렉트: 초기 전부 선택, 클라이언트사이드 필터링
- 빈 결과 시 "필터 초기화" 버튼

#### 내보내기
- 선택 시 전화번호/이메일 버튼 표시
- 메일머지 엑셀: 이름/이메일/개인링크 3열, 여러 이메일은 첫 번째만 추출

### 코치 상세 페이지

#### 헤더
- 이름 + 별점 + 근무유형 뱃지 (실습코치=보라, 운영조교=틸, 기타=인디고)
- 활동중 뱃지 제거, 근무유형 쉼표 구분 시 각각 별도 뱃지
- 전체 근무 이력 로드 (5건 제한 제거)

#### 프로필 탭
- 레이아웃: 연락처/이메일 → 생년월일/소속 → 파일
- 근무유형은 헤더 뱃지로 이동
- 포트폴리오 URL 컬럼 추가, 외부 링크 칩으로 표시
- 파일 업로드: 10MB 초과/5개 제한 에러 메시지
- 특이사항/히스토리: selfNote 라벨 변경, 노션에서 14명 임포트
- 근무 가능 세부 내용 컬럼 추가, 스케줄 탭 캘린더 상단에 표시
- managerNote 라벨을 "메모"로 변경

#### 스케줄 탭
- 달력 이동을 가운데 고정, 접속상태 칩 왼쪽, 새로고침 버튼 우측
- 디테일 패널: 시간+교육명 한 줄 배치, "상세 시간 미등록" 제거
- 6개월 집계: 미래 스케줄 제외, 고유 일수만 카운트

#### 근무 이력 탭
- 명칭을 "투입 이력"에서 "근무 이력"으로 변경
- 연도별 아코디언: 최신 펼침, 과거 접힘
- 컴팩트 카드: 접힌 상태에서 한 줄 요약, 클릭 시 상세 펼침
- 담당자 필수: 생성 시 현재 매니저 이름 자동 채움
- 재섭외 의사: 체크박스에서 3상태 select로 변경 (희망/비희망/미입력)
- 피드백: 200자 제한 + 비속어 필터 (프론트+API 양쪽 검증)
- 과정별 시급 컬럼 추가, 근무 이력 카드에 표시

#### 수정 이력
- 2줄에서 1줄로 (행동 / 사람 / 날짜 한 행)
- 변경자를 이메일 대신 이름으로 표시
- old/new 값 구분 (취소선+진한글씨)
- 복원 시 audit log 기록 추가

### 관리자 페이지

#### 탭 구조 변경
- 매니저 → 매니저 관리
- 코치 링크 + 입력 메일 발송 → 코치 관리로 통합
- 삭제된 코치 → 코치 삭제 내역 (3번째로 이동)

#### 매니저 관리
- 역할 프리셋 칩 (전체/관리자/일반/차단, 색상별)
- 한 행 레이아웃 (이름 / 이메일 / 역할 드롭다운) + 컬럼 헤더
- 검색창 테이블 헤더 우측, 일괄변경은 검색 왼쪽

#### 코치 관리
- 상태 프리셋 칩 (입력완료/접속만/미확인/전체, 색상별)
- 테이블 상시 노출 (이름 / 휴대폰 / 이메일 / 개인링크)
- 셀 클릭하면 복사, 마우스 올리면 전체 텍스트 표시
- 수신인 복사 + 메일머지용 엑셀 내보내기
- 메일 문구 섹션 제거

#### 코치 삭제 내역
- 다중선택 체크박스 + 전체선택
- 복원/삭제 버튼을 상단 바로 이동, 일괄 처리 확인 모달
- 컬럼 분리: 휴대폰 / 이메일 / 삭제자 / 삭제일

### 코치 스케줄 입력 (코치뷰)
- 입력 기간을 현재월 + 다음달만 허용, 그 외는 읽기 전용
- "새 달 오픈" 수동 관리 제거, 자동화

### API / 백엔드

#### 권한
- 투입 이력 수정: non-admin은 본인 이력만, admin은 전체 수정 가능
- 스케줄 입력: 현재월/다음달만 허용 (403 반환)

#### 데이터 집계
- 6개월 근무일 범위 보정: 시작일 통일, 오늘 이후 제외, 고유 일수 카운트

### 전체 디자인 통일

#### 폰트
- 테이블 행 본문: 16px에서 14px로 통일
- 폼 입력은 16px 유지 (iOS 자동 줌 방지)
- 모달, 빈 상태, 탭 라벨, 버튼 등 비테이블 요소도 14px으로 통일

#### 테이블 공통
- 검색: 돋보기 아이콘 + 연한 배경 + 포커스 시 흰 배경/파란 링
- 액션 버튼은 검색 왼쪽에 표시 (검색은 항상 고정 위치)
- 테두리 없는 배경색 버튼 스타일

### 데이터 임포트

#### import 스크립트
- 미매칭 코치 자동 생성: 2026년 시작일 계약자 16명 추가
- 이메일/연락처 보완: 구글시트 N열/O열 파싱
- 근무유형: F열 파싱
- 삼성 스케줄: 별도 시트에서 75건 engagement + 181건 schedule

#### 노션 데이터
- 근무유형: "유형" + "근무 유형" + "담당직무" 합산
- 포트폴리오 URL: 45명
- 특이사항/히스토리: 14명
- 근무 가능 세부 내용: 44명
- 삼전 DS: 삼성 시트 코치 11명

#### 프로덕션 임포트 결과
- 코치 62명, 투입이력 183건, 스케줄 882건

---

## 2026-03-26

### 로그인 페이지
- title.png 상하 여백 트리밍 (500x500 → 500x116)
- .env.local NEXTAUTH_URL 로컬 변경 (로그인 리다이렉트 수정)

### 대시보드

#### 데이터 흐름 재설계
- CoachSchedule = 코치 직접 입력 전용 (구글시트에서 생성하지 않음)
- EngagementSchedule = 계약 확정 시간 (구글시트 + 앱 수동 등록)
- 가용시간 = CoachSchedule - EngagementSchedule (30분 슬롯 비트맵 차감)
- 차감 후 가용시간 0이면 대시보드에서 안 보임
- 차감 대상: scheduled / in_progress / completed (cancelled 제외)

#### 시간 필터
- 코치 목록에서 캘린더 상단으로 이동
- 프리셋: 전체 / 주간(09~18) / 야간(19~22) — 실제 데이터 기반
- 프리셋과 커스텀 select 양방향 동기화 (프리셋 클릭 → select 갱신, select 변경 → 프리셋 해제)
- 시간 필터 변경 시 캘린더 숫자도 연동 갱신
- 월간 요약 API에 timeFilter 쿼리 파라미터 지원 추가
- 시간 select를 프리셋 오른쪽에 한 줄 배치

#### 기간 선택
- 캘린더에서 클릭→클릭으로 시작일~종료일 범위 선택
- 선택 범위 하이라이트 (시작/종료: 파랑, 사이: 연파랑)
- 범위 선택 시 모든 날짜에 공통 가용한 코치만 표시 (비트맵 AND)
- 과거 날짜는 단일 선택만 허용 (범위 시작점 불가)
- API: endDate 쿼리 파라미터로 범위 쿼리 지원

#### 필터 요약 문장
- 코치 목록 상단에 자연어 안내: "3월 26일 목요일 9:00~18:00에 근무 가능한 코치는 0명입니다."
- 날짜: 검정 볼드, 시간: 파랑 볼드, 인원수: 파랑 볼드

#### 코치 목록
- 컬럼 확장: 체크박스 / 이름 / 가용시간 / 최근 근무 과정명 / 누적 근무일 / 평점
- 분야 / 이력 / 평가 필터 제거
- 중복 "아직 입력이 열리지 않은 달입니다" 메시지 수정
- 내보내기: 이름 / 핸드폰 / 이메일 순 CSV

#### 새로고침 버튼
- 초기화 버튼 제거 (시간: "전체" 클릭, 날짜 범위: 같은 날 재클릭으로 해제)
- 시간 필터 줄 끝에 초록색 "새로고침" 버튼으로 통합
- 기존 월 네비게이션 옆 새로고침 아이콘 제거

### 코치 목록 페이지
- 가능 분야 "전체 선택" 제거, "초기화"로 변경
- 필터 로직: 빈 set = 전체 표시, 선택 시 해당 분야만

### 코치 상세 페이지

#### 프로필 탭
- "코치가 남긴 메모" → "특이사항 / 히스토리" 라벨 변경
- "내부 메모" → "메모" 라벨 변경
- 파일 칩 스타일 통일 (노션 포트폴리오/직접 업로드 → 아웃라인 스타일, 가능분야 칩과 시각적 구분)

#### 스케줄 탭
- 근무 가능 세부 내용: 캘린더 위 → 캘린더 오른쪽 흰색 블럭으로 이동

#### 투입이력 탭
- 기본 접힘 상태, 화살표 클릭으로 펼침/접힘
- 삼성전자 SW학부 교육과정: 코치별 1건 통합 (75건 → 11건), 2026-03-01~06-30 고정

### 관리자 페이지
- 하연희 admin 권한 부여
- admin 권한만 노출 (유지)
- 매니저 관리 테이블 헤더에 전체선택 체크박스 추가

### 헤더
- 로고 크기 축소 (h-7/h-10 → h-5/h-7)
- "내보내기" 버튼 라벨 → "연락처 내보내기"로 변경

### API / 백엔드

#### 비트맵 차감 구현
- `src/lib/schedule-bitmap.ts`: 30분 슬롯 비트맵 유틸 (toBitmap, subtractBitmap, toIntervals, hasAvailability)
- 테스트 6개 통과 (schedule-bitmap.test.ts)
- engagement_schedules 테이블 생성 + 기존 투입이력에서 3,103건 데이터 생성

#### 구글시트 동기화 변경
- engagements.ts, samsung-schedule.ts에서 CoachSchedule 생성 코드 제거
- 기존 구글시트가 만든 coach_schedules 전부 삭제

#### 수동 이력 등록 개선
- POST: engagement 생성 후 EngagementSchedule 자동 전개 (평일, startTime/endTime)
- PUT: 날짜/시간 변경 시 EngagementSchedule 삭제 후 재생성

#### 날짜 하루 밀림 수정
- 원인: `new Date("YYYY-MM-DD")` → UTC 자정, `new Date(year,month,day)` → KST 자정(UTC 전날 15시) — Prisma+PrismaPg가 date 컬럼 저장 시 하루 밀림
- 모든 Date 생성에 `T12:00:00Z` 추가 (engagements POST/PUT, schedules API, coach schedule API)
- `src/lib/date-utils.ts`: `toDateOnly()` 유틸 추가 — UTC 정오로 타임존 안전
- 범위 쿼리 수정: parseYearMonth, 6개월 집계, coaches 목록 sixMonthsAgo
- birthDate 수정: coaches 생성/수정 API
- DB 마이그레이션: coach_schedules(1066건), engagement_schedules(1179건), engagements(265건) 전부 +1일
- 검증: 일요일 데이터 161→9건으로 정상화, 박범찬 3/26→3/27 확인

#### 시간 필터 디자인 개선
- 커스텀 시간 select: 네이티브 border 스타일 → pill 형태(rounded-full, bg-gray-100)로 변경
- 프리셋 버튼과 시각적 톤 통일 (활성: bg-[#E3F2FD], 비활성: bg-gray-100)
- 드롭다운 화살표 아이콘(▾) 추가 — appearance-none + SVG 오버레이

#### 연락처 누락 수정
- 전화번호 정규식 수정: 하이픈 형식만 매칭 → 모든 형식 지원 (숫자 추출 후 010-xxxx-xxxx로 정규화)
- 동기화 재실행으로 19명 → 1명으로 감소 (임혜정: 시트에 연락처 없음)

### 인프라
- GitHub push: 6개 커밋 (설정 / 라이브러리 / API / 대시보드 / 코치페이지 / 관리자+스크립트)
- Railway 스테이징 환경 생성 (별도 DB, 프로덕션 데이터 복사)
- 로컬 개발 DB 세팅: Homebrew PostgreSQL 17 (port 5433) + coach_db_dev 데이터베이스
- .env.local을 로컬 DB로 전환 (프로덕션 URL 주석 보존)

### 설계 완료 (미구현)
- 코치 신청 관리: 구글폼 → 구글시트 → 관리자 승인 → Coach 등록 (`docs/plans/2026-03-26-coach-application-design.md`)
- 코치뷰 프로필 편집: 핸드폰, 분야, 스킬, 가용기간 등 수정
- CoachStatus에 `pending` 추가 (신청 대기)

---

## 2026-03-26 (세션 2)

### 코치 상세 페이지

#### 수정이력(audit log) 버그 수정
- 코치 수정 시 audit_logs에 기록이 안 되던 문제 수정
  - 원인 1: `PUT /api/coaches/:id`에서 `logChanges()` 호출 누락
  - 원인 2: `existing` 조회 시 `id`, `deletedAt`만 select해서 이전 값 비교 불가
  - 원인 3: `audit_logs` 테이블이 DB에 없었음 (스키마에만 정의) → `prisma db push`로 생성
- 트랜잭션 타임아웃 (5초 초과) 수정
  - 원인: field/curriculum upsert를 트랜잭션 안에서 순차 실행, Railway DB 지연
  - 수정: upsert를 트랜잭션 밖으로, 트랜잭션 안에서는 `createMany`만 실행

#### 수정 확인 버튼 UX 개선
- 변경 사항 없이 "수정 확인" 누르면 API 호출 없이 상세 페이지로 이동
- "수정 확인" 클릭 시 버튼이 "저장 중..."으로 변경 + 비활성화 (중복 클릭 방지)

#### 수정 이력 UI
- 2줄 레이아웃(이름+날짜 / 변경내용)을 1줄로 통합: `03/26 14:30  홍길동  이름 t이두리 → 이두리`
- 시간(HH:mm) 표시 추가

#### 사번 추가
- Coach 모델에 `employeeId` 컬럼 추가 (varchar(20), nullable)
- 구글시트 동기화 시 D열(사번)에서 접미사(`-1` 등) 제거 후 저장
- 프로필 탭에 사번 표시: 생년월일 / 사번 / 소속 / 파일 순 배치

### 스켈레톤 로딩 적용
- `Skeleton`, `SkeletonText`, `SkeletonCard` 프리미티브 컴포넌트 생성
- 적용 대상 (기존 "불러오는 중..." 텍스트를 실제 레이아웃 형태의 펄스 애니메이션으로 교체):
  - 코치 상세 페이지: 헤더 + 탭바 + 프로필 카드 2개
  - 코치 수정 페이지: 헤더 + 버튼 + 입력 폼 카드 2개
  - 코치 목록 테이블: 테이블 헤더 유지 + 행 8줄
  - 대시보드 코치 리스트: 테이블 헤더 유지 + 행 6줄
  - 투입이력 탭: 헤더 + 등록 버튼 + 카드 3장
  - 문서 탭: 헤더 + 파일 행 2줄
  - 스케줄 탭: 7x5 캘린더 그리드

### 대시보드
- 날짜 토글: 같은 날짜 재클릭 시 선택 해제 (코치 리스트 플레이스홀더 표시)
- `CoachEntry` 타입에 `workDays`, `recentEngagements`, `engagementCount` 추가 (누적 근무일수 표시 누락 수정)
- 누적 근무일/평점 데이터 좌측 정렬 (헤더와 통일)

---

## 2026-03-27

### 코치 상세 — 프로필 탭

#### 레이아웃 개편
- 기본 정보: 2열 그리드 → flex 행 배치 (연락처+이메일 / 생년월일+소속 / 파일 전체너비)
- 사번: 기본 정보에서 제거, 카드 우측 상단 복사 버튼으로 이동 (`사번 81000020` → 클릭 시 복사)
- 파일 행 전체 너비 사용

#### 포트폴리오 파일명 실명화
- portfolioUrl(구글 드라이브 링크) 45명분을 `coach_documents`에 이관
- Google Drive API로 실제 파일명 조회 (49건 성공)
- 파일명에서 ` - 이름` 접미사 자동 제거
- URL 파싱 버그 수정 (구분자 없이 URL 붙은 경우 / 줄바꿈 구분)
- `portfolioUrl` 칩은 documents 없는 코치에만 폴백 표시

#### 가능 커리큘럼 색상 그룹핑
- 커리큘럼 태그를 주제별 6색 자동 분류: 프로그래밍(남색) / 웹(틸) / 데이터·AI(보라) / 클라우드(오렌지) / 디자인(핑크) / 오피스·자동화(블루)
- 같은 그룹끼리 같은 색 + 그룹순 정렬
- 파스텔 톤으로 밝기 조정

### 코치 상세 — 헤더 리디자인
- 1줄: 이름 + 평점 + 상태 토글(활동중/비활동) + 비활동 시 복귀 예정월 + 활동 관련 메모(인라인 편집, 60자)
- 근무유형: 헤더에서 제거, 코치 목록에서 확인
- 수정/삭제: 탭 바 우측으로 이동, 프로필 탭일 때만 표시
- 근무이력 탭일 때 탭 바 우측에 "이력 등록" 버튼
- 상태 토글: 전체 매니저 사용 가능, 비활동 시 복귀 예정월(month picker) 표시
- 활동중 전환 시 복귀 예정일 자동 초기화

### 코치 상세 — 스케줄 탭
- engagementSchedules prop을 state로 복사 후 초기화 안 한 버그 수정 — 확정 교육 시간이 항상 빈 배열이었음
- 선택일 패널: 가용/확정 분리 → 시간순 통합 표시, 초록(가용) / 파랑(확정 교육+과정명) 색 구분
- 시간 오름차순 정렬
- 스케줄 탭 진입 시 오늘 날짜 기본 선택
- 새로고침 버튼 캐시 무시 수정
- 근무 가능 세부 내용: max-h-24 스크롤, 우측 패널 max-w-[400px] 고정

### 코치 상세 — 근무이력 탭
- Engagement에 `workType` 컬럼 추가 (근무유형에 따라 페이가 다름)
- 같은 과정명 그룹핑: 삼성 SW학부 등 다건 → 1줄 표시 (년월 기간, 상태 우선순위: 진행>예정>완료)

### 코치 상태 관리
- `CoachStatus` enum: on_leave 제거 → pending / active / inactive
- `statusNote` 컬럼 추가 (활동 관련 메모, VARCHAR 60)
- `returnDate` 컬럼 추가 (복귀 예정월, Date nullable)

### 코치 목록 페이지
- 근무유형 칩 색상: 실습코치(보라), 운영조교(틸), 삼전 DS(오렌지), 삼전 DX(파랑)
- 근무유형 필터: 초기 전체 체크 해제 → 선택한 것만 필터
- 이메일 컬럼 추가, 분야 컬럼 축소
- 정렬 2단계: 1차 비활동 하단 고정, 2차/3차 사용자 선택 드롭다운 (이름순/근무일/평가), `>` 구분자
- 3차 드롭다운에서 2차 선택값 제외

### 사번(employeeId) 동기화 개선
- 시트 기준으로 항상 갱신 (시트가 source of truth)
- 노이즈 필터 추가: D열의 `취소`, `입사취소`, `계약취소`, `근무취소`, `사번없음`, `-` 등 비정상 값 제거
- 접미사 제거 유지: `81000039-1` → `81000039`
- 같은 코치에 여러 사번 있으면 유니크 정렬 후 쉼표로 join하여 저장 (예: `"81000012, 91000025"`)
- `employee_id` 컬럼 VARCHAR(20) → VARCHAR(200) 확장

### 근무유형 데이터 보강
- 삼성전자 SW학부(DS 시트) 코치 11명에 `삼전 DS` 추가
- 노션 26년 DB `유형` 필드에서 삼전 DX 17명 추출 → workType에 추가
- 노션 임포트 스크립트: `근무 유형` + `유형`(삼전만) 합산, 기존 DB 값과 merge
- `기존`/`신규` 노이즈 값 전부 제거 (로컬+프로덕션)

### 관리자 페이지 — 코치 신청 관리
- CoachStatus에 `pending` 추가 (신청 대기 → 승인 시 active)
- 구글폼 응답 시트 동기화 (export 방식 — 네이티브 스프레드시트 대응)
- 타임스탬프(A열) → createdAt에 실제 신청 시점 저장
- 신청 카드 UI: 이름/근무유형 뱃지/연락처/분야/스킬 + 클릭 펼침 (이메일/생년월일/소속/기간/경력 등)
- 근무유형: "실습코치", "운영조교" 두 단어만 추출 표시 (괄호 설명 제거)
- 승인 시 confirm 알림 + audit log 기록
- 거절 시 사유 모달 → managerNote에 `[거절 사유]` 저장 + soft delete + audit log
- 메모 입력/저장 (면접 일정 등)
- 동기화 버튼을 "동기화" 탭으로 이동 + 구글폼 링크/구글폼 응답시트 링크 추가
- 탭명: "코치 신청 목록", "동기화"

### 구글폼→DB 매핑 수정
- 교육 분야(7-1) → CoachField (가능 분야)
- 가능 분야(7-2) + 보유 스킬(7-3) → CoachCurriculum (가능 커리큘럼)

### 코치뷰 — 프로필 편집
- 헤더 우측에 사람 아이콘 → 클릭 시 프로필 모달
- 전화번호 확인 게이트 (DB 번호와 비교, 일치 시 편집 열림)
- 편집 항목: 연락처/이메일/소속/근무 가능 기간(1~3/4~6/8~9/9~12개월 칩+세부 textarea)/교육 분야(5개)/가능 분야(12개+직접입력)/보유 스킬(23개+직접입력)
- 변경 없으면 "닫기", 변경 있으면 "프로필 저장" → 저장 후 1초 뒤 모달 자동 닫힘
- PUT /api/coach/me 추가 (토큰 인증)

### 코치뷰 — 확정 일정 표시
- engagementSchedules 직접 사용 (기존: engagement 범위 + 코치 스케줄 교차 → 코치 미입력 시 확정 안 보임)
- 날짜 클릭 시 확정 과정명 표시
- 타임패널 요약: `확정: 09:00~18:00 · 삼성전자 SW학부 교육과정`

### 코치뷰 — 불가 날짜
- 타임패널에 "불가" 버튼 추가 (오전/오후/저녁/종일/불가)
- 불가 선택 시 해당일 빨간색 표시, 시간 그리드 비활성화
- 가용 시간 선택 시 자동 불가 해제
- 저장: 센티널 값(00:00~00:00)으로 DB 저장, 스키마 변경 없음
- 캘린더: 초록(가용) / 파랑(확정) / 빨강(불가) / 빈칸(미입력)

### 보안
- `/api/sync-schedule/debug` 엔드포인트 삭제 (인증 없이 구글시트 코치 데이터 50건 노출 가능했음)
- 현재 모든 API 엔드포인트 인증 적용 완료

### 인증
- NextAuth JWT callback 추가: `managerRole`을 토큰에 포함
- 기존: session callback에서만 설정 → 클라이언트 `useSession()`에서 undefined
- 수정: jwt callback → token에 저장 → session callback에서 전달

### 동기화 날짜 하루 밀림 재수정 (동기화 모듈) (적용 안 됐었음)
- 원인: 어제 toDateOnly() 수정은 API 경로만 적용, 동기화 모듈(engagements.ts, samsung-schedule.ts)은 미적용
- `parseDate`, `extractDates`, `expandRange` 전체에 `utcNoon()` (UTC 정오) 적용
- `expandRange`: `getDay→getUTCDay`, `setDate→setUTCDate`
- 프로덕션: 기존 engagement 200건 + engagement_schedule 602건 삭제 후 재생성 (125건 + 1243건)
- 삼성 스케줄 별도 재동기화 (75건)

### 코치 편집 폼
- 시급(hourlyRate) 필드 제거 — 급여는 engagement별 관리로 전환
- 상태(status) 필드 제거 — 상세 헤더에서 직접 변경
- Coach 스키마에서 `hourly_rate` 컬럼 삭제 (Engagement.hourly_rate는 유지)

### 근무이력 탭
- 전체 리스트 토글(접기/펼치기) 제거 → 항상 표시
- 개별 카드 클릭 시 상세(급여/담당/평가/재섭외/피드백) 접기/펼치기
- chevron 아이콘을 첫 줄 우측에 배치 (수정 버튼 옆)

### 코치 목록 페이지
- 드롭다운(가능 분야/근무유형) 잘림 수정: `overflow-hidden` 제거
- 6개월 누적 근무일: `coach_schedules` → `engagement_schedules` 기준으로 변경
- 누적 근무일 COUNT(DISTINCT date)로 변경 (같은 날 여러 교육 → 1일로 카운트)
- 범위: 6개월 전 같은 날 ~ 오늘 (미래 제외)

### 대시보드
- 새로고침 버튼: 텍스트("동기화 중...") → 스피너 아이콘으로 변경 (줄바꿈 방지)

### 스케줄 탭
- engagement startDate~endDate 전체 전개 → `engagement_schedules` 실제 근무일만 표시
- API에서 engagementSchedules 데이터 포함하여 반환
- 6개월 집계: 코치 목록과 동일 기준 (6개월 전 ~ 오늘, 고유 날짜, 미래 제외)
- 라벨: "최근 6개월 근무" → "최근 6개월 누적 근무일 수"

### 구글시트 동기화 로직 변경
- 날짜 필터를 코치 매칭보다 먼저 실행 (25년 이하 행은 에러 없이 스킵)
- DB에 없는 코치: 최근 6개월 계약만 자동 생성
- 2026 DB에 있는 코치: 기한 무관하게 계약 이력 추가

### 인프라
- **prisma db push → prisma migrate 전환** (데이터 유실 방지)
  - 원인: db push가 컬럼 삭제 시 테이블 드롭 후 재생성 → 프로덕션 272명→66명 유실 사고
  - 7개 migration 파일 생성 (0_init ~ 20260327_status_enum_update)
  - 로컬/스테이징/프로덕션 모두 migration 기반으로 전환
- 프로덕션/스테이징 전체 초기화 + 재동기화 (노션→구글시트→삼성 순서)
- 프로덕션 최종: 81 코치, 252 engagement, 1,243 schedules
- run-samsung-sync.ts: static import → dynamic import 수정 (dotenv 로드 타이밍)
- 로컬 DB 비밀번호 설정 (pg 드라이버 SCRAM 인증 대응)
- .env.local DATABASE_URL 프로덕션→로컬 전환 (dev 서버 재시작 필요)

## 2026-03-30

### Sentry 에러 트래킹 연동
- @sentry/nextjs SDK 설치 및 클라이언트/서버/엣지 초기화
- withSentryConfig 래핑, CSP에 Sentry 도메인 추가
- error.tsx, global-error.tsx에 Sentry.captureException 추가
- Railway 환경변수 설정 (DSN, AUTH_TOKEN, ORG, PROJECT)

### 코치뷰 UX 개선
- 프로필 미입력 시 구글폼 안내 팝업 (fields 비어있으면 자동 표시)
- 과정명 정리: [부가세별도], (B2B) 등 내부 태그 제거, _ → 공백
- 확정 일정 있는 날 불가 버튼 비활성화
- 불가 버튼 색상 강화 (빨간 배경 + 흰 텍스트)
- 스케줄 목록에서 시간 제거, 날짜+과정명만 표시
- 장소 없으면 숨김, 안내문구 "문의: 담당 매니저"로 간소화
- 나가기 버튼 제거 (window.close 브라우저 제한)
- 마지막 저장 시간: 헤더 → 나의 스케줄 섹션 하단으로 이동
- 활동 중단 신청 기능 추가 (프로필 모달 하단, 사유 입력 → status inactive)
- 달력 이동 범위 제한 (당월~2개월 후)
