import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { ScrollArea } from '@/components/ui/scroll-area'
import { formatClipboardLabel } from '@/utils/format'

const MAX_ENTRIES = 200
const ROW_HEIGHT = 84
const ROW_GAP = 8

type ImageMeta = { width: number; height: number; approxSizeKb: number }

function estimateImageSizeKb(dataUrl: string): number {
  const [, base64 = ''] = dataUrl.split(',')
  if (!base64) {
    return 0
  }
  const sizeInBytes = Math.floor((base64.length * 3) / 4)
  return Math.max(1, Math.round(sizeInBytes / 1024))
}

function formatRelativeTimeZh(timestamp: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - timestamp)
  const minutes = Math.floor(delta / 60000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`

  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks} 周前`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`

  const years = Math.floor(days / 365)
  return `${years} 年前`
}

function getBadgeLabel(entry: WindowClipboardEntry): string {
  if (entry.image) return '图'
  if (entry.text) return '文'
  return '原'
}

function getClipboardLabel(entry: WindowClipboardEntry): string {
  if (entry.image) {
    return '图片'
  }
  const label = formatClipboardLabel(entry)
  if (!label || label === 'Image') {
    return entry.format || '剪贴板记录'
  }
  return label
}

function formatAbsoluteTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(timestamp))
}

export default function ClipboardApp() {
  const [entries, setEntries] = useState<WindowClipboardEntry[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
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

  const activeEntry = filteredEntries[activeIndex] ?? null

  // Get available formats for current entry
  const availableFormats = useMemo(() => {
    if (!activeEntry?.format) return []
    return activeEntry.format.split(',').map(f => f.trim()).filter(f => {
      if (f === 'text') return !!activeEntry.text
      if (f === 'html') return !!activeEntry.html
      if (f === 'image') return !!activeEntry.image
      return false
    })
  }, [activeEntry])

  // Reset selected format when entry changes
  useEffect(() => {
    if (activeEntry && availableFormats.length > 0) {
      // Auto-select format: prefer html over text, but keep current selection if still valid
      if (selectedFormat && availableFormats.includes(selectedFormat)) {
        return
      }
      if (availableFormats.includes('html')) {
        setSelectedFormat('html')
      } else if (availableFormats.includes('text')) {
        setSelectedFormat('text')
      } else {
        setSelectedFormat(availableFormats[0] || null)
      }
    } else {
      setSelectedFormat(null)
    }
  }, [activeEntry?.sequence, availableFormats])

  const textStats = useMemo(() => {
    const text = activeEntry?.html || activeEntry?.text
    if (!text) {
      return null
    }
    const trimmed = text.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    const lines = text.split(/\r?\n/).length
    return {
      characters: text.length,
      words,
      lines,
    }
  }, [activeEntry?.text, activeEntry?.html])

  useEffect(() => {
    const image = activeEntry?.image
    if (!image) {
      setImageMeta(null)
      return
    }
    const approxSizeKb = estimateImageSizeKb(image.dataUrl)
    if (typeof Image === 'undefined') {
      setImageMeta({ width: 0, height: 0, approxSizeKb })
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) {
        setImageMeta({
          width: img.naturalWidth,
          height: img.naturalHeight,
          approxSizeKb,
        })
      }
    }
    img.onerror = () => {
      if (!cancelled) {
        setImageMeta({ width: 0, height: 0, approxSizeKb })
      }
    }
    img.src = image.dataUrl
    return () => {
      cancelled = true
    }
  }, [activeEntry?.image])

  const listVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

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

  const virtualItems = listVirtualizer.getVirtualItems()
  const virtualListHeight =
    (listVirtualizer.getTotalSize() || filteredEntries.length * ROW_HEIGHT || ROW_HEIGHT) + 
    (filteredEntries.length > 0 ? (filteredEntries.length - 1) * ROW_GAP : 0)
  const hasEntries = filteredEntries.length > 0
  const relativeTimestamp = activeEntry ? formatRelativeTimeZh(activeEntry.timestamp) : ''
  const absoluteTimestamp = activeEntry ? formatAbsoluteTime(activeEntry.timestamp) : ''

  return (
    <div
      onPointerDown={handleContainerPointerDown}
      className="flex h-screen w-screen bg-white text-gray-900"
    >
      <div className="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
        <header className="border-b border-gray-200 px-3 py-4">
          <input
            ref={inputRef}
            className="w-full bg-transparent px-[4px] py-[4px] text-[13px] font-medium text-gray-900 placeholder:text-gray-400 outline-none transition"
            placeholder="搜索剪贴板记录"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setActiveIndex(0)
            }}
            onBlur={handleInputBlur}
          />
        </header>

        <ScrollArea
          viewportRef={viewportRef}
          className="flex-1"
        >
          <div className="py-1">
            {hasEntries ? (
              <div className="relative w-full" style={{ height: virtualListHeight }}>
                {virtualItems.map((virtualRow) => {
                  const index = virtualRow.index
                  const entry = filteredEntries[index]
                  if (!entry) {
                    return null
                  }
                  const isActive = index === activeIndex
                  const label = getClipboardLabel(entry)
                  const badge = getBadgeLabel(entry)
                  return (
                    <div
                      key={entry.sequence}
                      className={`absolute left-0 top-0 w-full px-3 flex items-center transition ${
                        isActive ? 'bg-gray-300' : ''
                      }`}
                      style={{
                        transform: `translateY(${virtualRow.start + virtualRow.index * ROW_GAP}px)`,
                        height: `${ROW_HEIGHT + ROW_GAP}px`,
                      }}
                    >
                      <button
                        type="button"
                        data-active={isActive ? 'true' : 'false'}
                        className={
                          'group flex w-full rounded-md text-left text-sm transition overflow-hidden ' +
                          (entry.image ? 'items-center justify-center transparent-bg border border-gray-400' : 'items-start px-3 py-2') +
                          ' ' +
                          (!isActive ? 'hover:bg-gray-50' : '')
                        }
                        style={{ height: `${ROW_HEIGHT}px` }}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => setActiveIndex(index)}
                        onDoubleClick={() => {
                          void applyEntry(entry)
                        }}
                      >
                        {entry.image ? (
                          <img src={entry.image.dataUrl} alt="" className="h-full w-full object-cover rounded-md" />
                        ) : (
                          <span className="min-w-0 flex-1 text-[13px] font-medium text-gray-900 line-clamp-3 break-words">{label}</span>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mx-auto mt-16 flex max-w-[220px] flex-col items-center gap-3 px-4 text-center text-gray-500">
                <div className="rounded-full border border-gray-200 bg-gray-100 px-4 py-1 text-[11px] font-semibold tracking-[0.3em] text-gray-600">
                  {searchTerm.trim() ? '没有符合条件的记录' : '暂无剪贴板记录'}
                </div>
                <p className="text-[11px] text-gray-500">
                  {searchTerm.trim() ? '换个关键词，或者重新复制内容试试。' : '复制任意内容即可立即显示在这里。'}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
        {activeEntry ? (
          <>
            {activeEntry.image && !activeEntry.text && (
              <div className="flex-1 min-h-0 overflow-auto transparent-bg">
                <div className="flex h-full w-full items-center justify-center py-8">
                  <img
                    src={activeEntry.image.dataUrl}
                    alt="剪贴板图片预览"
                    className="h-auto w-auto max-h-full max-w-full object-contain"
                  />
                </div>
              </div>
            )}
            {!activeEntry.image && (activeEntry.text || activeEntry.html) && (
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-8 py-6">
                  {(selectedFormat === 'html' || (!activeEntry.text && activeEntry.html)) && activeEntry.html ? (
                    <div 
                      className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-900"
                      dangerouslySetInnerHTML={{ __html: activeEntry.html }}
                    />
                  ) : activeEntry.text ? (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-900">{activeEntry.text}</pre>
                  ) : null}
                </div>
              </ScrollArea>
            )}
            {activeEntry.image && activeEntry.text && (
              <ScrollArea className="flex-1">
                <div className="space-y-6 px-8 py-6">
                  <section className="space-y-3">
                    <p className="text-base font-semibold text-gray-900">文本内容</p>
                    <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm leading-relaxed text-gray-900">
                      <pre className="whitespace-pre-wrap break-words font-sans">{activeEntry.text}</pre>
                    </div>
                  </section>
                  <section className="space-y-3">
                    <p className="text-base font-semibold text-gray-900">图片预览</p>
                    <div className="rounded-lg bg-gray-100 border border-gray-200 p-4">
                      <img
                        src={activeEntry.image.dataUrl}
                        alt="剪贴板图片预览"
                        className="mx-auto max-h-[360px] w-auto max-w-full object-contain"
                      />
                    </div>
                  </section>
                </div>
              </ScrollArea>
            )}
            {!activeEntry.text && !activeEntry.image && (
              <ScrollArea className="flex-1">
                <div className="px-8 py-6">
                  <section className="space-y-3">
                    <p className="text-base font-semibold text-gray-900">内容说明</p>
                    <p className="text-[11px] text-gray-600">该记录仅包含 {activeEntry.format} 数据，暂无可视化预览。</p>
                  </section>
                </div>
              </ScrollArea>
            )}
            <div className={`flex-shrink-0 bg-gray-50 px-6 pb-4 space-y-2 ${(activeEntry.image && !activeEntry.text && !activeEntry.html) || ((activeEntry.text || activeEntry.html) && !activeEntry.image) ? 'pt-0' : 'pt-6'}`}>
              {activeEntry.image && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-900">
                  <span>
                    {imageMeta && imageMeta.width > 0 && imageMeta.height > 0
                      ? `${imageMeta.width} × ${imageMeta.height}`
                      : '未知'}
                  </span>
                  <span>
                    {imageMeta ? `${imageMeta.approxSizeKb} KB` : '计算中…'}
                  </span>
                  <span>
                    {activeEntry.image.mimeType}
                  </span>
                </div>
              )}
              {(activeEntry.text || activeEntry.html) && textStats && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-900">
                  <span>{textStats.characters} 字符</span>
                  <span>{textStats.lines} 行</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-600">
                  {relativeTimestamp} · {absoluteTimestamp}
                </div>
                {availableFormats.length > 1 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {availableFormats.map((format) => {
                      const formatLabels: Record<string, string> = {
                        text: '文本',
                        html: 'HTML',
                        image: '图片',
                        unknown: '未知',
                      }
                      const label = formatLabels[format] || format
                      const isSelected = selectedFormat === format
                      return (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setSelectedFormat(format)}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                            isSelected
                              ? 'border-gray-400 bg-gray-200 text-gray-900'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-gray-500">
            <div className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-semibold tracking-[0.3em] text-gray-600">
              剪贴板预览
            </div>
            <p className="text-[11px] text-gray-600">
              {hasEntries ? '在左侧选择一条记录即可查看详情。' : '复制任意内容后即可在此处查看详情。'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
