import { describe, it, expect } from 'vitest'
import { canTransition, getNotificationTrigger, SCOUTING_REQUEST_TRIGGER } from '../scouting-state-machine'

describe('canTransition', () => {
  // 전이 테이블 8행 검증
  it('scouting -> accepted (coach)', () => {
    expect(canTransition('scouting', 'accepted', 'coach')).toBe(true)
  })

  it('scouting -> rejected (coach)', () => {
    expect(canTransition('scouting', 'rejected', 'coach')).toBe(true)
  })

  it('scouting -> cancelled (manager)', () => {
    expect(canTransition('scouting', 'cancelled', 'manager')).toBe(true)
  })

  it('accepted -> confirmed (manager)', () => {
    expect(canTransition('accepted', 'confirmed', 'manager')).toBe(true)
  })

  it('accepted -> cancelled (manager)', () => {
    expect(canTransition('accepted', 'cancelled', 'manager')).toBe(true)
  })

  it('rejected -> scouting (manager)', () => {
    expect(canTransition('rejected', 'scouting', 'manager')).toBe(true)
  })

  it('confirmed -> confirmed (manager) — 수정 재확정', () => {
    expect(canTransition('confirmed', 'confirmed', 'manager')).toBe(true)
  })

  it('confirmed -> cancelled (manager)', () => {
    expect(canTransition('confirmed', 'cancelled', 'manager')).toBe(true)
  })

  it('cancelled -> scouting (manager)', () => {
    expect(canTransition('cancelled', 'scouting', 'manager')).toBe(true)
  })

  // 차단된 전이
  it('scouting -> accepted (manager) is blocked', () => {
    expect(canTransition('scouting', 'accepted', 'manager')).toBe(false)
  })

  it('scouting -> confirmed (manager) is blocked — 직접 전이 차단', () => {
    expect(canTransition('scouting', 'confirmed', 'manager')).toBe(false)
  })

  it('confirmed -> accepted (coach) is blocked', () => {
    expect(canTransition('confirmed', 'accepted', 'coach')).toBe(false)
  })

  it('accepted -> rejected (coach) is blocked', () => {
    expect(canTransition('accepted', 'rejected', 'coach')).toBe(false)
  })

  it('cancelled -> confirmed (manager) is blocked', () => {
    expect(canTransition('cancelled', 'confirmed', 'manager')).toBe(false)
  })
})

describe('getNotificationTrigger', () => {
  // T2: 코치 수락 -> 매니저에게
  it('scouting -> accepted returns coach_accepted for manager', () => {
    const trigger = getNotificationTrigger('scouting', 'accepted')
    expect(trigger).not.toBeNull()
    expect(trigger!.type).toBe('coach_accepted')
    expect(trigger!.recipientRole).toBe('manager')
  })

  // T3: 코치 거절 -> 매니저에게
  it('scouting -> rejected returns coach_rejected for manager', () => {
    const trigger = getNotificationTrigger('scouting', 'rejected')
    expect(trigger).not.toBeNull()
    expect(trigger!.type).toBe('coach_rejected')
    expect(trigger!.recipientRole).toBe('manager')
  })

  // T4: 투입 확정 -> 코치에게
  it('accepted -> confirmed returns engagement_confirmed for coach', () => {
    const trigger = getNotificationTrigger('accepted', 'confirmed')
    expect(trigger).not.toBeNull()
    expect(trigger!.type).toBe('engagement_confirmed')
    expect(trigger!.recipientRole).toBe('coach')
  })

  // T5: 확정 취소 -> 코치에게
  it('confirmed -> cancelled returns engagement_cancelled for coach', () => {
    const trigger = getNotificationTrigger('confirmed', 'cancelled')
    expect(trigger).not.toBeNull()
    expect(trigger!.type).toBe('engagement_cancelled')
    expect(trigger!.recipientRole).toBe('coach')
  })

  // 알림 비생성 조건 4건
  it('scouting -> cancelled returns null (섭외 철회)', () => {
    expect(getNotificationTrigger('scouting', 'cancelled')).toBeNull()
  })

  it('accepted -> cancelled returns null (v2 범위 밖)', () => {
    expect(getNotificationTrigger('accepted', 'cancelled')).toBeNull()
  })

  it('rejected -> scouting returns null (POST 토글에서 처리)', () => {
    expect(getNotificationTrigger('rejected', 'scouting')).toBeNull()
  })

  it('cancelled -> scouting returns null (POST 토글에서 처리)', () => {
    expect(getNotificationTrigger('cancelled', 'scouting')).toBeNull()
  })

  it('confirmed -> confirmed returns null (수정 재확정, 알림 불필요)', () => {
    expect(getNotificationTrigger('confirmed', 'confirmed')).toBeNull()
  })
})

describe('SCOUTING_REQUEST_TRIGGER (T1)', () => {
  it('has correct type and recipient', () => {
    expect(SCOUTING_REQUEST_TRIGGER.type).toBe('scouting_request')
    expect(SCOUTING_REQUEST_TRIGGER.recipientRole).toBe('coach')
  })
})
