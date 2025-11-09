/// <reference types="vite-plugin-electron/electron-env" />

type WindowUnsubscribe = () => void

interface WindowLauncherApp {
  id: string
  name: string
  launchPath: string
  workingDirectory?: string
  iconPath?: string
  icon?: string
  source: string
  launchCount: number
  lastLaunchedAt: number | null
}

interface WindowScreenshotFrame {
  width: number
  height: number
  bounds: { x: number; y: number }
  dataUrl: string
  mimeType: string
}

interface WindowScreenshotSelection {
  dataUrl?: string
  mimeType?: string
  buffer?: Uint8Array
  bounds: { x: number; y: number; width: number; height: number }
}

interface WindowClipboardImage {
  dataUrl: string
  mimeType: string
}

interface WindowClipboardEntry {
  sequence: number
  timestamp: number
  format: string
  text?: string
  image?: WindowClipboardImage
}

interface WindowLauncherAPI {
  scan(startMenuPaths?: string[], registryPaths?: string[]): Promise<WindowLauncherApp[]>
  cache(): Promise<WindowLauncherApp[]>
  clearCache(): Promise<boolean>
  onIndexed(handler: (apps: WindowLauncherApp[]) => void): WindowUnsubscribe
  open(app: WindowLauncherApp): Promise<void>
}

interface WindowScreenshotAPI {
  capture(): Promise<WindowScreenshotFrame>
  onShortcut(handler: (frame: WindowScreenshotFrame) => void): WindowUnsubscribe
  complete(selection: WindowScreenshotSelection): Promise<void>
}

interface WindowClipboardAPI {
  subscribe(handler: (entry: WindowClipboardEntry) => void): WindowUnsubscribe
  history(limit?: number): Promise<WindowClipboardEntry[]>
  apply(entry: WindowClipboardEntry): Promise<void>
}

interface WindowShortcutsAPI {
  onLauncher(handler: () => void): WindowUnsubscribe
  onClipboard(handler: () => void): WindowUnsubscribe
}

interface WindowNativeAPI {
  version(): Promise<string>
  scanPaths(): Promise<{ start_menu_paths: string[]; registry_paths: string[] }>
}

type WindowType = 'settings' | 'launcher' | 'clipboard' | 'screenshot'

interface WindowControlAPI {
  show(target?: WindowType): Promise<void>
  hide(target?: WindowType): Promise<void>
  readonly current: WindowType
}

interface WolongAPI {
  launcher: WindowLauncherAPI
  screenshot: WindowScreenshotAPI
  clipboard: WindowClipboardAPI
  shortcuts: WindowShortcutsAPI
  native: WindowNativeAPI
  window: WindowControlAPI
}

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  wolong: WolongAPI
}
