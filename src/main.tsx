import React from 'react'
import ReactDOM from 'react-dom/client'
import ClipboardApp from './windows/ClipboardApp.tsx'
import ChatApp from './windows/ChatApp.tsx'
import LauncherApp from './windows/LauncherApp.tsx'
import ScreenshotApp from './windows/ScreenshotApp.tsx'
import SettingsApp from './windows/SettingsApp.tsx'
import './index.css'

type RendererWindowType = 'settings' | 'launcher' | 'clipboard' | 'screenshot' | 'chat'

const WINDOW_COMPONENTS: Record<RendererWindowType, React.ComponentType> = {
  settings: SettingsApp,
  launcher: LauncherApp,
  clipboard: ClipboardApp,
  screenshot: ScreenshotApp,
  chat: ChatApp,
}

function resolveWindowType(): RendererWindowType {
  const searchParams = new URLSearchParams(window.location.search)
  const param = searchParams.get('window')
  if (isRendererWindowType(param)) {
    return param
  }
  if (isRendererWindowType(window.wolong?.window.current)) {
    return window.wolong.window.current
  }
  return 'settings'
}

function isRendererWindowType(value: unknown): value is RendererWindowType {
  return (
    value === 'settings' ||
    value === 'launcher' ||
    value === 'clipboard' ||
    value === 'screenshot' ||
    value === 'chat'
  )
}

const RootComponent = WINDOW_COMPONENTS[resolveWindowType()]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
)
