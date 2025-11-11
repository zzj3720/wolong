import { ipcRenderer, contextBridge, IpcRendererEvent } from 'electron'

type Unsubscribe = () => void

let clipboardSubscriptionCount = 0

type WindowType = 'settings' | 'launcher' | 'clipboard' | 'screenshot' | 'chat'
type WindowShortcutName = 'launcher' | 'clipboard' | 'screenshot' | 'chat'
type WindowShortcutConfig = Record<WindowShortcutName, string>
type WindowChatWindowState = 'normal' | 'maximized' | 'fullscreen'
type WindowSettingsWindowState = 'normal' | 'maximized' | 'fullscreen'

const WINDOW_TYPES: readonly WindowType[] = ['settings', 'launcher', 'clipboard', 'screenshot', 'chat']

const currentWindowType: WindowType = (() => {
  try {
    const search = globalThis.location?.search ?? ''
    const params = new URLSearchParams(search)
    const value = params.get('window')
    if (value && (WINDOW_TYPES as readonly string[]).includes(value)) {
      return value as WindowType
    }
  } catch {
    // ignore failures and fall back to default
  }
  return 'settings'
})()

function resolveWindowTarget(target?: WindowType): WindowType {
  if (target) {
    return target
  }
  return currentWindowType
}

function registerVoidChannel(channel: string, handler: () => void): Unsubscribe {
  const listener: Parameters<typeof ipcRenderer.on>[1] = () => handler()
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

function registerPayloadChannel<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener: Parameters<typeof ipcRenderer.on>[1] = (_event, ...args: unknown[]) => {
    handler(args[0] as T)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

function registerMultiPayloadChannel<T extends unknown[]>(
  channel: string,
  handler: (...payload: T) => void,
): Unsubscribe {
  const listener: Parameters<typeof ipcRenderer.on>[1] = (_event, ...args: unknown[]) => {
    handler(...(args as T))
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

function subscribeClipboard(handler: (payload: WindowClipboardEntry) => void): Unsubscribe {
  const teardownListener = registerPayloadChannel<WindowClipboardEntry>('clipboard:update', handler)

  if (clipboardSubscriptionCount === 0) {
    ipcRenderer.send('clipboard:subscribe')
  }
  clipboardSubscriptionCount += 1

  let active = true
  return () => {
    if (!active) {
      return
    }
    active = false
    teardownListener()
    clipboardSubscriptionCount = Math.max(clipboardSubscriptionCount - 1, 0)
    if (clipboardSubscriptionCount === 0) {
      ipcRenderer.send('clipboard:unsubscribe')
    }
  }
}

window.addEventListener('beforeunload', () => {
  if (clipboardSubscriptionCount > 0) {
    clipboardSubscriptionCount = 0
    ipcRenderer.send('clipboard:unsubscribe')
    ipcRenderer.removeAllListeners('clipboard:update')
  }
})

// --------- Expose structured APIs to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event: IpcRendererEvent, ...rest: unknown[]) => listener(event, ...rest))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...rest] = args
    return ipcRenderer.off(channel, ...rest)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...rest] = args
    return ipcRenderer.send(channel, ...rest)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...rest] = args
    return ipcRenderer.invoke(channel, ...rest)
  },
})

