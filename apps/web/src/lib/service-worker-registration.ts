// Service Worker Registration
// Registers the service worker for offline support and caching

export function register() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/service-worker.js'

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('[SW] Service worker registered:', registration.scope)

          // Check for updates every 30 minutes
          setInterval(() => {
            registration.update()
          }, 30 * 60 * 1000)

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (!newWorker) return

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, prompt user to reload
                console.log('[SW] New service worker available')

                // Show update notification (optional - can be customized)
                if (confirm('A new version of SpeakReady is available. Reload to update?')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' })
                  window.location.reload()
                }
              }
            })
          })
        })
        .catch((error) => {
          console.error('[SW] Service worker registration failed:', error)
        })

      // Reload page when service worker takes control
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })
    })
  } else {
    console.log('[SW] Service workers not supported in this browser')
  }
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
        console.log('[SW] Service worker unregistered')
      })
      .catch((error) => {
        console.error('[SW] Error unregistering service worker:', error)
      })
  }
}
