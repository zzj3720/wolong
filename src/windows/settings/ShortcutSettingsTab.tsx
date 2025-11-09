import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

type ShortcutItem = {
  name: WindowShortcutName
  label: string
  description: string
}

const SHORTCUT_ITEMS: ShortcutItem[] = [
  { name: 'launcher', label: '应用启动器', description: '打开启动器并聚焦搜索输入框' },
  { name: 'clipboard', label: '剪贴板历史', description: '显示剪贴板窗口并选中最近条目' },
  { name: 'screenshot', label: '截图捕获', description: '开始新的屏幕截图并将结果发送到剪贴板' },
]

const DEFAULT_SHORTCUTS: WindowShortcutConfig = {
  launcher: 'Alt+Space',
  clipboard: 'Control+Shift+V',
  screenshot: 'Control+Shift+S',
}

const SHORTCUT_LABEL_MAP: Record<WindowShortcutName, string> = SHORTCUT_ITEMS.reduce(
  (accumulator, item) => {
    accumulator[item.name] = item.label
    return accumulator
  },
  {} as Record<WindowShortcutName, string>,
)

function formatShortcutDisplay(accelerator: string): string {
  return accelerator.replace(/\+/g, ' + ')
}

export default function ShortcutSettingsTab() {
  const [shortcutConfig, setShortcutConfig] = useState<WindowShortcutConfig | null>(null)
  const [initialShortcutConfig, setInitialShortcutConfig] = useState<WindowShortcutConfig | null>(null)
  const [shortcutLoading, setShortcutLoading] = useState(true)
  const [shortcutSaving, setShortcutSaving] = useState(false)
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [activeShortcutCapture, setActiveShortcutCapture] = useState<WindowShortcutName | null>(null)
  const [captureSessionActive, setCaptureSessionActive] = useState(false)
  const [localConflicts, setLocalConflicts] = useState<Partial<Record<WindowShortcutName, string>>>({})
  const [remoteConflicts, setRemoteConflicts] = useState<Partial<Record<WindowShortcutName, string>>>({})
  const [showRecommendationDropdown, setShowRecommendationDropdown] = useState<WindowShortcutName | null>(null)
  const previousConfigRef = useRef<WindowShortcutConfig | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const stopShortcutCapture = useCallback(async () => {
    if (!captureSessionActive) {
      return
    }
    try {
      await window.wolong.shortcuts.endCapture()
    } catch (error) {
      console.error('[settings] end capture failed', error)
    } finally {
      setCaptureSessionActive(false)
    }
  }, [captureSessionActive])

  const autoSaveShortcuts = useCallback(async (config: WindowShortcutConfig | null) => {
    if (!config || !initialShortcutConfig) {
      return
    }
    
    // Check for local conflicts (duplicate accelerators)
    const grouped = new Map<string, WindowShortcutName[]>()
    for (const item of SHORTCUT_ITEMS) {
      const value = config[item.name]
      if (!value) {
        continue
      }
      const key = value.toLowerCase()
      const existing = grouped.get(key)
      if (existing) {
        existing.push(item.name)
      } else {
        grouped.set(key, [item.name])
      }
    }
    
    const hasLocalConflicts = Array.from(grouped.values()).some(names => names.length > 1)
    if (hasLocalConflicts) {
      setShortcutError('存在冲突的快捷键，请修改后再保存。')
      return
    }
    
    const pending = SHORTCUT_ITEMS.filter(item => config[item.name] !== initialShortcutConfig[item.name])
    if (pending.length === 0) {
      return
    }
    const payload: Partial<WindowShortcutConfig> = {}
    for (const item of pending) {
      payload[item.name] = config[item.name]
    }

    setShortcutSaving(true)
    try {
      await stopShortcutCapture()
      const result = await window.wolong.shortcuts.update(payload)
      setShortcutConfig(result)
      setInitialShortcutConfig(result)
      setShortcutError(null)
      setRemoteConflicts({})
    } catch (error) {
      console.error('[settings] update shortcuts failed', error)
      const message = error instanceof Error ? error.message : '更新快捷键失败，请重试。'
      const match = message.match(/Failed to register accelerator\s+(.+)/i)
      if (match) {
        const accelerator = match[1]?.trim().toLowerCase()
        if (accelerator && config) {
          setRemoteConflicts(previous => {
            let modified = false
            const next: Partial<Record<WindowShortcutName, string>> = { ...previous }
            for (const item of SHORTCUT_ITEMS) {
              const candidate = config[item.name]
              if (candidate && candidate.toLowerCase() === accelerator) {
                next[item.name] = '该组合键无法注册，可能被系统或其他应用占用'
                modified = true
              }
            }
            return modified ? next : previous
          })
        }
        setShortcutError('部分快捷键无法注册，可能被系统占用。')
      } else {
        setShortcutError(message || '更新快捷键失败，请重试。')
      }
    } finally {
      setShortcutSaving(false)
    }
  }, [initialShortcutConfig, stopShortcutCapture])

  const commitCapturedAccelerator = useCallback(
    async (targetName: WindowShortcutName | null, accelerator: string) => {
      if (!targetName) {
        return
      }
      const key: WindowShortcutName = targetName
      const updatedConfig: WindowShortcutConfig = {
        ...(shortcutConfig || {}),
        [key]: accelerator,
      } as WindowShortcutConfig
      
      setShortcutConfig(updatedConfig)
      setRemoteConflicts(previous => {
        if (!previous[key]) {
          return previous
        }
        const next = { ...previous }
        delete next[key]
        return next
      })
      setActiveShortcutCapture(null)
      setShortcutError(null)
      
      await autoSaveShortcuts(updatedConfig)
    },
    [shortcutConfig, autoSaveShortcuts],
  )

  useEffect(() => {
    let mounted = true
    setShortcutLoading(true)
    window.wolong.shortcuts
      .getAll()
      .then((config) => {
        if (mounted) {
          setShortcutConfig(config)
          setInitialShortcutConfig(config)
          setShortcutError(null)
        }
      })
      .catch((error) => {
        console.error('[settings] load shortcuts failed', error)
        if (mounted) {
          setShortcutError('无法加载快捷键配置，请稍后重试。')
        }
      })
      .finally(() => {
        if (mounted) {
          setShortcutLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!activeShortcutCapture) {
      void stopShortcutCapture()
      return
    }

    const targetName = activeShortcutCapture
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setActiveShortcutCapture(null)
        setShowRecommendationDropdown(null)
        void stopShortcutCapture()
        if (shortcutConfig) {
          void autoSaveShortcuts(shortcutConfig)
        }
        return
      }

      if (event.key === 'Backspace' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        setShowRecommendationDropdown(null)
        const updatedConfig: WindowShortcutConfig = {
          ...(shortcutConfig || {}),
          [targetName]: '',
        } as WindowShortcutConfig
        setShortcutConfig(updatedConfig)
        setActiveShortcutCapture(null)
        void stopShortcutCapture()
        void autoSaveShortcuts(updatedConfig)
        return
      }

      const accelerator = resolveAcceleratorFromEvent(event)
      if (!accelerator) {
        return
      }

      setShowRecommendationDropdown(null)
      commitCapturedAccelerator(targetName, accelerator)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      void stopShortcutCapture()
    }
  }, [activeShortcutCapture, commitCapturedAccelerator, stopShortcutCapture, shortcutConfig, autoSaveShortcuts])

  useEffect(() => {
    return () => {
      void stopShortcutCapture()
    }
  }, [stopShortcutCapture])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowRecommendationDropdown(null)
      }
    }

    if (showRecommendationDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showRecommendationDropdown])


  useEffect(() => {
    if (!activeShortcutCapture) {
      return
    }
    const targetName = activeShortcutCapture
    const dispose = window.wolong.shortcuts.onCaptureFallback(accelerator => {
      commitCapturedAccelerator(targetName, accelerator)
    })
    return () => {
      dispose()
    }
  }, [activeShortcutCapture, commitCapturedAccelerator])

  useEffect(() => {
    if (!shortcutConfig) {
      setLocalConflicts({})
      setRemoteConflicts({})
      previousConfigRef.current = null
      return
    }

    const grouped = new Map<string, WindowShortcutName[]>()
    for (const item of SHORTCUT_ITEMS) {
      const value = shortcutConfig[item.name]
      if (!value) {
        continue
      }
      const key = value.toLowerCase()
      const existing = grouped.get(key)
      if (existing) {
        existing.push(item.name)
      } else {
        grouped.set(key, [item.name])
      }
    }

    const nextConflicts: Partial<Record<WindowShortcutName, string>> = {}
    grouped.forEach((names) => {
      if (names.length <= 1) {
        return
      }
      for (const name of names) {
        const others = names
          .filter((other) => other !== name)
          .map((other) => SHORTCUT_LABEL_MAP[other])
          .filter(Boolean)
        if (others.length === 0) {
          continue
        }
        nextConflicts[name] = `与${others.join('、')}快捷键重复`
      }
    })
    setLocalConflicts(nextConflicts)

    const previous = previousConfigRef.current
    if (previous) {
      let modified = false
      const updated: Partial<Record<WindowShortcutName, string>> = { ...remoteConflicts }
      for (const item of SHORTCUT_ITEMS) {
        const name = item.name
        if (updated[name] && shortcutConfig[name] !== previous[name]) {
          delete updated[name]
          modified = true
        }
      }
      if (modified) {
        setRemoteConflicts(updated)
      }
    }

    previousConfigRef.current = shortcutConfig
  }, [remoteConflicts, shortcutConfig])

  const combinedConflicts = useMemo(() => {
    const merged: Partial<Record<WindowShortcutName, string>> = { ...localConflicts }
    for (const [name, message] of Object.entries(remoteConflicts)) {
      if (message) {
        merged[name as WindowShortcutName] = message
      } else {
        delete merged[name as WindowShortcutName]
      }
    }
    return merged
  }, [localConflicts, remoteConflicts])

  const hasConflicts = useMemo(() => Object.keys(combinedConflicts).length > 0, [combinedConflicts])

  const startShortcutCapture = useCallback(
    async (name: WindowShortcutName) => {
      if (!shortcutConfig || shortcutSaving || shortcutLoading) {
        return
      }
      if (activeShortcutCapture === name) {
        return
      }
      await stopShortcutCapture()
      try {
        await window.wolong.shortcuts.beginCapture()
        setCaptureSessionActive(true)
        setActiveShortcutCapture(name)
        setShortcutError(null)
      } catch (error) {
        console.error('[settings] begin shortcut capture failed', error)
        setShortcutError('无法进入录制模式，请稍后再试。')
        setActiveShortcutCapture(null)
      }
    },
    [activeShortcutCapture, shortcutConfig, shortcutLoading, shortcutSaving, stopShortcutCapture],
  )

  const handleShortcutResetSingle = useCallback(async (name: WindowShortcutName) => {
    setActiveShortcutCapture(null)
    void stopShortcutCapture()
    const updatedConfig: WindowShortcutConfig = {
      ...(shortcutConfig || {}),
      [name]: DEFAULT_SHORTCUTS[name],
    } as WindowShortcutConfig
    
    setShortcutConfig(updatedConfig)
    setRemoteConflicts(previous => {
      if (!previous[name]) {
        return previous
      }
      const next = { ...previous }
      delete next[name]
      return next
    })
    setShortcutError(null)
    
    await autoSaveShortcuts(updatedConfig)
  }, [stopShortcutCapture, shortcutConfig, autoSaveShortcuts])

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold">全局快捷键</h3>
            <p className="text-sm text-muted-foreground">
              设置全局键盘快捷键，修改后立即生效。
            </p>
          </div>
        </div>
        {hasConflicts && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            存在冲突的快捷键，请修改后再保存。
          </div>
        )}
        {shortcutError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {shortcutError}
          </div>
        )}
        <div className="space-y-3">
          {SHORTCUT_ITEMS.map((shortcut, index) => {
            const currentValue = shortcutConfig?.[shortcut.name]
            const captureInProgress = activeShortcutCapture !== null
            const isRecording = activeShortcutCapture === shortcut.name
            const isDefault = currentValue === DEFAULT_SHORTCUTS[shortcut.name]
            const conflictMessage = combinedConflicts[shortcut.name]
            return (
              <div key={shortcut.name}>
                <div className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-[140px]">
                    <Label className="text-sm font-medium">{shortcut.label}</Label>
                    <p className="text-xs text-muted-foreground">{shortcut.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-[200px]">
                      <div
                        onClick={() => {
                          if (
                            !shortcutLoading &&
                            !shortcutSaving &&
                            shortcutConfig &&
                            !(captureInProgress && !isRecording) &&
                            !captureSessionActive
                          ) {
                            if (showRecommendationDropdown === shortcut.name) {
                              setShowRecommendationDropdown(null)
                              void startShortcutCapture(shortcut.name)
                            } else if (!isDefault && currentValue && currentValue !== DEFAULT_SHORTCUTS[shortcut.name]) {
                              setShowRecommendationDropdown(shortcut.name)
                              void startShortcutCapture(shortcut.name)
                            } else {
                              void startShortcutCapture(shortcut.name)
                            }
                          }
                        }}
                        className={`w-full h-[32px] rounded-md border px-3 text-center transition-colors flex items-center justify-center ${
                          isRecording
                            ? 'border-primary text-primary cursor-default'
                            : shortcutLoading ||
                              shortcutSaving ||
                              !shortcutConfig ||
                              (captureInProgress && !isRecording) ||
                              captureSessionActive
                            ? 'bg-muted cursor-not-allowed'
                            : 'bg-muted cursor-pointer hover:bg-muted/80'
                        }`}
                      >
                        {isRecording ? (
                          <div className="font-mono text-sm leading-tight">
                            <div>按下组合键…</div>
                            <div className="text-[10px] text-muted-foreground font-normal mt-0.5">Esc 取消 / Backspace 删除</div>
                          </div>
                        ) : (
                          <div className="font-mono text-sm">
                            {currentValue
                              ? formatShortcutDisplay(currentValue)
                              : shortcutLoading
                                ? '…'
                                : formatShortcutDisplay(DEFAULT_SHORTCUTS[shortcut.name])}
                          </div>
                        )}
                      </div>
                      {showRecommendationDropdown === shortcut.name && !isDefault && (
                        <div
                          ref={dropdownRef}
                          className="absolute top-full right-0 mt-1 z-50 min-w-[200px] rounded-md border bg-background shadow-lg"
                        >
                          <div className="p-1">
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">推荐快捷键</div>
                            <button
                              onClick={async () => {
                                setShowRecommendationDropdown(null)
                                await handleShortcutResetSingle(shortcut.name)
                              }}
                              className="w-full text-left px-2 py-1.5 rounded text-sm font-mono hover:bg-muted transition-colors"
                            >
                              {formatShortcutDisplay(DEFAULT_SHORTCUTS[shortcut.name])}
                            </button>
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">或按下新的组合键</div>
                          </div>
                        </div>
                      )}
                    </div>
                    {conflictMessage && (
                      <p className="text-xs text-destructive shrink-0">
                        {conflictMessage}
                      </p>
                    )}
                  </div>
                </div>
                {index < SHORTCUT_ITEMS.length - 1 && <Separator className="my-1" />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function resolveAcceleratorFromEvent(event: KeyboardEvent): string | null {
  const key = normalizeAcceleratorKey(event)
  if (!key) {
    return null
  }

  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Control')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.altKey) modifiers.push('Alt')
  if (event.metaKey) modifiers.push('Super')

  const isFunctionKey = /^F\d{1,2}$/i.test(key)
  if (modifiers.length === 0 && !isFunctionKey) {
    return null
  }

  if (modifiers.length === 0) {
    return key
  }

  return `${modifiers.join('+')}+${key}`
}

function normalizeAcceleratorKey(event: KeyboardEvent): string | null {
  const { code, key } = event
  if (!key) {
    return null
  }

  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
    return null
  }

  if (key === ' ') {
    return 'Space'
  }

  if (key === 'Escape') {
    return 'Escape'
  }

  if (key === 'Tab') {
    return 'Tab'
  }

  if (key === 'Backspace') {
    return 'Backspace'
  }

  if (key.startsWith('Arrow')) {
    return key.replace('Arrow', '')
  }

  if (/^F\d{1,2}$/i.test(key)) {
    return key.toUpperCase()
  }

  if (code.startsWith('Key')) {
    return code.slice(3).toUpperCase()
  }

  if (code.startsWith('Digit')) {
    return code.slice(5)
  }

  if (code.startsWith('Numpad')) {
    const suffix = code.slice(6)
    const numpadMap: Record<string, string> = {
      Add: 'numadd',
      Subtract: 'numsub',
      Multiply: 'nummult',
      Divide: 'numdiv',
      Decimal: 'numdec',
      Enter: 'numenter',
    }
    if (suffix in numpadMap) {
      return numpadMap[suffix]
    }
    if (/^\d$/.test(suffix)) {
      return `num${suffix}`
    }
  }

  if (key.length === 1) {
    return /[a-z]/i.test(key) ? key.toUpperCase() : key
  }

  return key
}


