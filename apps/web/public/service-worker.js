// SpeakReady Service Worker - Aggressive Caching for Performance
const CACHE_VERSION = 'speakready-v2'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// Cache these URLs immediately on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Cache duration (7 days for dynamic content)
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Precaching static assets')
      return cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })))
    }).then(() => {
      console.log('[SW] Skip waiting')
      return self.skipWaiting()
    })
  )
})

// Activate event - clean up old caches and enable navigation preload
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('speakready-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      }),
      // Enable navigation preload for faster page loads
      self.registration.navigationPreload?.enable().catch(() => {
        console.log('[SW] Navigation preload not supported')
      })
    ]).then(() => {
      console.log('[SW] Claiming clients')
      return self.clients.claim()
    })
  )
})

// Fetch event - serve from cache with network fallback and stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip caching for:
  // - API calls (always fresh)
  // - WebSocket connections
  // - Chrome extensions
  // - Non-GET requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.hostname !== location.hostname
  ) {
    return
  }

  // Use navigation preload for page navigations
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse
          if (preloadResponse) {
            console.log('[SW] Using navigation preload')
            return preloadResponse
          }
          return fetch(request)
        } catch (error) {
          const cachedResponse = await caches.match(request)
          if (cachedResponse) {
            console.log('[SW] Offline: serving from cache')
            return cachedResponse
          }
          throw error
        }
      })()
    )
    return
  }

  // For static assets: Cache-first with network fallback
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Cache hit (static):', url.pathname)
          return cachedResponse
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone()
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return networkResponse
        }).catch((error) => {
          console.error('[SW] Fetch failed:', error)
          throw error
        })
      })
    )
    return
  }

  // For dynamic content: Stale-while-revalidate (serve cache, update in background)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            console.log('[SW] Updating cache:', url.pathname)
            cache.put(request, responseClone)
          })
        }
        return networkResponse
      }).catch(() => cachedResponse) // Fallback to cache on network error

      // Return cached response immediately, network response will update cache in background
      if (cachedResponse) {
        console.log('[SW] Stale-while-revalidate:', url.pathname)
        return cachedResponse
      }

      // No cache, wait for network
      return fetchPromise
    })
  )
})

// Helper: Check if URL is a static asset
function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.ico']
  return staticExtensions.some(ext => url.pathname.endsWith(ext))
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message')
    self.skipWaiting()
  }
})
