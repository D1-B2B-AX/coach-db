import type { ScoutingStatus } from '@/generated/prisma/client'

type Actor = 'manager' | 'coach'

interface Transition {
  from: ScoutingStatus
  to: ScoutingStatus
  actor: Actor
}

const VALID_TRANSITIONS: Transition[] = [
  { from: 'scouting', to: 'accepted', actor: 'coach' },
  { from: 'scouting', to: 'rejected', actor: 'coach' },
  { from: 'scouting', to: 'cancelled', actor: 'manager' },
  { from: 'accepted', to: 'confirmed', actor: 'manager' },
  { from: 'accepted', to: 'cancelled', actor: 'manager' },
  // rejected는 최종 상태 — 같은 날짜 재섭외 불가, 새 날짜로 별도 생성
  { from: 'confirmed', to: 'confirmed', actor: 'manager' },
  { from: 'confirmed', to: 'cancelled', actor: 'manager' },
  { from: 'cancelled', to: 'scouting', actor: 'manager' },
]

export function canTransition(
  current: ScoutingStatus,
  target: ScoutingStatus,
  actor: Actor,
): boolean {
  return VALID_TRANSITIONS.some(
    (t) => t.from === current && t.to === target && t.actor === actor,
  )
}

export type NotificationTrigger = {
  type: string
  recipientRole: 'manager' | 'coach'
  messageTemplate: string
  clickUrlPattern: string
}

const TRIGGER_MAP: Record<string, NotificationTrigger | null> = {
  // T1: 섭외 생성 (POST 신규 or 복원) — 별도 호출, 여기는 상태 전이 기준
  'scouting->accepted': {
    type: 'coach_accepted',
    recipientRole: 'manager',
    messageTemplate: '{coachName}님이 {date} 섭외를 수락했습니다',
    clickUrlPattern: '/coaches/{coachId}',
  },
  'scouting->rejected': {
    type: 'coach_rejected',
    recipientRole: 'manager',
    messageTemplate: '{coachName}님이 {date} 섭외를 거절했습니다',
    clickUrlPattern: '/coaches/{coachId}',
  },
  'scouting->cancelled': null, // 알림 비생성 (대신 기존 T1 만료)
  'accepted->confirmed': {
    type: 'engagement_confirmed',
    recipientRole: 'coach',
    messageTemplate: '{date} 투입이 확정되었습니다 ({courseName})',
    clickUrlPattern: '/coach?token={accessToken}',
  },
  'accepted->cancelled': null, // v2 범위 밖
  // rejected는 최종 상태 — 전이 없음
  'confirmed->cancelled': {
    type: 'engagement_cancelled',
    recipientRole: 'coach',
    messageTemplate: '{date} 투입이 취소되었습니다',
    clickUrlPattern: '/coach?token={accessToken}',
  },
  'cancelled->scouting': null, // T1과 동일 — POST 토글에서 별도 처리
}

/**
 * 상태 전이에 따른 알림 트리거 규칙 조회.
 * T1(섭외 생성)은 POST 라우트에서 별도 호출하므로 여기서는 null.
 */
export function getNotificationTrigger(
  from: ScoutingStatus,
  to: ScoutingStatus,
): NotificationTrigger | null {
  const key = `${from}->${to}`
  return TRIGGER_MAP[key] ?? null
}

/** T1 트리거 — 섭외 생성/복원 시 코치에게 알림 */
export const SCOUTING_REQUEST_TRIGGER: NotificationTrigger = {
  type: 'scouting_request',
  recipientRole: 'coach',
  messageTemplate: '{managerName}님이 {date} 섭외를 요청했습니다',
  clickUrlPattern: '/coach?token={accessToken}',
}
