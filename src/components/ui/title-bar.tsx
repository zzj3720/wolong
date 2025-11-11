import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type React from 'react'

import { Minus, Maximize2, Minimize2, X } from 'lucide-react'

type WindowType = 'chat' | 'settings'
type WindowState = 'normal' | 'maximized' | 'fullscreen'

const TITLEBAR_DRAG_STYLE = { WebkitAppRegion: 'drag' } as React.CSSProperties
const TITLEBAR_NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

interface TitleBarProps {
  windowType: WindowType
  title?: string
}

export function TitleBar({ windowType, title }: TitleBarProps) {
  const [windowState, setWindowState] = useState<WindowState>('normal')

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | null = null

    const windowAPI = windowType === 'chat' ? window.wolong.chat.window : window.wolong.settings.window

    windowAPI
      .getState()
      .then(state => {
        if (!disposed) {
          setWindowState(state)
        }
      })
      .catch(error => {
        console.error(`[${windowType}] get window state failed`, error)
      })
    unsubscribe = windowAPI.onStateChange(state => {
      if (!disposed) {
        setWindowState(state)
      }
    })
    return () => {
      disposed = true
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [windowType])

  const handleMinimize = useCallback(() => {
    const windowAPI = windowType === 'chat' ? window.wolong.chat.window : window.wolong.settings.window
    void windowAPI.minimize()
  }, [windowType])

  const handleToggleMaximize = useCallback(() => {
    const windowAPI = windowType === 'chat' ? window.wolong.chat.window : window.wolong.settings.window
    void windowAPI.toggleMaximize()
  }, [windowType])

  const handleClose = useCallback(() => {
    const windowAPI = windowType === 'chat' ? window.wolong.chat.window : window.wolong.settings.window
    void windowAPI.close()
  }, [windowType])

  const handleTitleBarDoubleClick = useCallback(() => {
    void handleToggleMaximize()
  }, [handleToggleMaximize])

  const isMaximized = windowState === 'maximized' || windowState === 'fullscreen'
  const displayTitle = title ?? (windowType === 'chat' ? 'Chat' : 'Settings')

  const isLight = true // Use light theme for all windows
  const titleBarClass = isLight
    ? 'flex h-9 items-center justify-between border-b border-gray-200 bg-white px-4 text-[11px] text-gray-600'
    : 'flex h-9 items-center justify-between border-b border-[#191b21] bg-[#0a0b0f]/95 px-4 text-[11px] text-[#9a9daa]'
  const titleClass = isLight
    ? 'flex items-center gap-2 text-gray-900'
    : 'flex items-center gap-2 text-[#d5d7de]'
  const titleTextClass = isLight ? 'text-[12px] text-gray-700' : 'text-[12px] text-[#82858f]'

  return (
    <div
      className={titleBarClass}
      style={TITLEBAR_DRAG_STYLE}
      onDoubleClick={handleTitleBarDoubleClick}
    >
      <div className={titleClass} style={TITLEBAR_NO_DRAG_STYLE}>
        <span className={titleTextClass}>{displayTitle}</span>
      </div>
      <div className="flex items-center gap-1" style={TITLEBAR_NO_DRAG_STYLE}>
        <TitleBarButton onClick={handleMinimize} ariaLabel="最小化" isLight={isLight}>
          <Minus className="h-3.5 w-3.5" />
        </TitleBarButton>
        <TitleBarButton
          onClick={handleToggleMaximize}
          ariaLabel={isMaximized ? '还原窗口' : '最大化窗口'}
          isLight={isLight}
        >
          {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </TitleBarButton>
        <TitleBarButton onClick={handleClose} ariaLabel="关闭窗口" variant="danger" isLight={isLight}>
          <X className="h-3.5 w-3.5" />
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({
  onClick,
  ariaLabel,
  children,
  variant = 'default',
  isLight = false,
}: {
  onClick: () => void
  ariaLabel: string
  children: ReactNode
  variant?: 'default' | 'danger'
  isLight?: boolean
}) {
  const baseClass =
    'flex h-7 w-7 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#4d515d]/40'
  const colorClass = isLight
    ? variant === 'danger'
      ? 'text-gray-600 hover:bg-rose-500/80 hover:text-white'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    : variant === 'danger'
      ? 'text-[#f1f2f5] hover:bg-rose-500/80 hover:text-white'
      : 'text-[#a1a5b1] hover:bg-[#1d2029] hover:text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`${baseClass} ${colorClass}`}
      style={TITLEBAR_NO_DRAG_STYLE}
    >
      {children}
    </button>
  )
}

