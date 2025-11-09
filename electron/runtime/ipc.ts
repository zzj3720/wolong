import { ipcMain } from 'electron'

import {
  clearApplicationsCache,
  getDefaultScanPaths,
  loadCachedApplications,
  openApplication,
  scanApplications,
} from './launcher.js'
import { native } from './native.js'
import {
  applyClipboardEntry,
  getClipboardHistory,
  subscribeClipboardContents,
  unsubscribeClipboardContents,
} from './clipboard.js'
import {
  captureScreenshotFrame,
  cancelActiveScreenshot,
  completeScreenshotSelection,
} from './screenshot.js'
import { hideWindow, sendToRenderer, showWindow } from './windows.js'
import {
  beginShortcutCapture,
  endShortcutCapture,
  getShortcutConfig,
  resetShortcutConfig,
  updateShortcutConfig,
} from './shortcuts.js'
import type { ShortcutConfig } from './shortcuts.js'
import type { AppRecord, ClipboardBroadcast, ScreenshotSelectionResult, WindowType } from './types.js'

export function registerIpcHandlers() {
  ipcMain.handle('launcher:scan', async (_event, startMenuPaths?: string[], registryPaths?: string[]) => {
    const enriched = await scanApplications(startMenuPaths, registryPaths)
    void sendToRenderer('launcher', 'launcher:indexed', enriched)
    return enriched
  })

  ipcMain.handle('launcher:cache', async () => {
    return loadCachedApplications()
  })

  ipcMain.handle('launcher:clearCache', async () => {
    await clearApplicationsCache()
    return true
  })

  ipcMain.handle('launcher:open', async (_event, appRecord: AppRecord) => {
    await openApplication(appRecord)
  })

  ipcMain.handle('screenshot:capture', async () => {
    return captureScreenshotFrame()
  })

  ipcMain.handle('native:version', async () => native.version())

  ipcMain.handle('launcher:scanPaths', async () => {
    return getDefaultScanPaths()
  })

  ipcMain.handle('clipboard:history', async (_event, limit?: number) => {
    return getClipboardHistory(limit)
  })

  ipcMain.handle('clipboard:apply', async (_event, entry: ClipboardBroadcast) => {
    applyClipboardEntry(entry)
  })

  ipcMain.handle('window:show', async (_event, target?: WindowType) => {
    const windowType = target ?? 'settings'
    if (windowType === 'screenshot') {
      try {
        const frame = await captureScreenshotFrame()
        const window = await showWindow('screenshot')
        window.setAlwaysOnTop(true, 'screen-saver')
        await sendToRenderer('screenshot', 'shortcut:screenshot', frame)
      } catch (error) {
        console.error('[ipc] screenshot capture failed', error)
        cancelActiveScreenshot()
        hideWindow('screenshot')
        throw error
      }
    } else {
      await showWindow(windowType)
    }
  })

  ipcMain.handle('window:hide', (_event, target?: WindowType) => {
    hideWindow(target ?? 'settings')
  })

  ipcMain.handle('screenshot:complete', async (_event, payload: ScreenshotSelectionResult) => {
    try {
      await completeScreenshotSelection(payload)
    } finally {
      cancelActiveScreenshot()
      hideWindow('screenshot')
    }
  })

  ipcMain.on('clipboard:subscribe', event => {
    const sender = event.sender
    subscribeClipboardContents(sender)
  })

  ipcMain.on('clipboard:unsubscribe', event => {
    const id = event.sender.id
    unsubscribeClipboardContents(id)
  })

  ipcMain.handle('shortcuts:get', async () => {
    return getShortcutConfig()
  })

  ipcMain.handle('shortcuts:update', async (_event, payload: Record<string, unknown>) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('[shortcuts] Invalid payload')
    }
    const updates: Record<string, string> = {}
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value !== 'string') {
        throw new Error(`[shortcuts] Accelerator for ${key} must be a string`)
      }
      updates[key] = value
    }
    return updateShortcutConfig(updates as Partial<ShortcutConfig>)
  })

  ipcMain.handle('shortcuts:reset', async () => {
    return resetShortcutConfig()
  })

  ipcMain.handle('shortcuts:capture:start', async (event) => {
    await beginShortcutCapture(event.sender)
  })

  ipcMain.handle('shortcuts:capture:end', async (event) => {
    await endShortcutCapture(event.sender)
  })
}

