// Service Worker for Web Push notifications

self.addEventListener('push', (event) => {
  if (!event.data) return

  const payload = event.data.json()
  const options = {
    body: payload.body,
    data: payload.data || {},
    icon: '/title.png',
    badge: '/title.png',
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const clickUrl = event.notification.data?.clickUrl || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(clickUrl)
          return client.focus()
        }
      }
      return clients.openWindow(clickUrl)
    })
  )
})
