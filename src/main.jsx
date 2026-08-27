import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './theme.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* BASE_URL is Vite's built-in env var reflecting vite.config.js's `base` -- "/" in dev,
        "/Seahawks_HQ/" in production builds. Without this, React Router matches routes against
        the full deployed path and renders blank on GitHub Pages while working fine locally
        (same fix CFB_top25 needed). */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
