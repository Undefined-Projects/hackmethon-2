import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { sembrarTextura } from './lib/textura'

const root = document.getElementById('root')!
sembrarTextura(root)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
