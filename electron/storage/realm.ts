import Realm, { ObjectSchema } from 'realm'
import path from 'node:path'
import { app } from 'electron'

const DATABASE_FILE = 'wolong.realm'
const SCHEMA_VERSION = 2
const MAX_CLIPBOARD_ENTRIES = 200

const AppSchema: ObjectSchema = {
  name: 'App',
  primaryKey: 'id',
  properties: {
    id: 'string',
    name: 'string',
    launchPath: 'string',
    workingDirectory: 'string?',
    iconPath: 'string?',
    source: 'string',
    indexedAt: 'date',
    launchCount: 'int',
    lastLaunchedAt: 'date?',
  },
}

type AppRealmObject = {
  id: string
  name: string
  launchPath: string
  workingDirectory: string | null
  iconPath: string | null
  source: string
  indexedAt: Date
  launchCount: number
  lastLaunchedAt: Date | null
}

const ClipboardSchema: ObjectSchema = {
  name: 'ClipboardEntry',
  primaryKey: 'sequence',
  properties: {
    sequence: 'int',
    timestamp: 'date',
    format: 'string',
    text: 'string?',
    imageDataUrl: 'string?',
    mimeType: 'string?',
  },
}

type ClipboardRealmObject = {
  sequence: number
  timestamp: Date
  format: string
  text: string | null
  imageDataUrl: string | null
  mimeType: string | null
}

const SettingSchema: ObjectSchema = {
  name: 'Setting',
  primaryKey: 'key',
  properties: {
    key: 'string',
    value: 'string',
  },
}

export type AppRecordInput = {
  id: string
  name: string
  launchPath: string
  workingDirectory?: string
  iconPath?: string
  source: string
}

export type AppRecordOutput = AppRecordInput & {
  launchCount: number
  lastLaunchedAt: Date | null
}

export type ClipboardEntryInput = {
  sequence: number
  timestamp: number
  format: string
  text?: string
  image?: { dataUrl: string; mimeType: string }
}

export type ClipboardHistoryItem = {
  sequence: number
  timestamp: number
  format: string
  text?: string
  image?: { dataUrl: string; mimeType: string }
}

export type StorageOptions = {
  encryptionKey?: ArrayBuffer | Buffer
}

let realmInstance: Realm | null = null
let openingPromise: Promise<Realm> | null = null
let storageOptions: StorageOptions = {}

export function configureStorage(options: StorageOptions) {
  storageOptions = options
}

export async function initStorage(): Promise<Realm> {
  return openRealm()
}

export async function closeStorage(): Promise<void> {
  if (realmInstance && !realmInstance.isClosed) {
    realmInstance.close()
  }
  realmInstance = null
  openingPromise = null
}

export async function upsertApplications(entries: AppRecordInput[]): Promise<void> {
  if (entries.length === 0) {
    return
  }
  const realm = await openRealm()
  const indexedAt = new Date()

  realm.write(() => {
    for (const entry of entries) {
      const existing = realm.objectForPrimaryKey<AppRealmObject>(AppSchema.name, entry.id)
      realm.create(
        AppSchema.name,
        {
          id: entry.id,
          name: entry.name,
          launchPath: entry.launchPath,
          workingDirectory: entry.workingDirectory ?? null,
          iconPath: entry.iconPath ?? null,
          source: entry.source,
          indexedAt,
          launchCount: existing?.launchCount ?? 0,
          lastLaunchedAt: existing?.lastLaunchedAt ?? null,
        },
        Realm.UpdateMode.Modified,
      )
    }
  })
}

export async function fetchApplications(): Promise<AppRecordOutput[]> {
  const realm = await openRealm()
  const results = realm.objects<AppRealmObject>(AppSchema.name).sorted('name', false)
  return results.map(record => ({
    id: record.id,
    name: record.name,
    launchPath: record.launchPath,
    workingDirectory: record.workingDirectory ?? undefined,
    iconPath: record.iconPath ?? undefined,
    source: record.source,
    launchCount: record.launchCount,
    lastLaunchedAt: record.lastLaunchedAt,
  }))
}

export async function recordAppLaunch(appId: string): Promise<void> {
  const realm = await openRealm()
  realm.write(() => {
    const app = realm.objectForPrimaryKey<AppRealmObject>(AppSchema.name, appId)
    if (app) {
      app.launchCount = (app.launchCount ?? 0) + 1
      app.lastLaunchedAt = new Date()
    }
  })
}

export async function clearApplications(): Promise<void> {
  const realm = await openRealm()
  realm.write(() => {
    const apps = realm.objects<AppRealmObject>(AppSchema.name)
    realm.delete(apps)
  })
}

export async function appendClipboardEntry(entry: ClipboardEntryInput): Promise<void> {
  const realm = await openRealm()
  const timestamp = new Date(entry.timestamp)

  realm.write(() => {
    realm.create(
      ClipboardSchema.name,
      {
        sequence: entry.sequence,
        timestamp,
        format: entry.format,
        text: entry.text ?? null,
        imageDataUrl: entry.image?.dataUrl ?? null,
        mimeType: entry.image?.mimeType ?? null,
      },
      Realm.UpdateMode.Modified,
    )

    pruneClipboardEntries(realm)
  })
}

export async function fetchClipboardHistory(limit: number): Promise<ClipboardHistoryItem[]> {
  const realm = await openRealm()
  const effectiveLimit = Math.max(limit, 0)
  const results = realm
    .objects<ClipboardRealmObject>(ClipboardSchema.name)
    .sorted('timestamp', true)
    .slice(0, effectiveLimit || MAX_CLIPBOARD_ENTRIES)

  return results.map(record => ({
    sequence: record.sequence,
    timestamp: record.timestamp.getTime(),
    format: record.format,
    text: record.text ?? undefined,
    image: record.imageDataUrl
      ? {
          dataUrl: record.imageDataUrl,
          mimeType: record.mimeType ?? 'image/png',
        }
      : undefined,
  }))
}

async function openRealm(): Promise<Realm> {
  if (realmInstance && !realmInstance.isClosed) {
    return realmInstance
  }

  if (!openingPromise) {
    openingPromise = (async () => {
      if (!app.isReady()) {
        await app.whenReady()
      }
      const dbPath = path.join(app.getPath('userData'), DATABASE_FILE)
      const instance = await Realm.open({
        path: dbPath,
        schema: [AppSchema, ClipboardSchema, SettingSchema],
        schemaVersion: SCHEMA_VERSION,
        encryptionKey: storageOptions.encryptionKey,
      })
      realmInstance = instance
      openingPromise = null
      return instance
    })()
  }

  return openingPromise
}

function pruneClipboardEntries(realm: Realm) {
  const entries = realm.objects(ClipboardSchema.name).sorted('timestamp', true)
  if (entries.length <= MAX_CLIPBOARD_ENTRIES) {
    return
  }

  const stale = entries.slice(MAX_CLIPBOARD_ENTRIES)
  if (stale.length > 0) {
    realm.delete(stale)
  }
}
