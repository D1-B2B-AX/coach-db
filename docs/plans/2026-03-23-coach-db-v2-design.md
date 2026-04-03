# Coach DB v2 — 스케줄 수집 및 코치 관리 설계

> 작성일: 2026-03-23
> 상태: 승인됨
> 기반: 설계문서_1_스케줄_수집_및_코치_관리_v6.md

## 범위

설계문서 #1의 전체 범위. 배정 요청(#2)은 제외.

## 아키텍처

- Next.js 16 App Router + Tailwind CSS v4
- Railway PostgreSQL (Staging/Production)
- Cloudflare R2 (파일 저장)
- Prisma ORM
- NextAuth (Google OAuth)
- 코치 인증: 64자 토큰 링크

## DB 테이블 (10개)

설계문서 #1 섹션 2 그대로 적용.

## 페이지 (7개)

| 페이지 | URL | 접근 | 핵심 |
|--------|-----|------|------|
| 코치 스케줄 입력 | `/coach?token=` | 코치 | 캘린더 + 30분 시간 선택 |
| 로그인 | `/login` | 공개 | Google OAuth |
| 대시보드 | `/dashboard` | 매니저 | 날짜별 가능 코치 목록 |
| 코치 목록 | `/coaches` | 매니저 | 리스트, 검색, 엑셀 추출 |
| 코치 상세 | `/coaches/:id` | 매니저 | 4탭 (프로필/스케줄/이력/문서) |
| 코치 등록 | `/coaches/new` | 매니저 | 등록 + 토큰 발급 |
| 코치 수정 | `/coaches/:id/edit` | 매니저 | 수정, 토큰 재발급 |

## 보안 정책

- 코치 토큰: 64자 crypto.randomBytes, 무기한, 매니저 수동 재발급
- 링크 = 인증, 화면에 코치 이름 표시로 본인 확인
- 매니저: Google OAuth + @day1company.co.kr
- soft delete + 이메일 확인
- HTTPS 필수

## 디자인 참고

- 코치뷰_일정입력_데모.html의 레이아웃/색상 체계
- 기존 Coach DB v1에서 검증된 패턴 (필터, 검색, 캘린더)

## 기존 코드와의 관계

새로 시작. 기존 코치 데이터는 CSV 마이그레이션.
