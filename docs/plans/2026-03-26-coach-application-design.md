# 코치 신청 + 프로필 편집 설계

## 개요

구글폼으로 받는 코치 신청을 사이트 관리자 페이지에서 승인/관리하고, 코치뷰에서 프로필 수정이 가능하도록 함.

## 흐름

1. 코치가 구글폼으로 신청 → 구글시트에 응답 쌓임
2. 관리자 페이지에서 "동기화" → 시트에서 신청 데이터 가져옴 → Coach (status: pending) 생성
3. 매니저가 신청 목록 확인 → 승인/거절
4. 승인 → status: active + 스케줄 입력 링크 발급
5. 코치가 코치뷰에서 프로필 수정 가능

## 스키마 변경

- `CoachStatus` enum에 `pending` 추가 (pending → active → inactive → soft delete)
- 새 필드 추가 없음 — 기존 필드 활용

## 구글폼 → DB 필드 매핑

| 구글폼 항목 | DB 필드 |
|---|---|
| 이름 | `Coach.name` |
| 핸드폰 | `Coach.phone` |
| 이메일 | `Coach.email` |
| 수행 업무 (운영조교/실습코치) | `Coach.workType` |
| 근무 가능 기간 + 세부 | `Coach.availabilityDetail` |
| 교육 분야 + 가능 분야 | `CoachField` (N:N) |
| 보유 스킬 | `CoachCurriculum` (N:N) |
| 희망 교육 형태 | `Coach.managerNote` (메모) |
| 교육 경력 사항 | `Coach.selfNote` (특이사항/히스토리) |
| 기타 요청 사항 | `Coach.selfNote` (특이사항/히스토리) |
| 포트폴리오/이력서 | `CoachDocument` (PDF) |

## 구글시트 소스

- URL: https://docs.google.com/spreadsheets/d/1xrkRqw3niREpZRIYuB6cEjOGm7Y45bEWkqP02vESR20/edit?gid=595732808
- 동기화 방식: 관리자 페이지에서 수동 "동기화" 버튼

## 구현 항목

### 1. 관리자 페이지 — 신청 관리 탭
- "동기화" 버튼 → 구글시트에서 새 행 가져옴
- 중복 체크 (이름+연락처)
- 새 신청 → Coach 생성 (status: pending)
- 신청 목록: pending 코치만 표시
- "승인" → status: active + accessToken 생성 + 스케줄 링크 발급
- "거절" → soft delete 또는 status: inactive

### 2. 코치뷰 프로필 편집
- 스케줄 입력 페이지에 "프로필" 섹션 추가
- 수정 가능: 핸드폰, 수행 업무, 교육 분야, 보유 스킬, 근무 가능 기간/세부, 포트폴리오
- `/api/coach/me` PUT API 추가

### 3. 매니저 폼 확장
- CoachForm의 교육 분야/보유 스킬 선택지를 구글폼 항목과 일치

### 4. 고정 선택지 목록

**교육 분야 (Field):**
- 개발 / 프로그래밍, 데이터 사이언스, 인공지능, 자동화 & 업무생산성, 디자인
- 프론트엔드, 백엔드, 모바일 앱 개발, 데이터분석, 데이터엔지니어링
- 머신러닝, 딥러닝, 클라우드 & 데브옵스, 업무자동화, OA활용
- ChatGPT & 생성형AI, UI/UX

**보유 스킬 (Curriculum):**
- Python 기초, Python 심화, Java, R, C++, Kotlin, Swift
- HTML/CSS/JavaScript, React/Vue.js/Next.js, Node.js
- Django/Flask, Spring/Springboot, Hadoop/Spark
- Git/GitHub, Orange3, SQL, 확률통계
- Tableau/PowerBI, OA (PPT/Excel)
- Docker/Kubernetes, AWS/Azure/GCP, Figma, Photoshop
