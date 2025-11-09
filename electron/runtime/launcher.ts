import { shell, nativeImage } from 'electron'
import { spawn, type SpawnOptions } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  clearApplications,
  fetchApplications,
  recordAppLaunch,
  upsertApplications,
} from '../storage/realm.js'
import { native } from './native.js'
import type {
  AppRecord,
  AppRecordBase,
  NativeAppInfo,
  ScanPaths,
} from './types.js'

const ICON_SIZE = 48
const iconCache = new Map<string, string | null>()

export function getDefaultScanPaths(): ScanPaths {
  const programData = process.env.PROGRAMDATA || ''
  const appData = process.env.APPDATA || ''

  const startMenuPaths: string[] = []
  if (programData) {
    startMenuPaths.push(path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  }
  if (appData) {
    startMenuPaths.push(path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  }

  const registryPaths: string[] = []

  return {
    start_menu_paths: startMenuPaths,
    registry_paths: registryPaths,
  }
}

export async function scanApplications(
  startMenuPaths?: string[],
  registryPaths?: string[],
): Promise<AppRecord[]> {
  try {
    iconCache.clear()

    const defaultPaths = getDefaultScanPaths()
    const pathsToUse: ScanPaths = {
      start_menu_paths: startMenuPaths ?? defaultPaths.start_menu_paths,
      registry_paths: registryPaths ?? defaultPaths.registry_paths,
    }

    const records = await native.scanApps(pathsToUse.start_menu_paths, pathsToUse.registry_paths)
    const mapped = records.map(mapAppRecord).filter((entry): entry is AppRecordBase => entry !== null)

    const steamApps = mapped.filter(app => app.name.toLowerCase().includes('steam'))
    if (steamApps.length > 0) {
      console.log('[launcher] Steam-related apps found:', steamApps.map(app => ({ name: app.name, launchPath: app.launchPath })))
    }

    if (mapped.length > 0) {
      await upsertApplications(mapped)
    }

    return await loadCachedApplications()
  } catch (error) {
    console.error('[launcher] scan failed', error)
    throw error
  }
}

export async function loadCachedApplications(): Promise<AppRecord[]> {
  const cached = await fetchApplications()
  return enrichAppRecords(cached)
}

export async function clearApplicationsCache(): Promise<void> {
  await clearApplications()
  iconCache.clear()
}

export async function openApplication(appRecord: AppRecord): Promise<void> {
  try {
    await launchApplication(appRecord)
    await recordAppLaunch(appRecord.id)
  } catch (error) {
    console.error('[launcher] open failed', error)
    throw error
  }
}

function mapAppRecord(record: NativeAppInfo): AppRecordBase | null {
  const rawLaunchPath =
    typeof (record as { launchPath?: unknown }).launchPath === 'string'
      ? (record as { launchPath?: string }).launchPath
      : record.launch_path
  const launchPath = rawLaunchPath?.trim()
  if (!launchPath) {
    console.warn('[launcher] skip record without launch path', record)
    return null
  }

  const rawName =
    typeof (record as { name?: unknown }).name === 'string'
      ? (record as { name?: string }).name
      : record.name
  const name = rawName?.trim() || launchPath

  const rawWorkingDirectory =
    typeof (record as { workingDirectory?: unknown }).workingDirectory === 'string'
      ? (record as { workingDirectory?: string }).workingDirectory
      : record.working_directory

  const rawIconPath =
    typeof (record as { iconPath?: unknown }).iconPath === 'string'
      ? (record as { iconPath?: string }).iconPath
      : record.icon_path

  return {
    id: record.id,
    name,
    launchPath,
    workingDirectory: rawWorkingDirectory?.trim() || undefined,
    iconPath: rawIconPath?.trim() || undefined,
    source: record.source,
  }
}

function enrichAppRecords(records: AppRecordBase[] | import('../storage/realm.js').AppRecordOutput[]): AppRecord[] {
  return records.map(record => {
    const icon = resolveIconForRecord(record)
    if (!icon && (record.name.toLowerCase().includes('steam') || record.name.toLowerCase().includes('test'))) {
      console.log(`[icon] No icon for ${record.name}: launchPath=${record.launchPath}, iconPath=${record.iconPath}`)
    }
    const base: AppRecord = icon ? { ...record, icon } : { ...record }
    if ('launchCount' in record && 'lastLaunchedAt' in record) {
      base.launchCount = record.launchCount
      base.lastLaunchedAt = record.lastLaunchedAt ? record.lastLaunchedAt.getTime() : null
    } else {
      base.launchCount = 0
      base.lastLaunchedAt = null
    }
    return base
  })
}

function resolveIconForRecord(record: AppRecordBase): string | undefined {
  const candidates: string[] = []

  if (record.iconPath && !record.iconPath.toLowerCase().endsWith('.lnk')) {
    candidates.push(record.iconPath)
  }

  if (record.launchPath && !record.launchPath.toLowerCase().endsWith('.lnk')) {
    candidates.push(record.launchPath)
  }

  for (const candidate of candidates) {
    const dataUrl = loadIconData(candidate)
    if (dataUrl) {
      return dataUrl
    }
  }

  return undefined
}

function loadIconData(candidate: string | undefined): string | undefined {
  if (!candidate) {
    return undefined
  }

  const fsPath = normalizeFilePath(candidate)
  const cached = iconCache.get(fsPath)
  if (cached !== undefined) {
    return cached ?? undefined
  }

  if (process.platform === 'win32') {
    try {
      const iconBuffer = native.extractIcon(candidate)
      if (iconBuffer && iconBuffer.length > 0) {
        const image = nativeImage.createFromBuffer(iconBuffer)
        if (!image.isEmpty()) {
          const resized = image.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'best' })
          const payload = (resized.isEmpty() ? image : resized).toDataURL()
          iconCache.set(fsPath, payload)
          return payload
        } else {
          console.log(`[icon] Native extraction returned empty image for: ${candidate}`)
        }
      } else {
        console.log(`[icon] Native extraction returned null/empty for: ${candidate}`)
      }
    } catch (error) {
      console.log(`[icon] Native extraction error for ${candidate}:`, error)
    }
  }

  const cleanCandidate = candidate.split(',')[0].trim()
  const cleanPath = normalizeFilePath(cleanCandidate)

  if (!fs.existsSync(cleanPath)) {
    iconCache.set(fsPath, null)
    return undefined
  }

  try {
    const image = nativeImage.createFromPath(cleanPath)
    if (image.isEmpty()) {
      iconCache.set(fsPath, null)
      return undefined
    }
    const resized = image.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'best' })
    const payload = (resized.isEmpty() ? image : resized).toDataURL()
    iconCache.set(fsPath, payload)
    return payload
  } catch (error) {
    console.debug(`[icon] failed to load icon from ${cleanPath}`, error)
    iconCache.set(fsPath, null)
    return undefined
  }
}

