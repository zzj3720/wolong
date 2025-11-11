export type NativeAppInfo = {
  id: string
  name: string
  launch_path: string
  working_directory?: string | null
  icon_path?: string | null
  source: string
}

export type ScanPaths = {
  start_menu_paths: string[]
  registry_paths: string[]
}

export type NativeScreenshotPayload = {
  width: number
  height: number
  x: number
  y: number
  buffer: Buffer
  mime_type: string
}

export type NativeClipboardItem = {
  sequence: number
  timestamp: number
  format: string
  text?: string | null
  html?: string | null
  image?: Buffer | null
}

export type NativeCoreModule = {
  scanApps: (startMenuPaths: string[], registryPaths: string[]) => Promise<NativeAppInfo[]>
  captureMonitorScreenshot: () => Promise<NativeScreenshotPayload>
  subscribeClipboard: (callback: (error: Error | null, item: NativeClipboardItem | null) => void) => void
  unsubscribeClipboard: () => void
  captureForegroundWindow: () => string | null
  focusWindow: (handle: string) => void
  pasteClipboard: () => void
  extractIcon: (iconPath: string) => Buffer | null
  version: () => string
  getDefaultScanPaths: () => ScanPaths
}

export type AppRecordBase = {
  id: string
  name: string
  launchPath: string
  workingDirectory?: string
  iconPath?: string
  source: string
}

export type AppRecord = AppRecordBase & {
  icon?: string
  launchCount?: number
  lastLaunchedAt?: number | null
}

export type ScreenshotFrame = {
  width: number
  height: number
  bounds: { x: number; y: number }
  dataUrl: string
  mimeType: string
}

export type ClipboardBroadcast = {
  sequence: number
  timestamp: number
  format: string
  text?: string
  html?: string
  image?: { dataUrl: string; mimeType: string }
}

export type ScreenshotSelectionResult = {
  dataUrl?: string
  mimeType?: string
  buffer?: Uint8Array | Buffer | ArrayBuffer
  bounds: { x: number; y: number; width: number; height: number }
}

export type WindowType = 'settings' | 'launcher' | 'clipboard' | 'screenshot' | 'chat'


