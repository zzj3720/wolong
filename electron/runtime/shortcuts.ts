import { BrowserWindow, globalShortcut } from 'electron'
import type { Event, Input, WebContents } from 'electron'

import { deleteSetting, getSetting, setSetting } from '../storage/realm.js'
import { captureScreenshotFrame, cancelActiveScreenshot } from './screenshot.js'
import { hideWindow, sendToRenderer, showWindow } from './windows.js'

const SHORTCUT_NAMES = ['launcher', 'clipboard', 'screenshot'] as const
type ShortcutName = (typeof SHORTCUT_NAMES)[number]

export type ShortcutConfig = Record<ShortcutName, string>

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  launcher: 'Alt+Space',
  clipboard: 'Control+Shift+V',
  screenshot: 'Control+Shift+S',
}

const STORAGE_KEY_PREFIX = 'shortcut.'

let currentConfig: ShortcutConfig | null = null
let pauseDepth = 0
let isPaused = false

type CaptureSession = {
  id: number
  window: BrowserWindow
  beforeInputHandler: (event: Event, input: Input) => void
  systemMenuHandler: (event: Event) => void
  closedHandler: () => void
  hookTeardown: (() => void) | null
  fallbackAccelerators: string[]
}

const captureSessions = new Map<number, CaptureSession>()

const HANDLERS: Record<ShortcutName, () => void> = {
  launcher: () => {
    void (async () => {
      try {
        await showWindow('launcher')
        await sendToRenderer('launcher', 'shortcut:launcher')
      } catch (error) {
        console.error('[shortcut] launcher open failed', error)
      }
    })()
  },
  clipboard: () => {
    void (async () => {
      try {
        await showWindow('clipboard')
        await sendToRenderer('clipboard', 'shortcut:clipboard')
      } catch (error) {
        console.error('[shortcut] clipboard open failed', error)
      }
    })()
  },
  screenshot: () => {
    void (async () => {
      try {
        const frame = await captureScreenshotFrame()
        const window = await showWindow('screenshot')
        window.setAlwaysOnTop(true, 'screen-saver')
        await sendToRenderer('screenshot', 'shortcut:screenshot', frame)
      } catch (error) {
        console.error('[shortcut] screenshot capture failed', error)
        cancelActiveScreenshot()
        hideWindow('screenshot')
      }
    })()
  },
}

export async function registerShortcuts(): Promise<void> {
  const config = await loadShortcutConfig()
  await applyShortcutConfigInternal(config, { failOnError: false })
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
  for (const session of captureSessions.values()) {
    detachCaptureSession(session)
  }
  captureSessions.clear()
  currentConfig = null
  pauseDepth = 0
  isPaused = false
}

export async function getShortcutConfig(): Promise<ShortcutConfig> {
  if (!currentConfig) {
    const config = await loadShortcutConfig()
    await applyShortcutConfigInternal(config, { failOnError: false })
  }
  return cloneConfig(currentConfig!)
}

export async function updateShortcutConfig(patch: Partial<ShortcutConfig>): Promise<ShortcutConfig> {
  const base = await getShortcutConfig()
  const next: ShortcutConfig = cloneConfig(base)

  for (const [name, value] of Object.entries(patch) as Array<[ShortcutName, string]>) {
    if (!SHORTCUT_NAMES.includes(name)) {
      throw new Error(`[shortcut] Unknown shortcut: ${name}`)
    }
    const normalized = normalizeAccelerator(value)
    if (!normalized) {
      throw new Error('[shortcut] Accelerator cannot be empty')
    }
    next[name] = normalized
  }

  validateShortcutConfig(next)
  const applied = await applyShortcutConfigInternal(next, { failOnError: true })
  await persistShortcutConfig(applied)

  return cloneConfig(applied)
}

export async function resetShortcutConfig(): Promise<ShortcutConfig> {
  const defaults = cloneConfig(DEFAULT_SHORTCUTS)
  const applied = await applyShortcutConfigInternal(defaults, { failOnError: true })
  await persistShortcutConfig(applied)
  return applied
}

