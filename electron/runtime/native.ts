import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

import { APP_ROOT } from './env.js'
import type { NativeCoreModule } from './types.js'

const require = createRequire(import.meta.url)

export function resolveNativeModulePath(filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'native', 'core', filename)
  }

  const candidates = [
    path.join(APP_ROOT, 'native', 'core', filename),
    path.join(APP_ROOT, 'native', 'core', 'index.node'),
    path.join(APP_ROOT, 'native', 'core', 'target', 'release', filename),
    path.join(APP_ROOT, 'native', 'core', 'target', 'debug', filename),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

export function loadNativeModule(): NativeCoreModule {
  const modulePath = resolveNativeModulePath('wolong_core.node')
  try {
    return require(modulePath) as NativeCoreModule
  } catch (error) {
    console.error(`[native] Failed to load module at ${modulePath}`)
    throw error
  }
}

export const native: NativeCoreModule = loadNativeModule()

