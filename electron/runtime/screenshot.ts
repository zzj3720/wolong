import { clipboard, nativeImage } from 'electron'

import { native } from './native.js'
import type { ScreenshotFrame, ScreenshotSelectionResult } from './types.js'

type ActiveScreenshot = {
  image: Electron.NativeImage
  buffer: Buffer
  width: number
  height: number
  bounds: { x: number; y: number }
  mimeType: string
  capturedAt: number
}

let activeScreenshot: ActiveScreenshot | null = null

export async function captureScreenshotFrame(): Promise<ScreenshotFrame> {
  const payload = await native.captureMonitorScreenshot()
  const buffer = ensureBuffer(payload.buffer)
  const mimeType = payload.mime_type || 'image/png'
  const dataUrl = bufferToDataUrl(buffer, mimeType)

  let image = nativeImage.createFromBuffer(buffer)
  if (image.isEmpty()) {
    image = nativeImage.createFromDataURL(dataUrl)
  }

  if (image.isEmpty()) {
    throw new Error('Screenshot capture produced empty image')
  }

  activeScreenshot = {
    image,
    buffer,
    width: payload.width,
    height: payload.height,
    bounds: { x: payload.x, y: payload.y },
    mimeType,
    capturedAt: Date.now(),
  }

  console.log('[screenshot] captured frame', {
    width: payload.width,
    height: payload.height,
    mimeType,
    origin: { x: payload.x, y: payload.y },
  })

  return {
    width: payload.width,
    height: payload.height,
    bounds: { x: payload.x, y: payload.y },
    mimeType,
    dataUrl,
  }
}

export async function completeScreenshotSelection(payload: ScreenshotSelectionResult): Promise<void> {
  try {
    const rawBufferLength = getPayloadBufferLength(payload.buffer)
    const dataUrlLength = payload.dataUrl?.length ?? 0
    console.log('[screenshot] complete payload meta', {
      mimeType: payload.mimeType,
      hasBuffer: rawBufferLength !== null,
      bufferLength: rawBufferLength ?? undefined,
      dataUrlLength,
    })

    let committed = false
    const screenshot = activeScreenshot
    const normalizedSelection = normalizeSelection(payload.bounds, screenshot)

    if (screenshot && normalizedSelection) {
      const cropped = cropActiveScreenshot(screenshot, normalizedSelection)
      if (cropped) {
        console.log('[screenshot] using native crop', {
          selection: normalizedSelection,
          source: { width: screenshot.width, height: screenshot.height },
        })
        commitImageToClipboard(cropped.image, cropped.buffer, screenshot.mimeType)
        committed = true
      } else {
        console.warn('[screenshot] native crop failed, falling back to renderer payload')
      }
    } else if (!screenshot) {
      console.warn('[screenshot] no active screenshot available, falling back to renderer payload')
    } else {
      console.warn('[screenshot] invalid selection bounds', { bounds: payload.bounds })
    }

    if (!committed) {
      const fallback = imageFromRendererPayload(payload)
      if (!fallback) {
        throw new Error('Failed to resolve screenshot image from renderer payload')
      }
      commitImageToClipboard(fallback.image, fallback.buffer, fallback.mimeType)
    }
  } catch (error) {
    console.error('[screenshot] complete failed', error)
    throw error
  } finally {
    clearActiveScreenshot()
  }
}

export function cancelActiveScreenshot(): void {
  clearActiveScreenshot()
}

function ensureBuffer(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data)
}

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function dataUrlToBuffer(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl)
  if (!match) {
    console.warn('[screenshot] dataUrlToBuffer: pattern match failed')
    return null
  }
  try {
    const buffer = Buffer.from(match[2], 'base64')
    return { mimeType: match[1], buffer }
  } catch (error) {
    console.error('[screenshot] failed to decode data URL', error)
    return null
  }
}

function resolvePayloadBuffer(source: ScreenshotSelectionResult['buffer']): Buffer | null {
  if (!source) {
    return null
  }
  try {
    if (Buffer.isBuffer(source)) {
      return source
    }
    if (source instanceof ArrayBuffer) {
      return Buffer.from(source)
    }
    if (ArrayBuffer.isView(source)) {
      return Buffer.from(source.buffer, source.byteOffset, source.byteLength)
    }
  } catch (error) {
    console.error('[screenshot] resolvePayloadBuffer failed', error)
  }
  return null
}

