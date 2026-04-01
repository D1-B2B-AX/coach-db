import { prisma } from './prisma'

interface PushPayload {
  title: string
  body: string
  data?: Record<string, unknown>
}

let webPushModule: any = null

async function getWebPush() {
  if (!process.env.VAPID_PRIVATE_KEY) return null
  if (!webPushModule) {
    webPushModule = await import('web-push')
    webPushModule.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@day1company.co.kr',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    )
  }
  return webPushModule
}

async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string; id: string },
  payload: PushPayload,
) {
  const wp = await getWebPush()
  if (!wp) return

  try {
    await wp.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    )
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    if (statusCode === 410 || statusCode === 404) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {})
    }
  }
}

export async function sendPushToRecipient({
  managerId,
  coachId,
  payload,
}: {
  managerId?: string
  coachId?: string
  payload: PushPayload
}) {
  const wp = await getWebPush()
  if (!wp) return

  const where: Record<string, string> = {}
  if (managerId) where.managerId = managerId
  else if (coachId) where.coachId = coachId
  else return

  const subscriptions = await prisma.pushSubscription.findMany({
    where,
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })

  await Promise.allSettled(subscriptions.map((sub) => sendPush(sub, payload)))
}
