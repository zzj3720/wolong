declare module 'electron' {
  interface IpcRendererEvent {
    sender: unknown
  }

  interface IpcRenderer {
    on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): IpcRenderer
    off(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): IpcRenderer
    send(channel: string, ...args: unknown[]): void
    invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
    removeAllListeners(channel: string): void
  }

  interface ContextBridge {
    exposeInMainWorld(key: string, api: unknown): void
  }

  interface WebContents {
    id: number
    isDestroyed(): boolean
    send(channel: string, ...args: unknown[]): void
    on(event: string, listener: (...args: unknown[]) => void): void
    once(event: string, listener: (...args: unknown[]) => void): void
   }

  class BrowserWindow {
    constructor(options?: Record<string, unknown>)
    loadURL(url: string): Promise<void>
    loadFile(path: string): Promise<void>
    show(): void
    hide(): void
    focus(): void
    isVisible(): boolean
    isDestroyed(): boolean
    once(event: string, listener: (...args: unknown[]) => void): void
    on(event: string, listener: (...args: unknown[]) => void): void
    static getAllWindows(): BrowserWindow[]
    webContents: WebContents
   }

  interface App {
    isPackaged: boolean
    whenReady(): Promise<void>
    getPath(name: string): string
    on(event: string, listener: (...args: unknown[]) => void): void
    quit(): void
   }

  interface GlobalShortcut {
    register(accelerator: string, listener: () => void): boolean
    unregisterAll(): void
   }

  interface IpcMain {
    handle(channel: string, listener: (...args: unknown[]) => unknown): void
    on(channel: string, listener: (...args: unknown[]) => void): void
   }

  export const ipcRenderer: IpcRenderer
  export const contextBridge: ContextBridge
  export type { IpcRendererEvent }
  export const app: App
  export { BrowserWindow }
  export type { WebContents }
  export const globalShortcut: GlobalShortcut
  export const ipcMain: IpcMain
}
