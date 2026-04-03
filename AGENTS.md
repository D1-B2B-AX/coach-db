# Coach DB

실습코치 관리 웹앱 — 교육 프로그램 매니저들이 코치 정보를 한 곳에서 조회·탐색·연락하는 도구.

## 현재 상태

MVP 1차 구현 완료. Supabase 연결 + 구글시트 동기화 정상 동작 (코치 81명, 투입이력 327건, 과정 43개).

## 주요 문서

- 설계: `docs/plans/2026-03-13-coach-manager-design.md`
- 구현 계획: `docs/plans/2026-03-13-coach-manager-implementation.md`
- 의사결정 로그: `docs/plans/decisions.md`

## 기술 스택

Next.js 16 (App Router) + Tailwind CSS v4 + Prisma + PostgreSQL (Railway) + NextAuth v5 (Google OAuth) + Google Drive API + xlsx

## 핵심 컨벤션

- 한국어 UI, 코드는 영어
- NextAuth v5 + @auth/prisma-adapter로 인증 (@day1company.co.kr 도메인 제한)
- 구글시트 동기화 키: 사번 (`employee_id`, D열)
- 가용 여부: 3상태 enum (available/unavailable/unknown), 앱에서 수동 입력 (D-029)
- 코치 = 조교 (동일 개념, 단일 테이블) (D-004)

## 문서 갱신 규칙

| 문서 | 갱신 시점 |
|------|-----------|
| design doc | Clarify에서 스펙 변경 시 직접 수정 (git이 원본 보존) |
| decisions.md | 매 Clarify 라운드에서 결정 변경 시 |
| implementation plan | Build 중 Task 완료/변경 시 체크박스 갱신 |
| AGENTS.md (이 파일) | 상태 변경 시 |
