import React from 'react'
import ReactDOM from 'react-dom/client'

// Bundled locally so the app renders correctly offline. Imported from JS rather
// than via CSS @import so Vite rewrites the url()s and emits the .woff2 files.
import '@fontsource-variable/archivo/index.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
