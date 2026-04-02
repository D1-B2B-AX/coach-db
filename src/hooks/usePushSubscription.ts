"use client"

import { useState, useEffect, useCallback } from "react"

type SubscriptionState = "prompt" | "granted" | "denied" | "unsupported"

export function usePushSubscription(apiPath: string) {
  const [state, setState] = useState<SubscriptionState>(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return "unsupported"
    }
    const perm = Notification.permission
    return perm === "default" ? "prompt" : perm === "granted" ? "granted" : "denied"
  })
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (state !== "granted") return
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub)
      })
    })
  }, [state])

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

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BFdCXg-S6okkuTCoW1TxrMCnRzOQ9ijC7o7laIXgr8kb5FP7EIsnkC-vW5liufT9cFFATbqfxGFOZAoFiv2ETDE"
      if (!vapidKey) {
        console.warn("[Push] VAPID key not set")
        return false
      }

      // base64url → Uint8Array 변환 (pushManager.subscribe 요구사항)
      const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4)
      const base64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/")
      const rawData = atob(base64)
      const applicationServerKey = new Uint8Array(rawData.length)
      for (let i = 0; i < rawData.length; i++) {
        applicationServerKey[i] = rawData.charCodeAt(i)
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
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

      console.log("[Push] subscribed successfully:", json.endpoint?.slice(0, 50))
      setSubscribed(true)
      return true
    } catch (e) {
      console.error("[Push] subscribe failed:", e)
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
