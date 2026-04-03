# 확정 시 구글시트 행 추가 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 마이페이지에서 컨택 → 확정 시, 구글시트 "조교실습코치_일반계약요청" 탭에 행을 자동 추가

**Architecture:** Sheets API v4 `values.append()`로 마지막 행에 추가. PATCH /api/scoutings/:id에서 status=confirmed일 때 코치/매니저 정보를 조합해 시트에 쓴다.

**Tech Stack:** googleapis (Sheets API v4), Next.js API Route

---

### Task 1: 구글시트 쓰기 유틸 함수

**Files:**
- Modify: `src/lib/google-sheets.ts`

시트 행 추가 함수 `appendEngagementRow()` — Sheets API v4 `values.append()` 사용. 스코프를 `spreadsheets` (읽기+쓰기)로 설정.

컬럼 매핑 (A~Q):
- A: 빈칸 (계약서발송)
- B: 빈칸 (신규조교)
- C: 빈칸 (No.)
- D: coach.employeeId (사번)
- E: coach.name (성명)
- F: coach.workType (담당직무)
- G: manager.name (담당Manager)
- H: courseName (과정명 — UI에서 입력)
- I: 빈칸 (시급)
- J: scouting.date (고용시작일)
- K: 빈칸 (고용종료일)
- L: 빈칸 (퇴사일)
- M: 빈칸 (근로시간)
- N: coach.email
- O: coach.phone
- P: phone 끝 4자리
- Q: 빈칸 (비고)

### Task 2: PATCH API 수정

**Files:**
- Modify: `src/app/api/scoutings/[id]/route.ts`

status=confirmed 시 코치+매니저 정보 조회 후 `appendEngagementRow()` 호출. `courseName` 파라미터 추가 수신.

### Task 3: 마이페이지 UI — 확정 시 과정명 입력

**Files:**
- Modify: `src/app/(manager)/mypage/page.tsx`

확정 버튼 → 과정명 입력 프롬프트(인라인 또는 모달) → 입력 후 PATCH 호출.
