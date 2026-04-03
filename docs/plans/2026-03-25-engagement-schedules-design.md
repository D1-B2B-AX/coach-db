# engagement_schedules 테이블 설계

## 배경

현재 `coach_schedules` 테이블에 코치 가용 시간과 계약 근무 시간이 구분 없이 저장되어 있음.
대시보드에서 "실제 가용 시간"을 보여주려면 계약으로 확정된 시간을 빼야 하는데, 구분할 방법이 없음.

## 결정

별도 테이블 `engagement_schedules` 신설.

- `coach_schedules`: 코치 가용 시간 (코치 직접 입력 + import 가용 데이터 유지)
- `engagement_schedules`: 계약 확정 근무 시간 (engagement에 종속)

## 스키마

```prisma
model EngagementSchedule {
  id           String     @id @default(uuid())
  engagementId String     @map("engagement_id")
  coachId      String     @map("coach_id")
  date         DateTime   @db.Date
  startTime    String     @map("start_time") @db.VarChar(5)
  endTime      String     @map("end_time") @db.VarChar(5)
  engagement   Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  coach        Coach      @relation(fields: [coachId], references: [id], onDelete: Cascade)

  @@map("engagement_schedules")
}
```

- `onDelete: Cascade`: engagement 삭제/취소 시 함께 삭제
- `coachId`: JOIN 없이 코치별 조회 편의용

## 데이터 이관

기존 engagement의 기간(startDate~endDate) + 시간(startTime/endTime)을 기반으로 `engagement_schedules`에 복사 생성.
`coach_schedules` 기존 데이터는 유지 (가용 시간이므로).

## 영향받는 코드

1. **Prisma 스키마**: `EngagementSchedule` 모델 추가, `Engagement`/`Coach`에 relation 추가
2. **import 스크립트**: engagement 생성 시 `engagement_schedules`에도 저장
3. **대시보드 API** (`/api/schedules/[yearMonth]/[date]`): 실제 가용 = `coach_schedules` - `engagement_schedules`
4. **6개월 근무일 집계**: `engagement_schedules` 기준으로 변경 (실제 근무 일수)
5. **코치 상세 스케줄탭**: 두 테이블 모두 조회, 확정(파랑)/가용(초록) 구분 표시
6. **이관 스크립트**: 기존 engagement 데이터에서 engagement_schedules 생성

## 대시보드 로직

```
실제 가용 = coach_schedules(가용 슬롯) - engagement_schedules(확정 슬롯)
```

시간 슬롯 단위로 비교: 가용 슬롯의 startTime~endTime이 확정 슬롯과 겹치면 제외.
