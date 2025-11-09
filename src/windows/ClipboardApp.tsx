import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { ScrollArea } from '@/components/ui/scroll-area'
import { formatClipboardLabel } from '@/utils/format'

const MAX_ENTRIES = 200
const ROW_HEIGHT = 56

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

  const textStats = useMemo(() => {
    if (!activeEntry?.text) {
      return null
    }
    const text = activeEntry.text
    const trimmed = text.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    const lines = text.split(/\r?\n/).length
    return {
      characters: text.length,
      words,
      lines,
    }
  }, [activeEntry?.text])

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

  useEffect(() => {
    if (!filteredEntries.length) {
      return
    }
    const index = Math.min(activeIndex, filteredEntries.length - 1)
    const raf = requestAnimationFrame(() => {
      listVirtualizer.scrollToIndex(index, { align: 'auto' })
    })
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [activeIndex, filteredEntries.length, listVirtualizer])
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
    listVirtualizer.getTotalSize() || filteredEntries.length * ROW_HEIGHT || ROW_HEIGHT
  const hasEntries = filteredEntries.length > 0
  const relativeTimestamp = activeEntry ? formatRelativeTimeZh(activeEntry.timestamp) : ''
  const absoluteTimestamp = activeEntry ? formatAbsoluteTime(activeEntry.timestamp) : ''

  return (
    <div
      onPointerDown={handleContainerPointerDown}
      className="flex h-screen w-screen bg-gray-900 text-white"
    >
      <div className="flex h-full w-[320px] flex-col border-r border-white/10 bg-gray-900/80">
        <header className="border-b border-white/10 px-6 pb-4 pt-6">
          <input
            ref={inputRef}
            className="w-full bg-transparent px-[4px] py-[4px] text-lg font-medium text-white placeholder:text-white/50 outline-none transition"
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
          className="flex-1 [&_[data-slot=scroll-area-thumb]]:bg-white/20 [&_[data-slot=scroll-area-thumb]]:hover:bg-white/30"
        >
          <div className="py-2">
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
                      className="absolute left-0 top-0 w-full px-3"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        height: `${virtualRow.size}px`,
                      }}
                    >
                      <button
                        type="button"
                        data-active={isActive ? 'true' : 'false'}
                        className={
                          'group flex h-full w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition ' +
                          (isActive
                            ? 'border-white/50 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]'
                            : 'hover:bg-white/5')
                        }
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => setActiveIndex(index)}
                        onDoubleClick={() => {
                          void applyEntry(entry)
                        }}
                      >
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-white/10 text-sm font-semibold text-white">
                          {entry.image ? (
                            <img src={entry.image.dataUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            badge
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mx-auto mt-16 flex max-w-[220px] flex-col items-center gap-3 px-4 text-center text-white/60">
                <div className="rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold tracking-[0.3em] text-white/70">
                  {searchTerm.trim() ? '没有符合条件的记录' : '暂无剪贴板记录'}
                </div>
                <p className="text-xs text-white/70">
                  {searchTerm.trim() ? '换个关键词，或者重新复制内容试试。' : '复制任意内容即可立即显示在这里。'}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-gray-950/40">
        {activeEntry ? (
          <>
            <div className="border-b border-white/10 px-8 py-5">
              <p className="text-xs font-semibold tracking-[0.3em] text-white/40">当前记录</p>
              <p className="mt-2 text-sm text-white/70">
                {relativeTimestamp} · {absoluteTimestamp}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
                  序号 #{activeEntry.sequence}
                </span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
                  格式 {activeEntry.format}
                </span>
                {activeEntry.text && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">文本</span>
                )}
                {activeEntry.image && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">图片</span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-md bg-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/80"
                  onClick={() => {
                    void applyEntry(activeEntry)
                  }}
                >
                  粘贴此记录
                </button>
              </div>
            </div>

            <ScrollArea className="flex-1 [&_[data-slot=scroll-area-thumb]]:bg-white/20 [&_[data-slot=scroll-area-thumb]]:hover:bg-white/30">
              <div className="space-y-8 px-8 py-6">
                {activeEntry.text && (
                  <section className="space-y-3">
                    <p className="text-xs font-semibold tracking-[0.3em] text-white/50">文本内容</p>
                    <div className="rounded-lg bg-white/5 p-4 font-mono text-sm leading-relaxed text-white/90">
                      <pre className="whitespace-pre-wrap break-words">{activeEntry.text}</pre>
                    </div>
                    {textStats && (
                      <dl className="grid grid-cols-2 gap-4 text-xs text-white/50 sm:grid-cols-3">
                        <div>
                          <dt className="tracking-wide">字符数</dt>
                          <dd className="mt-1 text-base text-white">{textStats.characters}</dd>
                        </div>
                        <div>
                          <dt className="tracking-wide">词数</dt>
                          <dd className="mt-1 text-base text-white">{textStats.words}</dd>
                        </div>
                        <div>
                          <dt className="tracking-wide">行数</dt>
                          <dd className="mt-1 text-base text-white">{textStats.lines}</dd>
                        </div>
                      </dl>
                    )}
                  </section>
                )}

                {activeEntry.image && (
                  <section className="space-y-3">
                    <p className="text-xs font-semibold tracking-[0.3em] text-white/50">图片预览</p>
                    <div className="rounded-lg bg-black/40 p-4">
                      <img
                        src={activeEntry.image.dataUrl}
                        alt="剪贴板图片预览"
                        className="mx-auto max-h-[360px] w-auto max-w-full object-contain"
                      />
                    </div>
                    <dl className="grid grid-cols-2 gap-4 text-xs text-white/50 sm:grid-cols-3">
                      <div>
                        <dt className="tracking-wide">尺寸</dt>
                        <dd className="mt-1 text-base text-white">
                          {imageMeta && imageMeta.width > 0 && imageMeta.height > 0
                            ? `${imageMeta.width} × ${imageMeta.height}`
                            : '未知'}
                        </dd>
                      </div>
                      <div>
                        <dt className="tracking-wide">大致大小</dt>
                        <dd className="mt-1 text-base text-white">
                          {imageMeta ? `${imageMeta.approxSizeKb} KB` : '计算中…'}
                        </dd>
                      </div>
                      <div>
                        <dt className="tracking-wide">格式</dt>
                        <dd className="mt-1 text-base text-white">{activeEntry.image.mimeType}</dd>
                      </div>
                    </dl>
                  </section>
                )}

                {!activeEntry.text && !activeEntry.image && (
                  <section className="space-y-3 text-sm text-white/70">
                    <p className="text-xs font-semibold tracking-[0.3em] text-white/50">内容说明</p>
                    <p>该记录仅包含 {activeEntry.format} 数据，暂无可视化预览。</p>
                  </section>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-white/60">
            <div className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold tracking-[0.3em]">
              剪贴板预览
            </div>
            <p className="text-sm text-white/70">
              {hasEntries ? '在左侧选择一条记录即可查看详情。' : '复制任意内容后即可在此处查看详情。'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
