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
import {
  getWindowState,
  hideWindow,
  minimizeWindow,
  sendToRenderer,
  showWindow,
  toggleMaximizeWindow,
} from './windows.js'
import {
  beginShortcutCapture,
  endShortcutCapture,
  getShortcutConfig,
  resetShortcutConfig,
  updateShortcutConfig,
} from './shortcuts.js'
import type { ShortcutConfig } from './shortcuts.js'
import {
  getChatConfig,
  getChatMessages,
  getChatSessions,
  sendChatMessage,
  sendChatMessageStream,
  updateChatConfig,
} from './chat.js'
import type {
  AiSettingsPatch,
  SendChatMessagePayload,
  SendChatMessageResult,
} from './chat.js'
import { getWindowEntry } from './windows.js'
import type { AppRecord, ClipboardBroadcast, ScreenshotSelectionResult, WindowType } from './types.js'
import { getAutoStartEnabled, setAutoStartEnabled } from './autostart.js'

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

  ipcMain.handle('chat:config:get', async () => {
    return getChatConfig()
  })

  ipcMain.handle('chat:config:set', async (_event, payload: AiSettingsPatch) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('[chat] Invalid configuration payload')
    }
    return updateChatConfig(payload)
  })

  ipcMain.handle('chat:sessions:list', async (_event, limit?: number) => {
    return getChatSessions(limit)
  })

  ipcMain.handle('chat:messages:get', async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('[chat] Session ID must be a non-empty string')
    }
    return getChatMessages(sessionId.trim())
  })

  ipcMain.handle('chat:send', async (_event, payload: SendChatMessagePayload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('[chat] Invalid chat payload')
    }
    const sanitized: SendChatMessagePayload = {
      messages: Array.isArray(payload.messages) ? payload.messages : undefined,
      prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
      providerId: payload.providerId,
      model: typeof payload.model === 'string' ? payload.model : undefined,
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    }
    if (!sanitized.prompt.trim()) {
      throw new Error('[chat] Prompt cannot be empty')
    }
    const result: SendChatMessageResult = await sendChatMessage(sanitized)
    return result
  })

  ipcMain.handle('chat:sendStream', async (event, payload: SendChatMessagePayload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('[chat] Invalid chat payload')
    }
    const sanitized: SendChatMessagePayload = {
      messages: Array.isArray(payload.messages) ? payload.messages : undefined,
      prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
      providerId: payload.providerId,
      model: typeof payload.model === 'string' ? payload.model : undefined,
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
    }
    if (!sanitized.prompt.trim()) {
      throw new Error('[chat] Prompt cannot be empty')
    }

    const webContents = event.sender
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Start streaming in background
    void (async () => {
      try {
        for await (const chunk of sendChatMessageStream(sanitized)) {
          webContents.send('chat:streamChunk', streamId, chunk)
          if (chunk.done) {
            break
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Stream failed'
        webContents.send('chat:streamError', streamId, errorMessage)
      }
    })()

    return { streamId }
  })

  ipcMain.handle('chat:window:minimize', () => {
    minimizeWindow('chat')
  })

  ipcMain.handle('chat:window:toggleMaximize', () => {
    toggleMaximizeWindow('chat')
  })

  ipcMain.handle('chat:window:close', () => {
    hideWindow('chat')
  })

  ipcMain.handle('chat:window:getState', () => {
    return getWindowState('chat')
  })

  ipcMain.handle('settings:window:minimize', () => {
    minimizeWindow('settings')
  })

  ipcMain.handle('settings:window:toggleMaximize', () => {
    toggleMaximizeWindow('settings')
  })

  ipcMain.handle('settings:window:close', () => {
    hideWindow('settings')
  })

  ipcMain.handle('settings:window:getState', () => {
    return getWindowState('settings')
  })

  ipcMain.handle('autostart:get', async () => {
    return getAutoStartEnabled()
  })

  ipcMain.handle('autostart:set', async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('[autostart] enabled must be a boolean')
    }
    await setAutoStartEnabled(enabled)
    return enabled
  })
}

