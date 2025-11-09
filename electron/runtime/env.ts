import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const runtimeDir = path.dirname(fileURLToPath(import.meta.url))
const electronDir = path.dirname(runtimeDir)

function findAppRoot(startDir: string): string {
  let current = startDir

  while (true) {
    const manifestPath = path.join(current, 'package.json')
    if (fs.existsSync(manifestPath)) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return startDir
    }
    current = parent
  }
}

const resolvedAppRoot = findAppRoot(runtimeDir)
const previousAppRoot = process.env.APP_ROOT

if (previousAppRoot && path.resolve(previousAppRoot) !== resolvedAppRoot) {
  console.warn(
    `[env] Overriding APP_ROOT from ${previousAppRoot} to ${resolvedAppRoot} (computed from runtime location)`,
  )
}

process.env.APP_ROOT = resolvedAppRoot
const appRoot = resolvedAppRoot

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const MAIN_DIST = path.join(appRoot, 'dist-electron')
const RENDERER_DIST = path.join(appRoot, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(appRoot, 'public') : RENDERER_DIST

const PRELOAD_DIST_PATH = path.join(MAIN_DIST, 'preload.mjs')

export {
  runtimeDir,
  electronDir,
  appRoot as APP_ROOT,
  VITE_DEV_SERVER_URL,
  MAIN_DIST,
  RENDERER_DIST,
  PRELOAD_DIST_PATH,
}

