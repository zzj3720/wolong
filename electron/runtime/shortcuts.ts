import { globalShortcut } from 'electron'

import { captureScreenshotFrame, cancelActiveScreenshot } from './screenshot.js'
import { hideWindow, sendToRenderer, showWindow } from './windows.js'

export function registerShortcuts() {
  const shortcuts: Array<[string, () => void]> = [
    [
      'Alt+Space',
      () => {
        void (async () => {
          try {
            await showWindow('launcher')
            await sendToRenderer('launcher', 'shortcut:launcher')
          } catch (error) {
            console.error('[shortcut] launcher open failed', error)
          }
        })()
      },
    ],
    [
      'Control+Shift+V',
      () => {
        void (async () => {
          try {
            await showWindow('clipboard')
            await sendToRenderer('clipboard', 'shortcut:clipboard')
          } catch (error) {
            console.error('[shortcut] clipboard open failed', error)
          }
        })()
      },
    ],
    [
      'Control+Shift+S',
      () => {
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
    ],
  ]

  for (const [accelerator, handler] of shortcuts) {
    const ok = globalShortcut.register(accelerator, handler)
    if (!ok) {
      console.warn(`[shortcut] Failed to register ${accelerator}`)
    }
  }
}

export function unregisterShortcuts() {
  globalShortcut.unregisterAll()
}

