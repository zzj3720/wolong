import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import fs from 'node:fs'

import { PRELOAD_DIST_PATH, RENDERER_DIST, VITE_DEV_SERVER_URL, APP_ROOT } from './env.js'
import { native } from './native.js'
import type { WindowType } from './types.js'

type WindowEntry = {
  window: BrowserWindow
  ready: Promise<void>
}

const windowEntries = new Map<WindowType, WindowEntry>()
const FOCUS_MANAGED_WINDOWS: ReadonlySet<WindowType> = new Set(['launcher', 'clipboard', 'screenshot'])
const focusRestoreHandles = new Map<WindowType, string | null>()
let isAppQuitting = false

export function markAppQuitting(quitting: boolean) {
  isAppQuitting = quitting
}

export function getWindowEntry(type: WindowType): WindowEntry | undefined {
  const entry = windowEntries.get(type)
  if (!entry) {
    return undefined
  }
  if (entry.window.isDestroyed()) {
    windowEntries.delete(type)
    return undefined
  }
  return entry
}

export function ensureWindow(type: WindowType): WindowEntry {
  const existing = getWindowEntry(type)
  if (existing) {
    return existing
  }

  const options = resolveWindowOptions(type)
  const window = new BrowserWindow(options)

  if (type === 'launcher') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  if (type === 'settings') {
    const notifyState = () => {
      if (window.isDestroyed()) {
        return
      }
      window.webContents.send('settings:window-state', resolveBrowserWindowState(window))
    }

    window.on('maximize', notifyState)
    window.on('unmaximize', notifyState)
    window.on('enter-full-screen', notifyState)
    window.on('leave-full-screen', notifyState)
    window.webContents.once('did-finish-load', notifyState)

    window.on('close', event => {
      if (isAppQuitting) {
        return
      }
      event.preventDefault()
      if (!window.isDestroyed()) {
        window.hide()
        window.setSkipTaskbar(true)
      }
    })

    window.on('show', () => {
      if (!window.isDestroyed()) {
        window.setSkipTaskbar(false)
      }
    })
  } else if (type === 'chat') {
    const notifyState = () => {
      if (window.isDestroyed()) {
        return
      }
      window.webContents.send('chat:window-state', resolveBrowserWindowState(window))
    }

    window.on('maximize', notifyState)
    window.on('unmaximize', notifyState)
    window.on('enter-full-screen', notifyState)
    window.on('leave-full-screen', notifyState)
    window.webContents.once('did-finish-load', notifyState)

    window.on('close', event => {
      if (isAppQuitting) {
        return
      }
      event.preventDefault()
      if (!window.isDestroyed()) {
        window.hide()
        window.setSkipTaskbar(true)
      }
    })

    window.on('show', () => {
      if (!window.isDestroyed()) {
        window.setSkipTaskbar(false)
      }
    })
  }

  const ready = new Promise<void>(resolve => {
    const finish = () => resolve()

    window.webContents.once('did-finish-load', () => {
      if (!window.isDestroyed()) {
        window.webContents.send('app:ready', type)
      }
      finish()
    })

    window.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[window] renderer load failed for ${type}: ${errorDescription} (${errorCode})`)
      finish()
    })
  })

  window.on('closed', () => {
    windowEntries.delete(type)
  })

  loadWindowContent(type, window).catch(error => {
    console.error(`[window] failed to load renderer for ${type}`, error)
  })

  windowEntries.set(type, { window, ready })
  return { window, ready }
}

export async function showWindow(type: WindowType): Promise<BrowserWindow> {
  const perfEnabled = type === 'launcher'
  const perfLabel = '[perf][launcher][main]'
  const perfStart = perfEnabled ? performance.now() : 0
  const logPerf = (stage: string, duration?: number) => {
    if (!perfEnabled) {
      return
    }
    const elapsed = typeof duration === 'number' ? duration : performance.now() - perfStart
    console.log(`${perfLabel} ${stage}: ${elapsed.toFixed(1)}ms`)
  }

  if (FOCUS_MANAGED_WINDOWS.has(type)) {
    try {
      const captured =
        typeof native.captureForegroundWindow === 'function' ? native.captureForegroundWindow() : null
      focusRestoreHandles.set(
        type,
        typeof captured === 'string' && captured.length > 0 ? captured : null,
      )
    } catch (error) {
      focusRestoreHandles.delete(type)
      console.error('[window] capture foreground window failed', error)
    }
  } else {
    focusRestoreHandles.delete(type)
  }

  if (perfEnabled) {
    logPerf('showWindow:start', 0)
  }

  const ensureStart = perfEnabled ? performance.now() : 0
  const entry = ensureWindow(type)
  if (perfEnabled) {
    logPerf('ensureWindow', performance.now() - ensureStart)
  }

  const readyStart = perfEnabled ? performance.now() : 0
  await entry.ready
  if (perfEnabled) {
    logPerf('awaitReady', performance.now() - readyStart)
  }

  const { window } = entry
  if (window.isDestroyed()) {
    windowEntries.delete(type)
    return showWindow(type)
  }

  if (type === 'screenshot') {
    if (!window.isFullScreen()) {
      window.setFullScreen(true)
    }
    window.setAlwaysOnTop(true, 'screen-saver')
  } else if (type === 'launcher' || type === 'clipboard' || type === 'chat') {
    const centerStart = perfEnabled ? performance.now() : 0
    window.center()
    if (perfEnabled) {
      logPerf('window.center', performance.now() - centerStart)
    }
  }

  if ((type === 'settings' || type === 'chat') && !window.isDestroyed()) {
    window.setSkipTaskbar(false)
  }

  if (!window.isVisible()) {
    const showStart = perfEnabled ? performance.now() : 0
    window.show()
    if (perfEnabled) {
      logPerf('window.show', performance.now() - showStart)
    }
  }

  const focusStart = perfEnabled ? performance.now() : 0
  window.focus()
  if (perfEnabled) {
    logPerf('window.focus', performance.now() - focusStart)
    logPerf('total', performance.now() - perfStart)
  }

  if (type === 'chat') {
    window.webContents.send('chat:window-state', resolveBrowserWindowState(window))
  } else if (type === 'settings') {
    window.webContents.send('settings:window-state', resolveBrowserWindowState(window))
  }

  return window
}

export function hideWindow(type: WindowType) {
  const entry = getWindowEntry(type)
  if (!entry) {
    return
  }

  const { window } = entry
  if (window.isDestroyed()) {
    windowEntries.delete(type)
    return
  }

  if (type === 'screenshot') {
    window.setFullScreen(false)
    window.setAlwaysOnTop(false, 'screen-saver')
  }

  window.hide()

  if ((type === 'settings' || type === 'chat') && !window.isDestroyed()) {
    window.setSkipTaskbar(true)
  }

  if (FOCUS_MANAGED_WINDOWS.has(type)) {
    const handle = focusRestoreHandles.get(type)
    focusRestoreHandles.delete(type)
    if (handle) {
      try {
        native.focusWindow(handle)
      } catch (error) {
        console.error('[window] focus restore failed', error)
      }
    }
  }
}

export async function sendToRenderer(type: WindowType, channel: string, ...payload: unknown[]): Promise<void> {
  const entry = getWindowEntry(type)
  if (!entry) {
    return
  }
  await entry.ready
  if (!entry.window.isDestroyed()) {
    entry.window.webContents.send(channel, ...payload)
  }
}

export function clearWindowEntries() {
  windowEntries.clear()
  focusRestoreHandles.clear()
}

export type WindowPresentationState = 'normal' | 'maximized' | 'fullscreen'

export function minimizeWindow(type: WindowType): void {
  const entry = getWindowEntry(type)
  if (!entry) {
    return
  }
  entry.window.minimize()
}

export function toggleMaximizeWindow(type: WindowType): void {
  const entry = getWindowEntry(type)
  if (!entry) {
    return
  }
  const target = entry.window
  if (target.isFullScreen()) {
    target.setFullScreen(false)
  } else if (target.isMaximized()) {
    target.unmaximize()
  } else {
    target.maximize()
  }
}

export function getWindowState(type: WindowType): WindowPresentationState {
  const entry = getWindowEntry(type)
  if (!entry) {
    return 'normal'
  }
  return resolveBrowserWindowState(entry.window)
}

function resolveWindowIcon(): string | undefined {
  const searchPaths: string[] = []

  if (process.platform === 'win32') {
    searchPaths.push(path.join(APP_ROOT, 'build', 'icon.ico'))
    searchPaths.push(path.join(process.resourcesPath ?? '', 'build', 'icon.ico'))
    searchPaths.push(path.join(process.resourcesPath ?? '', 'icon.ico'))
  } else {
    searchPaths.push(path.join(APP_ROOT, 'build', 'icon.png'))
    searchPaths.push(path.join(process.resourcesPath ?? '', 'build', 'icon.png'))
  }

  searchPaths.push(path.join(RENDERER_DIST, 'wolong.svg'))

  for (const candidate of searchPaths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

function resolveWindowOptions(type: WindowType): BrowserWindowConstructorOptions {
  const iconPath = resolveWindowIcon()
  const base: BrowserWindowConstructorOptions = {
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_DIST_PATH,
    },
  }
  
  if (iconPath) {
    base.icon = iconPath
  }

  switch (type) {
    case 'settings':
      return {
        ...base,
        width: 960,
        height: 640,
        minWidth: 720,
        minHeight: 480,
        resizable: true,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#111827',
        webPreferences: {
          ...base.webPreferences,
          backgroundThrottling: false,
        },
      }
    case 'launcher':
      return {
        ...base,
        width: 900,
        height: 600,
        frame: false,
        resizable: false,
        transparent: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#111827',
        hasShadow: false,
        webPreferences: {
          ...base.webPreferences,
          backgroundThrottling: false,
        },
      }
    case 'clipboard':
      return {
        ...base,
        width: 900,
        height: 600,
        frame: false,
        resizable: false,
        transparent: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#111827',
        hasShadow: false,
        webPreferences: {
          ...base.webPreferences,
          backgroundThrottling: false,
        },
      }
    case 'screenshot':
      return {
        ...base,
        frame: false,
        fullscreen: true,
        resizable: false,
        transparent: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: true,
        backgroundColor: '#00000000',
      }
    case 'chat':
      return {
        ...base,
        width: 920,
        height: 680,
        minWidth: 720,
        minHeight: 480,
        resizable: true,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#111827',
        webPreferences: {
          ...base.webPreferences,
          backgroundThrottling: false,
        },
      }
    default:
      return base
  }
}

async function loadWindowContent(type: WindowType, window: BrowserWindow): Promise<void> {
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    url.searchParams.set('window', type)
    await window.loadURL(url.toString())
    return
  }

  await window.loadFile(path.join(RENDERER_DIST, 'index.html'), {
    query: { window: type },
  })
}

function resolveBrowserWindowState(window: BrowserWindow): WindowPresentationState {
  if (window.isFullScreen()) {
    return 'fullscreen'
  }
  if (window.isMaximized()) {
    return 'maximized'
  }
  return 'normal'
}

