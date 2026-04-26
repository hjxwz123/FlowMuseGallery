import React from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './styles/globals.css'
import { App } from './App'
import { BrowserRouterProvider } from './lib/router'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouterProvider>
      <App />
    </BrowserRouterProvider>
  </React.StrictMode>,
)
