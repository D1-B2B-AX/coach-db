# Coach DB v2 — MVP 전체 작업 목록

> 작성일: 2026-03-23
> 설계문서: 설계문서 #1 (스케줄 수집 및 코치 관리 v6) 기준

---

## A. 인프라

| # | 작업 | 상태 |
|---|------|------|
| A1 | Prisma 스키마 10개 테이블 + DB 마이그레이션 | ✅ |
| A2 | NextAuth (Google OAuth + 도메인 제한) | ✅ |
| A3 | 미들웨어 (매니저/코치 경로 분리) | ✅ |
| A4 | Cloudflare R2 연동 (문서 업로드/다운로드 실제 저장소) | ❌ |
| A5 | Railway Staging 환경 (Next.js + PostgreSQL) | ❌ |
| A6 | Railway Production 환경 (Next.js + PostgreSQL) | ❌ |
| A7 | R2 staging/production 버킷 분리 | ❌ |
| A8 | 기존 v1 데이터 마이그레이션 (Supabase → PostgreSQL) | ❌ |
| A9 | 주간 pg_dump 백업 → R2 | ❌ |

---

## B. API (19개 엔드포인트)

| # | 카테고리 | 엔드포인트 | 상태 |
|---|----------|-----------|------|
| B1 | 인증 | NextAuth [...nextauth] | ✅ |
| B2 | 코치용 | GET /api/coach/me | ✅ |
| B3 | 코치용 | GET/PUT /api/coach/schedule/:yearMonth | ✅ |
| B4 | 코치용 | GET /api/coach/engagements | ✅ |
| B5 | 대시보드 | GET /api/schedules/:yearMonth | ✅ |
| B6 | 대시보드 | GET /api/schedules/:yearMonth/:date | ✅ |
| B7 | 대시보드 | POST /api/schedules/:yearMonth/open | ✅ |
| B8 | 대시보드 | GET /api/schedules/:yearMonth/status | ✅ |
| B9 | 코치 관리 | GET/POST /api/coaches | ✅ |
| B10 | 코치 관리 | GET/PUT/DELETE /api/coaches/:id | ✅ |
| B11 | 코치 관리 | POST /api/coaches/:id/regenerate-token | ✅ |
| B12 | 코치 관리 | POST /api/coaches/export | ✅ |
| B13 | 투입 이력 | GET/POST /api/coaches/:id/engagements | ✅ |
| B14 | 투입 이력 | PUT /api/engagements/:id | ✅ |
| B15 | 문서 | GET/POST /api/coaches/:id/documents | ✅ |
| B16 | 문서 | DELETE /api/documents/:id | ✅ |
| B17 | 마스터 | GET/POST /api/master/fields | ✅ |
| B18 | 마스터 | GET/POST /api/master/curriculums | ✅ |
| B19 | 코치 스케줄 | GET /api/coaches/:id/schedules | ✅ |

---

## C. 화면 (7개 페이지)

| # | 페이지 | URL | 상태 |
|---|--------|-----|------|
| C1 | 로그인 | /login | ✅ |
| C2 | 코치 스케줄 입력 | /coach?token= | ✅ |
| C3 | 대시보드 | /dashboard | ✅ |
| C4 | 코치 목록 | /coaches | ✅ |
| C5 | 코치 상세 | /coaches/:id | ✅ |
| C6 | 코치 등록 | /coaches/new | ✅ |
| C7 | 코치 수정 | /coaches/:id/edit | ✅ |

---

## D. 비즈니스 로직

| # | 항목 | 상태 |
|---|------|------|
| D1 | 대시보드 폴링 30초 + 수동 새로고침 | ✅ |
| D2 | schedule_access_logs (접속 시 accessed_at, 저장 시 last_edited_at) | ✅ |
| D3 | 새 달 오픈 — 빈 상태로 오픈 | ✅ |
| D4 | 새 달 오픈 — 중복 방지 경고 | ❌ |
| D5 | 코치 저장 — 덮어쓰기 방식, 수시 업데이트 가능 | ✅ |
| D6 | 코치뷰 마지막 저장 시점 표시 | ✅ |
| D7 | 코치뷰 나가기 버튼 | ✅ |
| D8 | 코치뷰 나의 스케줄 요약 (확정, 마지막 투입, 다음 예정, 이번 달 투입) | ✅ |
| D9 | 코치뷰 저장 완료 화면 (선택 일수, 총 시간) | ✅ |
| D10 | 마스터 데이터 — 코치 등록/수정 시 새 분야/커리큘럼 자동 추가 | ✅ |
| D11 | 코치 삭제 — soft delete + 이메일 입력 확인 | ✅ |
| D12 | 코치 삭제 — 모든 조회에서 deleted_at IS NULL 필터 | ✅ |
| D13 | 투입 이력 — 수동 등록 (평가/재고용/피드백 포함) | ✅ |
| D14 | 문서 탭 — 파일 업로드/다운로드/삭제 UI | ✅ |
| D15 | 코치 고유 링크 토큰 생성 + 재발급 | ✅ |

---

## E. 검증 & 마무리

| # | 작업 | 상태 |
|---|------|------|
| E1 | 빌드 에러 수정 (scripts/ 타입 에러 2건) | ❌ |
| E2 | E2E — 코치뷰 스케줄 입력 → 대시보드 반영 | ❌ |
| E3 | E2E — 코치 CRUD (등록/수정/삭제/토큰 재발급) | ❌ |
| E4 | E2E — 투입 이력 등록/수정 (평가 포함) | ❌ |
| E5 | E2E — 문서 업로드/다운로드 (R2 연동 후) | ❌ |
| E6 | E2E — 대시보드 필터 (날짜/분야/평가/시간대) | ❌ |
| E7 | E2E — 코치 목록 검색/필터/다중선택/xlsx 추출 | ❌ |
| E8 | E2E — 새 달 오픈 흐름 | ❌ |
| E9 | 코치 고유 링크 발송 + 접속 테스트 | ❌ |
| E10 | 모바일 코치뷰 테스트 (코치 50명 모바일 비율 높음) | ❌ |
| E11 | 입력 현황 대시보드 — 미접속/접속만/입력완료 표시 검증 | ❌ |

---

## 요약

| 구분 | 전체 | 완료 | 미완료 |
|------|------|------|--------|
| 인프라 (A) | 9 | 3 | 6 |
| API (B) | 19 | 19 | 0 |
| 화면 (C) | 7 | 7 | 0 |
| 비즈니스 로직 (D) | 15 | 14 | 1 |
| 검증 & 마무리 (E) | 11 | 0 | 11 |
| **합계** | **61** | **43** | **18** |
