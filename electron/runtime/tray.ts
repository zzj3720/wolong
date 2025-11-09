import { app, Menu, Tray, nativeImage, type NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import { APP_ROOT } from './env.js'
import { markAppQuitting, showWindow } from './windows.js'

let tray: Tray | null = null

function resolveTrayIcon(): NativeImage {
  const candidates: string[] = []
  const resourcesPath = process.resourcesPath ?? ''

  if (process.platform === 'win32') {
    candidates.push(path.join(APP_ROOT, 'build', 'icon.ico'))
    candidates.push(path.join(resourcesPath, 'build', 'icon.ico'))
    candidates.push(path.join(resourcesPath, 'icon.ico'))
    candidates.push(path.join(APP_ROOT, 'build', 'icon.png'))
  } else {
    candidates.push(path.join(APP_ROOT, 'build', 'icon.png'))
    candidates.push(path.join(resourcesPath, 'build', 'icon.png'))
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return nativeImage.createFromPath(candidate)
    }
  }

  return nativeImage.createEmpty()
}

export function initTray(): Tray {
  if (tray) {
    return tray
  }

  const icon = resolveTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Wolong')

  const showSettings = () => {
    void showWindow('settings')
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Settings',
      click: showSettings,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        markAppQuitting(true)
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', showSettings)
  tray.on('double-click', showSettings)

  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}



