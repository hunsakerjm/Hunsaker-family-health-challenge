import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { registerServiceWorker } from './lib/pwa/registerServiceWorker'
import { startAutoFlush } from './lib/offline/queue'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Phase 4 PWA/offline entry points: service worker registration and offline queue auto-flush.
registerServiceWorker()
startAutoFlush()
