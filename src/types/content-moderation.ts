/**
 * 통합 콘텐츠 피드 정규화 타입
 *
 * 세 데이터 소스를 UnifiedContentItem으로 정규화:
 * - managerNote (coaches.managerNote) -> contentType "memo"
 * - engagement review (engagements.feedback + rating) -> contentType "review"
 * - audit_log (audit_logs.newValue) -> contentType "audit"
 */

export type ContentType = "memo" | "review" | "audit"
export type SourceTable = "coaches" | "engagements" | "audit_logs"

export interface UnifiedContentItem {
  /** 통합 피드 내 고유 ID (소스 레코드 ID) */
  id: string
  /** 콘텐츠 유형: memo(매니저 메모), review(투입 이력 리뷰), audit(수정 이력) */
  contentType: ContentType
  /** 본문 텍스트 */
  text: string | null
  /** audit 전용: 변경 전 값 */
  previousText?: string | null
  /** review 전용: 별점 (1~5) */
  rating?: number | null

  // --- 작성자 ---
  /** 작성자 이름. 불명 시 "알 수 없음" */
  authorName: string
  /**
   * 작성자 매니저 ID.
   * - memo: audit_log에서 가장 최근 managerNote 변경자의 매니저 ID
   * - review: hiredBy 이름으로 managers.findFirst 매칭 (동명이인 시 첫 번째, 부정확 가능성 수용)
   * - audit: changedBy 이메일로 managers.findUnique 매칭
   * - null: 작성자 불명
   */
  authorManagerId: string | null

  // --- 대상 ---
  /** 대상 라벨: memo -> 코치명, review -> "코치명 / 과정명", audit -> "테이블명 필드명" */
  targetLabel: string

  // --- 원본 참조 ---
  /** 원본 레코드 ID */
  sourceRecordId: string
  /** 원본 테이블 */
  sourceTable: SourceTable
  /**
   * 수정 가능한 필드명.
   * - memo: "managerNote"
   * - review: "feedback" | "rating"
   * - audit: null (audit_log 자체는 불변)
   */
  editableField: string | null

  // --- 정렬/시간 ---
  /**
   * 정렬 기준 시각 (ISO string).
   * - memo: audit_log에서 가장 최근 managerNote 변경 createdAt, 없으면 coach.updatedAt
   * - review: engagement.createdAt
   * - audit: auditLog.createdAt
   */
  sortTimestamp: string

  // --- 권한 플래그 ---
  /** 수정 가능 여부: memo/review = true, audit = false */
  canEdit: boolean
  /** 삭제 가능 여부: memo/review = true, audit = false */
  canDelete: boolean
  /** 경고 가능 여부: authorManagerId가 존재하면 true, audit은 항상 false */
  canWarn: boolean

  // --- Phase 2 예약 ---
  /** AI 위험도 플래그. Phase 1에서는 항상 null. Phase 2에서 AI 스크리닝 결과 저장 */
  riskFlag: string | null
}

export interface ContentModerationResponse {
  items: UnifiedContentItem[]
  nextCursor: string | null
}
