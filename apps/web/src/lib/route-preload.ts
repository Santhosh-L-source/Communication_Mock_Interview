// Route preloading - load routes on hover for instant navigation
import { lazy, type ComponentType } from 'react'

// Cache of preloaded components
const preloadCache = new Map<string, Promise<any>>()

// Route path to lazy component mapping
export const routePreloaders: Record<string, () => Promise<any>> = {
  '/': () => import('../pages/student/Dashboard'),
  '/practice': () => import('../pages/student/Practice'),
  '/history': () => import('../pages/student/History'),
  '/rubrics': () => import('../pages/student/History'),
  '/interviews': () => import('../pages/student/InterviewSetup'),
  '/staff': () => import('../pages/staff/Staff'),
  '/staff/students': () => import('../pages/staff/Staff'),
  '/staff/integrity': () => import('../pages/staff/Integrity'),
  '/staff/questions': () => import('../pages/staff/Questions'),
  '/staff/reports': () => import('../pages/staff/Reports'),
  '/admin/users': () => import('../pages/admin/Admin'),
  '/admin/setup': () => import('../pages/admin/Admin'),
  '/admin/scores': () => import('../pages/admin/Admin'),
  '/admin/overview': () => import('../pages/admin/Admin'),
}

/**
 * Preload a route's code on hover/focus for instant navigation
 * @param path Route path like "/dashboard" or "/admin/users"
 */
export function preloadRoute(path: string) {
  const preloader = routePreloaders[path]
  if (!preloader) return

  // Already preloaded or in progress
  if (preloadCache.has(path)) return preloadCache.get(path)

  // Start preloading
  const promise = preloader().catch((error) => {
    console.warn(`Failed to preload route ${path}:`, error)
    preloadCache.delete(path) // Allow retry
  })

  preloadCache.set(path, promise)
  return promise
}

/**
 * Preload multiple routes (useful for prefetching common paths)
 * @param paths Array of route paths
 */
export function preloadRoutes(paths: string[]) {
  // Use requestIdleCallback to avoid blocking main thread
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      paths.forEach(preloadRoute)
    }, { timeout: 2000 })
  } else {
    // Fallback for browsers without requestIdleCallback (Safari)
    setTimeout(() => {
      paths.forEach(preloadRoute)
    }, 1)
  }
}

/**
 * Aggressively preload routes on link hover with shorter delay
 * Returns handlers for onMouseEnter and onTouchStart
 */
export function getPreloadHandlers(path: string) {
  let timeout: ReturnType<typeof setTimeout>

  return {
    onMouseEnter: () => {
      // Preload after 50ms hover (faster than default browser idle)
      timeout = setTimeout(() => preloadRoute(path), 50)
    },
    onMouseLeave: () => {
      clearTimeout(timeout)
    },
    onTouchStart: () => {
      // Instant preload on mobile tap
      preloadRoute(path)
    },
  }
}

/**
 * Hook to automatically preload a route on link hover
 * Usage: <Link to="/dashboard" {...getPreloadHandlers('/dashboard')} />
 */
export function useRoutePreload() {
  return { preloadRoute, getPreloadHandlers }
}
