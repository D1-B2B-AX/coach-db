import { prisma } from './prisma'

interface PushPayload {
  title: string
  body: string
  data?: Record<string, unknown>
}

let webPushModule: any = null

const VAPID_PUBLIC_KEY_FALLBACK = "BFdCXg-S6okkuTCoW1TxrMCnRzOQ9ijC7o7laIXgr8kb5FP7EIsnkC-vW5liufT9cFFATbqfxGFOZAoFiv2ETDE"

async function getWebPush() {
  if (!process.env.VAPID_PRIVATE_KEY) {
    console.warn("[Push] VAPID_PRIVATE_KEY not set, skipping push")
    return null
  }
  if (!webPushModule) {
    webPushModule = await import('web-push')
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY_FALLBACK
    console.log("[Push] setVapidDetails with public key:", publicKey.slice(0, 20) + "...")
    webPushModule.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@day1company.co.kr',
      publicKey,
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

  console.log(`[Push] sending to ${subscriptions.length} subscription(s)`, where)
  const results = await Promise.allSettled(subscriptions.map((sub) => sendPush(sub, payload)))
  for (const r of results) {
    if (r.status === "rejected") console.error("[Push] send failed:", r.reason)
  }
}
