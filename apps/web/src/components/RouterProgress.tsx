// Router progress indicator for smooth page transitions
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

export function RouterProgress() {
  const [progress, setProgress] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const location = useLocation()

  useEffect(() => {
    // Start progress bar on location change
    setIsAnimating(true)
    setProgress(0)

    // Animate to 70% quickly
    const timer1 = setTimeout(() => setProgress(70), 100)
    // Slowly crawl to 90%
    const timer2 = setTimeout(() => setProgress(90), 400)
    // Complete the progress bar
    const timer3 = setTimeout(() => setProgress(100), 600)
    // Hide after animation completes
    const timer4 = setTimeout(() => {
      setIsAnimating(false)
      setProgress(0)
    }, 900)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(timer4)
    }
  }, [location.pathname])

  if (!isAnimating) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-blue-600 origin-left transition-all duration-300 ease-out"
      style={{
        transform: `scaleX(${progress / 100})`,
        opacity: progress === 100 ? 0 : 1,
      }}
    />
  )
}
