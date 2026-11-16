import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import UrbanStorytelling from './assist-urban/UrbanStorytelling'

/** Standalone boot: URBAN ASSIST is the whole app — no suite, no fork chrome. */
const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <UrbanStorytelling />
  </React.StrictMode>,
)
