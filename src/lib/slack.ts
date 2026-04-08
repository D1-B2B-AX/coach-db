const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

export async function sendSlack(text: string) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[slack] SLACK_WEBHOOK_URL not set, skipping')
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  let res: Response
  try {
    res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    console.error('[slack] Webhook failed:', res.status, await res.text())
  }
}
