import { prisma } from './prisma'
import type { NotificationTrigger } from './scouting-state-machine'
import { sendMail, buildEmail } from './mailer'

interface CreateNotificationParams {
  trigger: NotificationTrigger
  recipientManagerId?: string
  recipientCoachId?: string
  data: {
    scoutingId: string
    coachId?: string
    managerId?: string
    coachName?: string
    managerName?: string
    managerEmail?: string
    date?: string
    hireStart?: string
    hireEnd?: string
    courseName?: string
    accessToken?: string
    clickUrl: string
  }
}

function renderTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '')
}

function renderClickUrl(
  pattern: string,
  vars: Record<string, string | undefined>,
): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '')
}

export async function createNotification(
  params: CreateNotificationParams,
) {
  const { trigger, recipientManagerId, recipientCoachId, data } = params

  const title = trigger.type === 'scouting_request'
    ? '찜꽁'
    : trigger.type === 'coach_accepted'
      ? '코치 수락'
      : trigger.type === 'coach_rejected'
        ? '코치 거절'
        : trigger.type === 'engagement_confirmed'
          ? '투입 확정'
          : trigger.type === 'engagement_cancelled'
            ? '투입 취소'
            : '알림'

  const body = renderTemplate(trigger.messageTemplate, {
    coachName: data.coachName,
    managerName: data.managerName,
    managerEmail: data.managerEmail,
    managerLabel: data.managerEmail
      ? `${data.managerName || ''}매니저 (${data.managerEmail})`
      : data.managerName,
    date: data.date,
    courseName: data.courseName,
    accessToken: data.accessToken,
  })

  const notification = await prisma.notification.create({
    data: {
      type: trigger.type,
      title,
      body,
      data: data as any,
      managerId: recipientManagerId || null,
      coachId: recipientCoachId || null,
    },
  })

  // Push 발송 (best-effort)
  try {
    const { sendPushToRecipient } = await import('./web-push')
    await sendPushToRecipient({
      managerId: recipientManagerId,
      coachId: recipientCoachId,
      payload: { title, body, data: { clickUrl: data.clickUrl, type: trigger.type } },
    })
  } catch {
    // Push 미설정 또는 실패 — 무시 (DB 알림은 이미 저장됨)
  }

  // Email 발송 (best-effort)
  try {
    const email = buildEmail(trigger.type, {
      managerName: data.managerName,
      managerEmail: data.managerEmail,
      coachName: data.coachName,
      date: data.date,
      courseName: data.courseName,
      clickUrl: data.clickUrl,
    })
    if (email) {
      let recipientEmail: string | null = null
      if (recipientCoachId) {
        const coach = await prisma.coach.findUnique({ where: { id: recipientCoachId }, select: { email: true } })
        recipientEmail = coach?.email ?? null
      } else if (recipientManagerId) {
        const manager = await prisma.manager.findUnique({ where: { id: recipientManagerId }, select: { email: true } })
        recipientEmail = manager?.email ?? null
      }
      if (recipientEmail) {
        await sendMail({ to: recipientEmail, subject: email.subject, body: email.body, replyTo: email.replyTo })
      }
    }
  } catch (emailError) {
    console.error('[notification] Email send failed:', emailError)
  }

  return notification
}

/**
 * 섭외 철회 시 기존 scouting_request 알림을 만료 처리.
 * 코치 UI에서 수락/거절 비활성화됨.
 */
export async function expireScoutingRequestNotifications(scoutingId: string) {
  await prisma.notification.updateMany({
    where: {
      type: 'scouting_request',
      data: { path: ['scoutingId'], equals: scoutingId },
      expiredAt: null,
    },
    data: { expiredAt: new Date() },
  })
}
