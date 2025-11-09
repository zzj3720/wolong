import { app, BrowserWindow } from 'electron'

import './runtime/env.js'
import { closeStorage, initStorage } from './storage/realm.js'
import { registerIpcHandlers } from './runtime/ipc.js'
import { shutdownClipboardWatcher } from './runtime/clipboard.js'
import { registerShortcuts, unregisterShortcuts } from './runtime/shortcuts.js'
import { clearWindowEntries, markAppQuitting, showWindow } from './runtime/windows.js'
import { destroyTray, initTray } from './runtime/tray.js'

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  clearWindowEntries()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void showWindow('settings')
  }
})

app.on('before-quit', () => {
  markAppQuitting(true)
})

app.on('will-quit', () => {
  unregisterShortcuts()
  shutdownClipboardWatcher()
  destroyTray()
  closeStorage().catch(error => {
    console.error('[storage] close failed', error)
  })
})

app.whenReady().then(async () => {
  try {
    await initStorage()
    registerIpcHandlers()
    registerShortcuts()
    await showWindow('settings')
    initTray()
  } catch (error) {
    console.error('[app] initialization failed', error)
    app.quit()
  }
})

