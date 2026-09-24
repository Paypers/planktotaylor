import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './lib/account' // Starts listening for sign-ins (and magic-link returns) right away.
import './lib/install' // Catches the browser's install offer, which can come before the page has drawn.
import './styles.css'

// The service worker makes the site installable (public/sw.js). Not in development, where it would
// get in the way of Vite's reloading.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // No service worker (private mode, some in-app browsers): the site works the same, just not installable.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
