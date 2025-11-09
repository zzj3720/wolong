import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatClipboardLabel, formatRelativeTime } from '@/utils/format'

const MAX_ENTRIES = 200

export default function ClipboardApp() {
  const [entries, setEntries] = useState<WindowClipboardEntry[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const shouldIgnoreBlurRef = useRef(false)

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) {
      return entries
    }
    const shard = searchTerm.trim().toLowerCase()
    return entries.filter((entry) => {
      return (
        entry.text?.toLowerCase().includes(shard) ||
        entry.format.toLowerCase().includes(shard) ||
        (entry.image ? 'image'.includes(shard) : false)
      )
    })
  }, [entries, searchTerm])

  useEffect(() => {
    if (activeIndex >= filteredEntries.length) {
      setActiveIndex(filteredEntries.length ? filteredEntries.length - 1 : 0)
    }
  }, [filteredEntries.length, activeIndex])

  const hideWindow = useCallback(() => {
    void window.wolong.window.hide('clipboard')
  }, [])

  const handleContainerPointerDown = useCallback(() => {
    shouldIgnoreBlurRef.current = true
    setTimeout(() => {
      shouldIgnoreBlurRef.current = false
    }, 0)
  }, [])

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  const handleInputBlur = useCallback(() => {
    if (shouldIgnoreBlurRef.current) {
      focusInput()
    } else {
      hideWindow()
    }
  }, [focusInput, hideWindow])

  const applyEntry = useCallback(
    async (entry: WindowClipboardEntry | undefined) => {
      if (!entry) {
        return
      }
      try {
        await window.wolong.clipboard.apply(entry)
      } catch (error) {
        console.error('[clipboard] apply failed', error)
      } finally {
        hideWindow()
      }
    },
    [hideWindow],
  )

  useEffect(() => {
    let mounted = true
    focusInput()
    window.wolong.clipboard
      .history(MAX_ENTRIES)
      .then((history) => {
        if (mounted) {
          setEntries(history)
        }
      })
      .catch((error) => {
        console.error('[clipboard] history load failed', error)
      })

    const unsubscribe = window.wolong.clipboard.subscribe((entry) => {
      setEntries((prev) => {
        const next = [entry, ...prev.filter((item) => item.sequence !== entry.sequence)]
        return next.slice(0, MAX_ENTRIES)
      })
    })

    const disposeShortcut = window.wolong.shortcuts.onClipboard(() => {
      setActiveIndex(0)
      setSearchTerm('')
      focusInput()
    })

    return () => {
      mounted = false
      unsubscribe()
      disposeShortcut()
    }
  }, [focusInput])

  useEffect(() => {
    const root = listRef.current
    if (!root) {
      return
    }
    const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) {
      return
    }
    const active = viewport.querySelector<HTMLLIElement>('li[data-active="true"]')
    if (active) {
      const { offsetTop, offsetHeight } = active
      const top = offsetTop
      const bottom = offsetTop + offsetHeight
      if (top < viewport.scrollTop) {
        viewport.scrollTop = top
      } else if (bottom > viewport.scrollTop + viewport.clientHeight) {
        viewport.scrollTop = bottom - viewport.clientHeight
      }
    }
  }, [activeIndex, filteredEntries])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        hideWindow()
        return
      }

      if (!filteredEntries.length) {
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((prev) => (prev + 1) % filteredEntries.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((prev) => (prev - 1 + filteredEntries.length) % filteredEntries.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        void applyEntry(filteredEntries[activeIndex])
      }
    },
    [activeIndex, applyEntry, filteredEntries, hideWindow],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  return (
    <div
      onPointerDown={handleContainerPointerDown}
      className="flex h-screen w-screen flex-col bg-gray-800 text-white"
    >
      <header className="border-b border-white/10 px-6 pb-4 pt-6">
        <input
          ref={inputRef}
          className="w-full bg-transparent px-[4px] py-[4px] text-lg font-medium text-white placeholder:text-white/50 outline-none transition"
          placeholder="Search clipboard history…"
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value)
            setActiveIndex(0)
          }}
          onBlur={handleInputBlur}
        />
      </header>

      <ScrollArea
        ref={listRef}
        className="flex-1 h-0 min-w-0 w-full max-w-full px-3 pb-6 pt-4 [&_[data-slot=scroll-area-thumb]]:bg-white/20 [&_[data-slot=scroll-area-thumb]]:hover:bg-white/30 [&_[data-slot=scroll-area-viewport]]:w-full [&_[data-slot=scroll-area-viewport]]:max-w-full [&_[data-slot=scroll-area-viewport]]:min-w-0"
      >
        {filteredEntries.length === 0 ? (
          <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 text-center text-white/60">
            <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
              {searchTerm.trim() ? 'No matches' : 'No clipboard items'}
            </div>
            <p className="text-sm">
              {searchTerm.trim()
                ? 'Try another keyword or copy fresh content.'
                : 'Copy something new and it will appear here instantly.'}
            </p>
          </div>
        ) : (
          <ul className="w-full max-w-full min-w-0 space-y-1">
            {filteredEntries.map((entry, index) => {
              const isActive = index === activeIndex
              const label = formatClipboardLabel(entry)
              const previewLetter = label.charAt(0).toUpperCase()
              return (
                <li
                  key={entry.sequence}
                  data-active={isActive ? 'true' : 'false'}
                  className={
                    'group cursor-pointer rounded-lg px-3 py-2 transition w-full max-w-full min-w-0 box-border ' +
                    (isActive ? 'bg-white/10' : 'hover:bg-white/5')
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onDoubleClick={() => {
                    void applyEntry(entry)
                  }}
                >
                  <div className="flex items-start gap-3 w-full max-w-full min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10 text-sm font-semibold text-indigo-300">
                      {entry.image ? (
                        <img src={entry.image.dataUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        previewLetter || '∙'
                      )}
                    </div>
                    <div className="min-w-0 flex-1 max-w-full">
                      <p className="text-base font-medium text-white flex items-center min-w-0">
                        <span className="truncate">{label}</span>
                        <span className="ml-2 text-sm text-white/50 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-[opacity,max-width] duration-150 ease-out flex-shrink overflow-hidden max-w-0 group-hover:max-w-[320px] truncate">
                          {entry.format}
                        </span>
                      </p>
                      {entry.text && (
                        <p className="mt-1 text-sm text-white/80 max-h-16 overflow-hidden break-words whitespace-pre-line leading-relaxed">
                          {entry.text}
                        </p>
                      )}
                      {entry.image && (
                        <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                          <img
                            src={entry.image.dataUrl}
                            alt="Clipboard preview"
                            className="block max-h-56 w-full object-contain"
                          />
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between text-xs text-white/50">
                        <span>{formatRelativeTime(entry.timestamp)}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out">
                          Sequence #{entry.sequence}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
