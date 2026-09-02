self.addEventListener('install', () => {
  // Activate SW ASAP
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json()
    const options = {
      body: data.body,
      icon: data.icon || '/assets/android/192-192.png',
      badge: '/assets/android/192-192.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/', // allow server to send a deep-link
        dateOfArrival: Date.now(),
      },
    }
    event.waitUntil(self.registration.showNotification(data.title, options))
  }
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Focus if already open
      for (const client of allClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }

      // Otherwise open
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })(),
  )
})
