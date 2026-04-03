# 프로덕션 준비사항

> 2026-03-28 작성 | 사내 도구 기준 (사용자 소수, @day1company.co.kr 제한)

## 판단 기준

사내 도구이므로 SEO, rate limiting, CORS, 구조화된 로깅 등은 불필요.
**사용자 경험 + 기본 보안 + 개발자 경험**에 집중.

---

## 1. 에러 페이지 — 필수

**문제**: error.tsx, not-found.tsx, global-error.tsx 없음. 에러 발생 시 Next.js 기본 화면 노출.

**해결**: 앱 스타일에 맞는 에러 페이지 3개 생성

| 파일 | 용도 |
|------|------|
| `src/app/not-found.tsx` | 404 — 잘못된 URL |
| `src/app/error.tsx` | 500 — 라우트 내 에러 |
| `src/app/global-error.tsx` | 루트 레이아웃 에러 (fallback) |

**상태**: [x] 완료

---

## 2. 보안 헤더 — 필수

**문제**: `next.config.ts`가 비어있음. 기본 보안 헤더 없음.

**해결**: 다음 헤더 추가

| 헤더 | 값 | 용도 |
|------|------|------|
| X-Frame-Options | SAMEORIGIN | 클릭재킹 방지 |
| X-Content-Type-Options | nosniff | MIME 스니핑 방지 |
| Referrer-Policy | strict-origin-when-cross-origin | 리퍼러 정보 제한 |
| X-DNS-Prefetch-Control | on | DNS 프리페치 허용 |

**상태**: [x] 완료

---

## 3. .env.example — 필수

**문제**: 환경변수 템플릿 없음. 다른 개발자가 어떤 변수가 필요한지 알 수 없음.

**해결**: `.env.example` 생성 (비밀값은 빈 문자열)

**상태**: [x] 완료

---

## 4. silent catch 정리 — 필수

**문제**: 클라이언트 코드 전반에 `catch { }` 또는 `catch { /* */ }` 패턴. 에러가 발생해도 무시됨.

**해결**: 빈 catch에 `console.error` 추가. 사용자에게 보이지 않지만 디버깅 가능.

**상태**: [x] 완료

---

## 5. 백엔드 보안 — 필수

### 5-1. 코치 삭제 권한 체크

**문제**: `DELETE /api/coaches/:id`에 admin 체크 없음. 아무 매니저가 삭제 가능.

**해결**: `auth.manager.role !== 'admin'` 체크 추가

**파일**: `src/app/api/coaches/[id]/route.ts`

**상태**: [x] 완료

### 5-2. 파일 업로드 용량 제한

**문제**: 문서 업로드에 파일 크기 제한 없음. 무제한 업로드 가능.

**해결**: 50MB 제한 추가 (413 응답)

**파일**: `src/app/api/coaches/[id]/documents/route.ts`

**상태**: [x] 완료

### 5-3. status 필드 enum 검증

**문제**: 코치 생성 시 `status: (status as any)` — enum 검증 없이 아무 값이나 들어감.

**해결**: `['active', 'inactive', 'pending']` 화이트리스트 검증으로 교체

**파일**: `src/app/api/coaches/route.ts`

**상태**: [x] 완료

### 향후 고려 (의도된 트레이드오프)

| 항목 | 현재 상태 | 이유 |
|------|-----------|------|
| 토큰이 URL 쿼리에 포함 | 메일 머지 링크 기능 | 코치에게 보내는 링크 자체가 인증 수단 |
| accessToken API 응답 포함 | admin 링크 관리 기능 | admin만 접근하는 엔드포인트 |
| hiredBy가 name 기반 | DB 마이그레이션 필요 | ID 기반으로 변경 시 기존 데이터 처리 필요 |

---

## 6. 배포/운영 — 필수

### 6-1. Health check 엔드포인트

**문제**: 호스팅 플랫폼이 앱 상태를 모름. 앱이 죽어도 재시작 불가.

**해결**: `GET /api/health` — DB 연결 확인 후 `{ status: "ok" }` 또는 503 반환. middleware에서 인증 제외.

**파일**: `src/app/api/health/route.ts`, `src/middleware.ts`

**상태**: [x] 완료

### 6-2. robots.txt

**문제**: 크롤러가 `/api/`, `/admin` 등 모든 경로에 접근 가능.

**해결**: `public/robots.txt` — 주요 경로 Disallow

**상태**: [x] 완료

### 6-3. 배포 시 마이그레이션 자동 실행

**문제**: 스키마 변경 후 배포하면 코드는 새건데 DB는 옛날 → 앱 크래시.

**해결**: build 스크립트에 `prisma migrate deploy` 추가

**상태**: [x] 완료

### 6-4. db:push 프로덕션 차단

**문제**: `npm run db:push`를 프로덕션 DB에서 실행하면 마이그레이션 히스토리 없이 스키마가 직접 변경됨.

**해결**: DATABASE_URL에 `proxy.rlwy.net`(Railway 프로덕션) 포함 시 실행 차단, 에러 메시지 출력.

**파일**: `package.json` db:push 스크립트

**상태**: [x] 완료

### 6-5. DB 백업 스크립트

**문제**: 백업 전략 없음. Railway 자동 백업에만 의존.

**해결**: `scripts/backup-db.sh` — pg_dump + gzip, 로컬/프로덕션 선택, 30일 자동 정리

**사용법**:
- 로컬: `./scripts/backup-db.sh`
- 프로덕션: `DATABASE_URL=postgresql://... ./scripts/backup-db.sh production`

**추가 권장**: Railway 대시보드에서 자동 백업 활성화 여부 확인

**상태**: [x] 완료

---

## 이 앱에서 불필요한 것 (근거)

| 항목 | 불필요 근거 |
|------|-------------|
| Rate limiting | 사내 도메인 제한 + 인증 필수 |
| CORS | Next.js same-origin |
| SEO / Open Graph | 사내 도구 |
| 구조화된 로깅 (pino 등) | 사용자 적음, sync 로그는 DB에 있음 |
| Sentry | 사용자가 직접 피드백 가능한 규모 |
| 접근성 (WCAG) | 사내 도구, 접근성 요구사항 없음 |
