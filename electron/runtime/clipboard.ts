import { clipboard, nativeImage, type WebContents } from 'electron'

import { appendClipboardEntry, fetchClipboardHistory } from '../storage/realm.js'
import { hideWindow } from './windows.js'
import { native } from './native.js'
import type { ClipboardBroadcast, NativeClipboardItem } from './types.js'

const clipboardSubscribers = new Map<number, { contents: WebContents; refs: number }>()
let clipboardWatcherAttached = false

export async function getClipboardHistory(limit?: number) {
  const size = typeof limit === 'number' ? limit : 50
  return fetchClipboardHistory(size)
}

export function subscribeClipboardContents(contents: WebContents) {
  const id = contents.id
  const existing = clipboardSubscribers.get(id)
  if (existing) {
    existing.refs += 1
  } else {
    clipboardSubscribers.set(id, { contents, refs: 1 })
    contents.once('destroyed', () => {
      clipboardSubscribers.delete(id)
      teardownClipboardWatcherIfIdle()
    })
  }
  attachClipboardWatcher()
}

export function unsubscribeClipboardContents(id: number) {
  const existing = clipboardSubscribers.get(id)
  if (!existing) {
    return
  }
  existing.refs = Math.max(existing.refs - 1, 0)
  if (existing.refs === 0) {
    clipboardSubscribers.delete(id)
  }
  teardownClipboardWatcherIfIdle()
}

export function applyClipboardEntry(entry: ClipboardBroadcast) {
  hideWindow('clipboard')

  const data: Electron.Data = {}

  if (entry.text) {
    data.text = entry.text
  }

  if (entry.image) {
    const image = nativeImage.createFromDataURL(entry.image.dataUrl)
    data.image = image
  }

  if (Object.keys(data).length === 0) {
    return
  }

  clipboard.write(data)

  setTimeout(() => {
    try {
      native.pasteClipboard()
    } catch (error) {
      console.error('[clipboard] paste simulation failed', error)
    }
  }, 45)
}

export function shutdownClipboardWatcher() {
  if (!clipboardWatcherAttached) {
    return
  }
  try {
    native.unsubscribeClipboard()
  } catch (error) {
    console.error('[clipboard] failed to stop watcher during shutdown', error)
  } finally {
    clipboardWatcherAttached = false
    clipboardSubscribers.clear()
  }
}

function attachClipboardWatcher() {
  if (clipboardWatcherAttached) {
    return
  }
  try {
    native.subscribeClipboard((error, item) => {
      if (error) {
        console.error('[clipboard] watcher error', error)
        return
      }
      if (!item) {
        return
      }
      broadcastClipboardUpdate(item)
    })
    clipboardWatcherAttached = true
  } catch (error) {
    console.error('[clipboard] failed to start watcher', error)
  }
}

function teardownClipboardWatcherIfIdle() {
  if (clipboardSubscribers.size === 0 && clipboardWatcherAttached) {
    try {
      native.unsubscribeClipboard()
    } catch (error) {
      console.error('[clipboard] failed to stop watcher', error)
    } finally {
      clipboardWatcherAttached = false
    }
  }
}

function broadcastClipboardUpdate(item: NativeClipboardItem) {
  const payload = mapClipboardItem(item)
  if (!payload) {
    return
  }

  persistClipboard(payload)

  for (const [id, entry] of clipboardSubscribers) {
    const { contents } = entry
    if (contents.isDestroyed()) {
      clipboardSubscribers.delete(id)
      continue
    }
    contents.send('clipboard:update', payload)
  }

  if (clipboardSubscribers.size === 0) {
    teardownClipboardWatcherIfIdle()
  }
}

function mapClipboardItem(item: NativeClipboardItem): ClipboardBroadcast | null {
  if (!item || typeof item.sequence !== 'number') {
    return null
  }
  const payload: ClipboardBroadcast = {
    sequence: item.sequence,
    timestamp: item.timestamp,
    format: item.format,
  }

  if (item.text && item.text.length > 0) {
    payload.text = item.text
  }

  const buffer = item.image ? ensureBuffer(item.image) : null
  if (buffer && buffer.length > 0) {
    payload.image = {
      mimeType: 'image/png',
      dataUrl: bufferToDataUrl(buffer, 'image/png'),
    }
  }
  return payload
}

function ensureBuffer(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data)
}

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function persistClipboard(payload: ClipboardBroadcast) {
  appendClipboardEntry({
    sequence: payload.sequence,
    timestamp: payload.timestamp,
    format: payload.format,
    text: payload.text,
    image: payload.image,
  }).catch(error => {
    console.error('[clipboard] persist failed', error)
  })
}