contextBridge.exposeInMainWorld('wolong', {
  launcher: {
    scan(startMenuPaths?: string[], registryPaths?: string[]): Promise<WindowLauncherApp[]> {
      return ipcRenderer.invoke('launcher:scan', startMenuPaths, registryPaths)
    },
    cache(): Promise<WindowLauncherApp[]> {
      return ipcRenderer.invoke('launcher:cache')
    },
    clearCache(): Promise<boolean> {
      return ipcRenderer.invoke('launcher:clearCache')
    },
    onIndexed(handler: (apps: WindowLauncherApp[]) => void): Unsubscribe {
      return registerPayloadChannel('launcher:indexed', handler)
    },
    open(app: WindowLauncherApp): Promise<void> {
      return ipcRenderer.invoke('launcher:open', app)
    },
  },
  screenshot: {
    capture(): Promise<WindowScreenshotFrame> {
      return ipcRenderer.invoke('screenshot:capture')
    },
    onShortcut(handler: (frame: WindowScreenshotFrame) => void): Unsubscribe {
      return registerPayloadChannel('shortcut:screenshot', handler)
    },
    complete(selection: WindowScreenshotSelection): Promise<void> {
      return ipcRenderer.invoke('screenshot:complete', selection)
    },
  },
  clipboard: {
    subscribe(handler: (entry: WindowClipboardEntry) => void): Unsubscribe {
      return subscribeClipboard(handler)
    },
    history(limit?: number): Promise<WindowClipboardEntry[]> {
      return ipcRenderer.invoke('clipboard:history', limit ?? 50)
    },
    apply(entry: WindowClipboardEntry): Promise<void> {
      return ipcRenderer.invoke('clipboard:apply', entry)
    },
  },
  shortcuts: {
    onLauncher(handler: () => void): Unsubscribe {
      return registerVoidChannel('shortcut:launcher', handler)
    },
    onClipboard(handler: () => void): Unsubscribe {
      return registerVoidChannel('shortcut:clipboard', handler)
    },
    onChat(handler: () => void): Unsubscribe {
      return registerVoidChannel('shortcut:chat', handler)
    },
    getAll(): Promise<WindowShortcutConfig> {
      return ipcRenderer.invoke('shortcuts:get')
    },
    update(config: Partial<WindowShortcutConfig>): Promise<WindowShortcutConfig> {
      return ipcRenderer.invoke('shortcuts:update', config)
    },
    reset(): Promise<WindowShortcutConfig> {
      return ipcRenderer.invoke('shortcuts:reset')
    },
    beginCapture(): Promise<void> {
      return ipcRenderer.invoke('shortcuts:capture:start')
    },
    endCapture(): Promise<void> {
      return ipcRenderer.invoke('shortcuts:capture:end')
    },
    onCaptureFallback(handler: (accelerator: string) => void): Unsubscribe {
      return registerPayloadChannel('shortcut:capture:fallback', handler)
    },
  },
  chat: {
    getConfig(): Promise<WindowChatSettings> {
      return ipcRenderer.invoke('chat:config:get')
    },
    saveConfig(config: Partial<WindowChatSettings>): Promise<WindowChatSettings> {
      return ipcRenderer.invoke('chat:config:set', config)
    },
    listSessions(limit?: number): Promise<WindowChatSession[]> {
      return ipcRenderer.invoke('chat:sessions:list', limit)
    },
    getMessages(sessionId: string): Promise<WindowChatMessage[]> {
      return ipcRenderer.invoke('chat:messages:get', sessionId)
    },
    send(payload: WindowChatSendInput): Promise<WindowChatSendResult> {
      return ipcRenderer.invoke('chat:send', payload)
    },
    sendStream(payload: WindowChatSendInput): Promise<{ streamId: string }> {
      return ipcRenderer.invoke('chat:sendStream', payload)
    },
    onStreamChunk(handler: (streamId: string, chunk: WindowChatStreamChunk) => void): Unsubscribe {
      return registerMultiPayloadChannel<[string, WindowChatStreamChunk]>('chat:streamChunk', (streamId, chunk) => {
        handler(streamId, chunk)
      })
    },
    onStreamError(handler: (streamId: string, error: string) => void): Unsubscribe {
      return registerMultiPayloadChannel<[string, string]>('chat:streamError', (streamId, error) => {
        handler(streamId, error)
      })
    },
    window: {
      minimize(): Promise<void> {
        return ipcRenderer.invoke('chat:window:minimize')
      },
      toggleMaximize(): Promise<void> {
        return ipcRenderer.invoke('chat:window:toggleMaximize')
      },
      close(): Promise<void> {
        return ipcRenderer.invoke('chat:window:close')
      },
      getState(): Promise<WindowChatWindowState> {
        return ipcRenderer.invoke('chat:window:getState')
      },
      onStateChange(handler: (state: WindowChatWindowState) => void): Unsubscribe {
        return registerPayloadChannel('chat:window-state', handler)
      },
    },
  },
  native: {
    version(): Promise<string> {
      return ipcRenderer.invoke('native:version')
    },
    scanPaths(): Promise<{ start_menu_paths: string[]; registry_paths: string[] }> {
      return ipcRenderer.invoke('launcher:scanPaths')
    },
  },
  window: {
    show(target?: WindowType): Promise<void> {
      return ipcRenderer.invoke('window:show', resolveWindowTarget(target))
    },
    hide(target?: WindowType): Promise<void> {
      return ipcRenderer.invoke('window:hide', resolveWindowTarget(target))
    },
    get current(): WindowType {
      return currentWindowType
    },
  },
  settings: {
    window: {
      minimize(): Promise<void> {
        return ipcRenderer.invoke('settings:window:minimize')
      },
      toggleMaximize(): Promise<void> {
        return ipcRenderer.invoke('settings:window:toggleMaximize')
      },
      close(): Promise<void> {
        return ipcRenderer.invoke('settings:window:close')
      },
      getState(): Promise<WindowSettingsWindowState> {
        return ipcRenderer.invoke('settings:window:getState')
      },
      onStateChange(handler: (state: WindowSettingsWindowState) => void): Unsubscribe {
        return registerPayloadChannel('settings:window-state', handler)
      },
    },
  },
})