export async function beginShortcutCapture(webContents: WebContents): Promise<void> {
  if (captureSessions.has(webContents.id)) {
    return
  }

  const window = BrowserWindow.fromWebContents(webContents)
  if (!window || window.isDestroyed()) {
    return
  }

  const contents = window.webContents
  if (contents.isDestroyed()) {
    return
  }

  pauseShortcutHandlers()

  const id = contents.id
  const beforeInputHandler = (event: Event, input: Input) => {
    if (input.type !== 'keyDown' && input.type !== 'rawKeyDown' && input.type !== 'keyUp') {
      return
    }
    const key = input.key?.toLowerCase?.() ?? ''
    const isAltKey = key === 'alt' || input.code === 'AltLeft' || input.code === 'AltRight'
    const isCtrlSpace = input.control && (key === ' ' || key === 'space')
    const shouldPreventDefault = input.alt || input.meta || isAltKey || isCtrlSpace
    if (shouldPreventDefault) {
      event.preventDefault()
    }
  }

  const systemMenuHandler = (event: Event) => {
    event.preventDefault()
  }

  const closedHandler = () => {
    void cleanupCaptureSession(id)
  }

  contents.on('before-input-event', beforeInputHandler)
  contents.setIgnoreMenuShortcuts(true)
  window.on('system-context-menu', systemMenuHandler)
  window.on('closed', closedHandler)

  const fallbackAccelerators: string[] = []
  const fallbackCandidates = [
    'Alt+Space',
    'Alt+Shift+Space',
    'Control+Space',
    'Control+Shift+Space',
    'Control+Alt+Space',
    'Super+Space',
    'Shift+Control+Alt+Space',
  ] as const

  for (const accelerator of fallbackCandidates) {
    try {
      const ok = globalShortcut.register(accelerator, () => {
        if (!contents.isDestroyed()) {
          contents.send('shortcut:capture:fallback', accelerator)
        }
      })
      if (ok) {
        fallbackAccelerators.push(accelerator)
      }
    } catch (error) {
      console.warn(`[shortcut] failed to register fallback accelerator ${accelerator}`, error)
    }
  }

  let hookTeardown: (() => void) | null = null
  if (typeof window.hookWindowMessage === 'function') {
    const WM_SYSKEYDOWN = 0x0104
    const WM_SYSKEYUP = 0x0105
    const WM_SYSCOMMAND = 0x0112
    const SC_KEYMENU = 0xf100
    const SC_CLOSE = 0xf060
    const VK_SPACE = 0x20

    const hooks: Array<() => void> = []
    const readUInt32 = (value: unknown): number => {
      if (typeof value === 'number') {
        return value >>> 0
      }
      if (Buffer.isBuffer(value) && value.length >= 4) {
        return value.readUInt32LE(0)
      }
      return 0
    }
    const suppress = () => {
      window.setEnabled(false)
      window.setEnabled(true)
    }
    const register = (
      message: number,
      handler: (wParam: unknown, lParam: unknown) => boolean,
    ) => {
      window.hookWindowMessage(message, (wParam, lParam) => {
        if (handler(wParam, lParam)) {
          suppress()
        }
      })
      let removed = false
      const dispose = () => {
        if (removed) {
          return
        }
        removed = true
        if (typeof window.removeHookWindowMessage === 'function') {
          window.removeHookWindowMessage(message)
        }
      }
      hooks.push(dispose)
    }

    register(WM_SYSCOMMAND, wParam => {
      const command = readUInt32(wParam)
      return command === SC_KEYMENU || command === SC_CLOSE
    })

    register(WM_SYSKEYDOWN, (wParam, lParam) => {
      const vkCode = readUInt32(wParam)
      const keyData = readUInt32(lParam)
      const altPressed = (keyData & 0x20000000) !== 0
      return altPressed && vkCode === VK_SPACE
    })

    register(WM_SYSKEYUP, (wParam, lParam) => {
      const vkCode = readUInt32(wParam)
      const keyData = readUInt32(lParam)
      const altPressed = (keyData & 0x20000000) !== 0
      return altPressed && vkCode === VK_SPACE
    })

    hookTeardown = () => {
      for (const dispose of hooks) {
        dispose()
      }
    }
  }

  captureSessions.set(id, {
    id,
    window,
    beforeInputHandler,
    systemMenuHandler,
    closedHandler,
    hookTeardown,
    fallbackAccelerators,
  })
}

export async function endShortcutCapture(webContents: WebContents): Promise<void> {
  await cleanupCaptureSession(webContents.id)
}

function pauseShortcutHandlers(): void {
  pauseDepth = Math.max(pauseDepth + 1, 1)
  if (pauseDepth === 1) {
    isPaused = true
    globalShortcut.unregisterAll()
  }
}

async function resumeShortcutHandlers(): Promise<void> {
  if (pauseDepth === 0) {
    return
  }
  pauseDepth = Math.max(pauseDepth - 1, 0)
  if (pauseDepth > 0 || captureSessions.size > 0) {
    return
  }
  isPaused = false
  if (currentConfig) {
    await applyShortcutConfigInternal(cloneConfig(currentConfig), { failOnError: false })
  }
}

async function cleanupCaptureSession(id: number): Promise<void> {
  const session = captureSessions.get(id)
  if (!session) {
    await resumeShortcutHandlers()
    return
  }

  captureSessions.delete(id)
  detachCaptureSession(session)
  await resumeShortcutHandlers()
}

