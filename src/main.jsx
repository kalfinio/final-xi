import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))
const render = (Root) => root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

// Vite removes this development-only import from production builds.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('matchVisual') === 'v2') {
  import('./dev/MatchVisualLab.jsx').then(({ default: Lab }) => render(Lab))
} else render(App)
