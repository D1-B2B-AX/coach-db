"use client"

import { useState, useEffect, useCallback } from "react"

type SubscriptionState = "prompt" | "granted" | "denied" | "unsupported"

export function usePushSubscription(apiPath: string) {
  const [state, setState] = useState<SubscriptionState>("unsupported")
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported")
      return
    }

    const perm = Notification.permission
    setState(perm === "default" ? "prompt" : perm === "granted" ? "granted" : "denied")

    if (perm === "granted") {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setSubscribed(!!sub)
        })
      })
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return false

    try {
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState("denied")
        return false
      }
      setState("granted")

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) return false

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })

      const json = sub.toJSON()
      await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      })

      setSubscribed(true)
      return true
    } catch {
      return false
    }
  }, [apiPath])

  const unsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch(apiPath, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        })
      }
      setSubscribed(false)
    } catch { /* ignore */ }
  }, [apiPath])

  const isIosSafari = typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone)

  return { state, subscribed, subscribe, unsubscribe, isIosSafari }
}