function getPayloadBufferLength(source: ScreenshotSelectionResult['buffer']): number | null {
  if (!source) {
    return null
  }
  if (Buffer.isBuffer(source)) {
    return source.length
  }
  if (source instanceof ArrayBuffer) {
    return source.byteLength
  }
  if (ArrayBuffer.isView(source)) {
    return source.byteLength
  }
  return null
}

function normalizeSelection(
  bounds: ScreenshotSelectionResult['bounds'] | undefined,
  screenshot: ActiveScreenshot | null,
): { x: number; y: number; width: number; height: number } | null {
  if (!bounds) {
    return null
  }

  let x = Math.floor(bounds.x)
  let y = Math.floor(bounds.y)
  let width = Math.ceil(bounds.width)
  let height = Math.ceil(bounds.height)

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }

  width = Math.max(1, width)
  height = Math.max(1, height)

  if (screenshot) {
    if (x < 0) {
      width += x
      x = 0
    }
    if (y < 0) {
      height += y
      y = 0
    }

    const maxWidth = screenshot.width
    const maxHeight = screenshot.height

    if (x >= maxWidth || y >= maxHeight) {
      return null
    }

    width = Math.min(width, maxWidth - x)
    height = Math.min(height, maxHeight - y)
  }

  if (width <= 0 || height <= 0) {
    return null
  }

  return { x, y, width, height }
}

function cropActiveScreenshot(
  screenshot: ActiveScreenshot,
  selection: { x: number; y: number; width: number; height: number },
): { image: Electron.NativeImage; buffer: Buffer } | null {
  try {
    const cropped = screenshot.image.crop(selection)
    if (cropped.isEmpty()) {
      console.warn('[screenshot] cropped image is empty')
      return null
    }

    const buffer = cropped.toPNG()
    if (!buffer || buffer.length === 0) {
      console.warn('[screenshot] cropped PNG buffer is empty')
    }

    return { image: cropped, buffer }
  } catch (error) {
    console.error('[screenshot] crop failed', error)
    return null
  }
}

function commitImageToClipboard(image: Electron.NativeImage, buffer: Buffer | null | undefined, mimeType = 'image/png'): void {
  clipboard.writeImage(image)
  const formats = clipboard.availableFormats()
  console.log('[screenshot] image written', image.getSize(), { formats, mimeType, bufferLength: buffer?.length })
}

function imageFromRendererPayload(
  payload: ScreenshotSelectionResult,
): { image: Electron.NativeImage; buffer?: Buffer; mimeType: string } | null {
  const candidateBuffer = resolvePayloadBuffer(payload.buffer)
  const declaredMimeType = payload.mimeType || 'image/png'

  if (candidateBuffer && candidateBuffer.length > 0) {
    try {
      const image = nativeImage.createFromBuffer(candidateBuffer)
      if (!image.isEmpty()) {
        return { image, buffer: candidateBuffer, mimeType: declaredMimeType }
      }
    } catch (error) {
      console.warn('[screenshot] createFromBuffer failed for payload buffer', error)
    }
  }

  if (payload.dataUrl) {
    const parsed = dataUrlToBuffer(payload.dataUrl)
    const mimeType = parsed?.mimeType ?? declaredMimeType

    if (parsed?.buffer && parsed.buffer.length > 0) {
      try {
        const image = nativeImage.createFromBuffer(parsed.buffer)
        if (!image.isEmpty()) {
          return { image, buffer: parsed.buffer, mimeType }
        }
      } catch (error) {
        console.warn('[screenshot] createFromBuffer failed for data URL buffer', error)
      }
    }

    try {
      const image = nativeImage.createFromDataURL(payload.dataUrl)
      if (!image.isEmpty()) {
        return { image, buffer: parsed?.buffer, mimeType }
      }
    } catch (error) {
      console.warn('[screenshot] createFromDataURL failed', error)
    }
  }

  return null
}

function clearActiveScreenshot(): void {
  if (activeScreenshot) {
    activeScreenshot = null
  }
}

