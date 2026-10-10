import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './lib/auth'
import { register as registerServiceWorker } from './lib/service-worker-registration'

// Start rendering immediately
const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <AuthProvider><App /></AuthProvider>
  </StrictMode>,
)

// Register service worker for caching and offline support (production only)
if (import.meta.env.PROD) {
  registerServiceWorker()
}
