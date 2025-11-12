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
  html?: string
  image?: WindowClipboardImage
}

type WindowShortcutName = 'launcher' | 'clipboard' | 'screenshot' | 'chat'
type WindowShortcutConfig = Record<WindowShortcutName, string>

type WindowChatProviderId = 'openai' | 'minimax' | 'kimi' | 'deepseek'

interface WindowChatProviderConfig {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  models: string[]
}

interface WindowChatSettings {
  activeProvider: WindowChatProviderId
  providers: Record<WindowChatProviderId, WindowChatProviderConfig>
}

interface WindowChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface WindowChatSendInput {
  messages?: WindowChatMessage[]
  prompt: string
  providerId?: WindowChatProviderId
  model?: string
  sessionId?: string
}

interface WindowChatSendResult {
  message: WindowChatMessage
  raw: unknown
  sessionId: string
}

interface WindowChatStreamChunk {
  content: string
  done: boolean
  sessionId: string
}

interface WindowChatSession {
  id: string
  providerId: string
  model?: string
  createdAt: number
  updatedAt: number
}

type WindowChatWindowState = 'normal' | 'maximized' | 'fullscreen'
type WindowSettingsWindowState = 'normal' | 'maximized' | 'fullscreen'

interface WindowChatWindowAPI {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  getState(): Promise<WindowChatWindowState>
  onStateChange(handler: (state: WindowChatWindowState) => void): WindowUnsubscribe
}

interface WindowSettingsWindowAPI {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  getState(): Promise<WindowSettingsWindowState>
  onStateChange(handler: (state: WindowSettingsWindowState) => void): WindowUnsubscribe
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
  onChat(handler: () => void): WindowUnsubscribe
  getAll(): Promise<WindowShortcutConfig>
  update(config: Partial<WindowShortcutConfig>): Promise<WindowShortcutConfig>
  reset(): Promise<WindowShortcutConfig>
  beginCapture(): Promise<void>
  endCapture(): Promise<void>
  onCaptureFallback(handler: (accelerator: string) => void): WindowUnsubscribe
}

interface WindowNativeAPI {
  version(): Promise<string>
  scanPaths(): Promise<{ start_menu_paths: string[]; registry_paths: string[] }>
}

type WindowType = 'settings' | 'launcher' | 'clipboard' | 'screenshot' | 'chat'

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
  chat: {
    getConfig(): Promise<WindowChatSettings>
    saveConfig(config: Partial<WindowChatSettings>): Promise<WindowChatSettings>
    listSessions(limit?: number): Promise<WindowChatSession[]>
    getMessages(sessionId: string): Promise<WindowChatMessage[]>
    send(payload: WindowChatSendInput): Promise<WindowChatSendResult>
    sendStream(payload: WindowChatSendInput): Promise<{ streamId: string }>
    onStreamChunk(handler: (streamId: string, chunk: WindowChatStreamChunk) => void): () => void
    onStreamError(handler: (streamId: string, error: string) => void): () => void
    window: WindowChatWindowAPI
  }
  settings: {
    window: WindowSettingsWindowAPI
    getAutoStart(): Promise<boolean>
    setAutoStart(enabled: boolean): Promise<boolean>
  }
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