function normalizeFilePath(value: string): string {
  if (process.platform === 'win32') {
    return path.normalize(value.replace(/\//g, '\\'))
  }
  return path.normalize(value)
}

function toPlatformPath(value: string): string {
  return process.platform === 'win32' ? value.replace(/\//g, '\\') : value
}

async function launchApplication(record: AppRecord): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Launcher is only implemented for Windows')
  }

  const launchTarget = toPlatformPath(record.launchPath)
  const workingDirectory = record.workingDirectory ? toPlatformPath(record.workingDirectory) : undefined
  const extension = path.extname(launchTarget).toLowerCase()

  const baseOptions: SpawnOptions = {
    cwd: workingDirectory,
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  }

  const launchWithSpawn = (command: string, args: string[], options: SpawnOptions): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, options)
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })

  const launchWithShell = async (): Promise<void> => {
    const result = await shell.openPath(launchTarget)
    if (result) {
      throw new Error(result)
    }
  }

  if (extension === '.lnk') {
    await launchWithShell()
    return
  }

  const attempts: Array<() => Promise<void>> = []

  if (extension === '.bat' || extension === '.cmd') {
    attempts.push(() =>
      launchWithSpawn('cmd.exe', ['/c', `"${launchTarget}"`], {
        ...baseOptions,
        windowsVerbatimArguments: true,
      }),
    )
  } else {
    attempts.push(() => launchWithSpawn(launchTarget, [], baseOptions))
  }

  attempts.push(launchWithShell)

  let lastError: unknown
  for (const attempt of attempts) {
    try {
      await attempt()
      return
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('Failed to launch application')
}