function detachCaptureSession(session: CaptureSession): void {
  const {
    window,
    beforeInputHandler,
    systemMenuHandler,
    closedHandler,
    hookTeardown,
    fallbackAccelerators,
  } = session
  if (!window.isDestroyed()) {
    window.removeListener('system-context-menu', systemMenuHandler)
    window.removeListener('closed', closedHandler)
    const contents = window.webContents
    if (!contents.isDestroyed()) {
      contents.removeListener('before-input-event', beforeInputHandler)
      contents.setIgnoreMenuShortcuts(false)
    }
  }
  if (typeof hookTeardown === 'function') {
    try {
      hookTeardown()
    } catch (error) {
      console.warn('[shortcut] failed to teardown window hook', error)
    }
  }
  if (fallbackAccelerators.length > 0) {
    for (const accelerator of fallbackAccelerators) {
      try {
        globalShortcut.unregister(accelerator)
      } catch (error) {
        console.warn(`[shortcut] failed to unregister fallback accelerator ${accelerator}`, error)
      }
    }
  }
}

function cloneConfig(config: ShortcutConfig): ShortcutConfig {
  return { ...config }
}

function normalizeAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)
    .join('+')
}

function validateShortcutConfig(config: ShortcutConfig): void {
  const seen = new Map<string, ShortcutName>()
  for (const name of SHORTCUT_NAMES) {
    const accelerator = config[name]
    if (!accelerator) {
      throw new Error(`[shortcut] Accelerator for ${name} is empty`)
    }
    const fingerprint = accelerator.toLowerCase()
    if (seen.has(fingerprint)) {
      throw new Error(`[shortcut] Duplicate accelerator detected for ${accelerator}`)
    }
    seen.set(fingerprint, name)
  }
}

async function loadShortcutConfig(): Promise<ShortcutConfig> {
  const overrides: Partial<ShortcutConfig> = {}
  await Promise.all(
    SHORTCUT_NAMES.map(async name => {
      const stored = await getSetting(resolveStorageKey(name))
      if (stored && stored.trim().length > 0) {
        overrides[name] = normalizeAccelerator(stored)
      }
    }),
  )

  const merged: ShortcutConfig = cloneConfig(DEFAULT_SHORTCUTS)
  for (const name of SHORTCUT_NAMES) {
    if (overrides[name]) {
      merged[name] = overrides[name]!
    }
  }

  validateShortcutConfig(merged)
  return merged
}

async function persistShortcutConfig(config: ShortcutConfig): Promise<void> {
  await Promise.all(
    SHORTCUT_NAMES.map(async name => {
      const key = resolveStorageKey(name)
      const accelerator = config[name]
      if (accelerator === DEFAULT_SHORTCUTS[name]) {
        await deleteSetting(key)
      } else {
        await setSetting(key, accelerator)
      }
    }),
  )
}

type ApplyShortcutOptions = {
  failOnError?: boolean
}

async function applyShortcutConfigInternal(
  config: ShortcutConfig,
  options?: ApplyShortcutOptions,
): Promise<ShortcutConfig> {
  const failOnError = options?.failOnError ?? true
  validateShortcutConfig(config)
  const next = cloneConfig(config)
  const previous = currentConfig ? cloneConfig(currentConfig) : null

  globalShortcut.unregisterAll()

  try {
    const { failures } = registerAccelerators(next)
    if (failures.length > 0) {
      const [firstFailure] = failures
      const message = `[shortcut] Failed to register accelerator ${firstFailure.accelerator}`
      if (failOnError) {
        throw new Error(message)
      }
      console.warn('[shortcut] Some accelerators failed to register', failures)
    }
    currentConfig = next
  } catch (error) {
    console.error('[shortcut] failed to apply shortcuts configuration', error)
    globalShortcut.unregisterAll()
    if (previous) {
      try {
        const { failures: restoreFailures } = registerAccelerators(previous)
        if (restoreFailures.length > 0) {
          console.error('[shortcut] failed to restore previous shortcuts', restoreFailures)
          currentConfig = null
        } else {
          currentConfig = previous
        }
      } catch (restoreError) {
        console.error('[shortcut] failed to restore previous shortcuts', restoreError)
        currentConfig = null
      }
    }
    throw error
  }

  if (!currentConfig) {
    throw new Error('[shortcut] Failed to initialize shortcut configuration')
  }

  return cloneConfig(currentConfig)
}

type RegistrationFailure = {
  name: ShortcutName
  accelerator: string
}

function registerAccelerators(config: ShortcutConfig): { failures: RegistrationFailure[] } {
  if (isPaused) {
    return { failures: [] }
  }
  const failures: RegistrationFailure[] = []
  for (const name of SHORTCUT_NAMES) {
    const accelerator = config[name]
    const handler = HANDLERS[name]
    const ok = globalShortcut.register(accelerator, handler)
    if (!ok) {
      failures.push({ name, accelerator })
      console.warn(`[shortcut] Failed to register accelerator ${accelerator}`)
    }
  }
  return { failures }
}

function resolveStorageKey(name: ShortcutName): string {
  return `${STORAGE_KEY_PREFIX}${name}`
}
