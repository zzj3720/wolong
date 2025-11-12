import { app } from 'electron'
import { getSetting, setSetting } from '../storage/realm.js'

const SETTING_KEY = 'autostart'

export async function getAutoStartEnabled(): Promise<boolean> {
  const value = await getSetting(SETTING_KEY)
  if (value === null) {
    // Default to false if not set
    return false
  }
  return value === 'true'
}

export async function setAutoStartEnabled(enabled: boolean): Promise<void> {
  const openAtLogin = enabled
  const openAsHidden = false

  // Update Electron login item settings
  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden,
  })

  // Persist setting to database
  await setSetting(SETTING_KEY, enabled ? 'true' : 'false')
}

export async function initAutoStart(): Promise<void> {
  // Apply saved auto-start preference on app initialization
  const enabled = await getAutoStartEnabled()
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
  })
}
