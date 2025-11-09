import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ARC, CacheItem } from '@/utils/arc'

const MAX_RESULTS = 400
const MAX_RECOMMENDED = 5
const STORAGE_KEY = 'launcher_app_history'

type MatchField = 'name' | 'source' | 'launchPath'
type MatchType = 'exact' | 'prefix' | 'fuzzy'

interface FieldMatch {
  baseScore: number
  fieldWeight: number
  matchType: MatchType
  totalScore: number
  field: MatchField
}

interface AppMatch extends FieldMatch {
  app: WindowLauncherApp
}

const FIELD_WEIGHTS: Record<MatchField, number> = {
  name: 0,
  source: 100,
  launchPath: 200,
}

const MATCH_FIELDS: Array<{ field: MatchField; accessor: (app: WindowLauncherApp) => string | undefined }> = [
  { field: 'name', accessor: (app) => app.name },
  { field: 'source', accessor: (app) => app.source },
  { field: 'launchPath', accessor: (app) => app.launchPath },
]

function fuzzyMatchPenalty(query: string, target: string): number | null {
  if (!query) {
    return 0
  }

  const firstChar = query[0]
  let best: number | null = null

  for (let startIndex = 0; startIndex < target.length; startIndex += 1) {
    if (target[startIndex] !== firstChar) {
      continue
    }

    let currentIndex = startIndex
    let penalty = startIndex
    let valid = true

    for (let queryIndex = 1; queryIndex < query.length; queryIndex += 1) {
      const nextChar = query[queryIndex]
      const nextIndex = target.indexOf(nextChar, currentIndex + 1)
      if (nextIndex === -1) {
        valid = false
        break
      }
      penalty += nextIndex - currentIndex - 1
      currentIndex = nextIndex
    }

    if (!valid) {
      continue
    }

    penalty += target.length - currentIndex - 1

    if (best === null || penalty < best) {
      best = penalty
    }
  }

  return best
}

function getMatchForField(search: string, value: string): Omit<FieldMatch, 'fieldWeight' | 'field'> | null {
  const normalizedSearch = search.toLowerCase()
  const haystack = value.toLowerCase()

  if (haystack === normalizedSearch) {
    return { baseScore: 0, matchType: 'exact', totalScore: 0 }
  }

  if (haystack.startsWith(normalizedSearch)) {
    return { baseScore: 1, matchType: 'prefix', totalScore: 1 }
  }

  const penalty = fuzzyMatchPenalty(normalizedSearch, haystack)
  if (penalty === null) {
    return null
  }

  const baseScore = 2 + penalty
  return { baseScore, matchType: 'fuzzy', totalScore: baseScore }
}

export function getBestMatchForApp(app: WindowLauncherApp, search: string): AppMatch | null {
  const normalizedSearch = search.toLowerCase()

  let bestMatch: AppMatch | null = null

  for (const { field, accessor } of MATCH_FIELDS) {
    const value = accessor(app)
    if (!value) {
      continue
    }

    const match = getMatchForField(normalizedSearch, value)
    if (!match) {
      continue
    }

    const fieldWeight = FIELD_WEIGHTS[field]
    const totalScore = match.totalScore + fieldWeight
    const candidate: AppMatch = {
      app,
      field,
      fieldWeight,
      baseScore: match.baseScore,
      matchType: match.matchType,
      totalScore,
    }

    if (!bestMatch || candidate.totalScore < bestMatch.totalScore ||
      (candidate.totalScore === bestMatch.totalScore && candidate.baseScore < bestMatch.baseScore) ||
      (candidate.totalScore === bestMatch.totalScore && candidate.baseScore === bestMatch.baseScore && candidate.fieldWeight < bestMatch.fieldWeight)) {
      bestMatch = candidate
    }
  }

  return bestMatch
}

function loadARC(): ARC<WindowLauncherApp> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return new ARC<WindowLauncherApp>(MAX_RECOMMENDED)
    }
    const data = JSON.parse(stored)
    const arc = new ARC<WindowLauncherApp>(MAX_RECOMMENDED)
    arc.import(data)
    return arc
  } catch {
    return new ARC<WindowLauncherApp>(MAX_RECOMMENDED)
  }
}

function saveARC(arc: ARC<WindowLauncherApp>): void {
  try {
    const data = arc.export()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage errors
  }
}

export default function LauncherApp() {
  const [apps, setApps] = useState<WindowLauncherApp[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [arcVersion, setArcVersion] = useState(0) // Force re-render when ARC changes
  const arcRef = useRef<ARC<WindowLauncherApp>>(loadARC())
  const inputRef = useRef<HTMLInputElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const shouldIgnoreBlurRef = useRef(false)
  const shortcutStartRef = useRef<number | null>(null)
  const perfLog = useCallback((stage: string) => {
    if (typeof performance === 'undefined') {
      return
    }
    const start = shortcutStartRef.current
    if (start === null) {
      return
    }
    const elapsed = performance.now() - start
    console.log(`[perf][launcher][renderer] ${stage}: ${elapsed.toFixed(1)}ms`)
  }, [])
  const scanPromiseRef = useRef<Promise<void> | null>(null)

  const deduplicatedApps = useMemo(() => {
    const appMap = new Map<string, WindowLauncherApp>()
    const uninstallerKeywords = ['卸载', 'uninstall', 'remove', '删除']
    
    for (const app of apps) {
      const nameLower = app.name.toLowerCase()
      const isUninstaller = uninstallerKeywords.some(keyword => nameLower.includes(keyword.toLowerCase()))
      
      // Skip uninstaller apps
      if (isUninstaller) {
        continue
      }
      
      const existing = appMap.get(nameLower)
      
      if (!existing) {
        appMap.set(nameLower, app)
      } else {
        const existingIsLnk = existing.launchPath.toLowerCase().endsWith('.lnk')
        const currentIsLnk = app.launchPath.toLowerCase().endsWith('.lnk')
        
        // If one is .lnk and the other is .exe, prefer .exe
        if (existingIsLnk && !currentIsLnk) {
          appMap.set(nameLower, app)
        } else if (!existingIsLnk && currentIsLnk) {
          // Keep existing .exe, skip current .lnk
          continue
        } else {
          // Both are same type, keep the first one
          continue
        }
      }
    }
    
    return Array.from(appMap.values())
  }, [apps])

  const recommendedApps = useMemo(() => {
    // Get recommended items from ARC (T2 list - frequently accessed items)
    const recommended = arcRef.current.getRecommended()
    const appMap = new Map(deduplicatedApps.map(app => [app.id, app]))
    
    // Filter to only include apps that exist in current app list
    // Sort by lastAccessed (most recent first)
    return recommended
      .filter(item => appMap.has(item.key))
      .map(item => appMap.get(item.key)!)
      .sort((a, b) => {
        const itemA = recommended.find(r => r.key === a.id)
        const itemB = recommended.find(r => r.key === b.id)
        return (itemB?.lastAccessed || 0) - (itemA?.lastAccessed || 0)
      })
      .slice(0, MAX_RECOMMENDED)
  }, [deduplicatedApps, arcVersion])

  const filteredApps = useMemo(() => {
    const shard = searchTerm.trim().toLowerCase()

    if (!shard) {
      // No search term: show recommended apps only
      return recommendedApps
    }

    const result = deduplicatedApps
      .map((app) => getBestMatchForApp(app, shard))
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => {
        if (a.totalScore !== b.totalScore) {
          return a.totalScore - b.totalScore
        }

        if (a.baseScore !== b.baseScore) {
          return a.baseScore - b.baseScore
        }

        if (a.fieldWeight !== b.fieldWeight) {
          return a.fieldWeight - b.fieldWeight
        }

        // Then sort by launch count (descending)
        const countA = a.app.launchCount ?? 0
        const countB = b.app.launchCount ?? 0
        if (countA !== countB) {
          return countB - countA
        }
        // If launch counts are equal, sort by last launched time (descending)
        const timeA = a.app.lastLaunchedAt ?? 0
        const timeB = b.app.lastLaunchedAt ?? 0
        if (timeA !== timeB) {
          return timeB - timeA
        }
        // Finally, sort by name (ascending)
        return a.app.name.localeCompare(b.app.name)
      })
      .map(({ app }) => app)

    return result.slice(0, MAX_RESULTS)
  }, [deduplicatedApps, searchTerm, recommendedApps])

  useEffect(() => {
    if (activeIndex >= filteredApps.length) {
      setActiveIndex(filteredApps.length ? filteredApps.length - 1 : 0)
    }
  }, [filteredApps.length, activeIndex])

  const appListVirtualizer = useVirtualizer({
    count: filteredApps.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 64,
    overscan: 8,
  })

  useEffect(() => {
    if (!filteredApps.length) {
      return
    }
    const index = Math.min(activeIndex, filteredApps.length - 1)
    const raf = requestAnimationFrame(() => {
      appListVirtualizer.scrollToIndex(index, { align: 'auto' })
    })
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [activeIndex, filteredApps.length, appListVirtualizer])

  const hideWindow = useCallback(() => {
    void window.wolong.window.hide('launcher')
  }, [])

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  const handleContainerPointerDown = useCallback(() => {
    shouldIgnoreBlurRef.current = true
    // Clear the flag after the current event loop
    setTimeout(() => {
      shouldIgnoreBlurRef.current = false
    }, 0)
  }, [])

  const handleInputBlur = useCallback(() => {
    if (shouldIgnoreBlurRef.current) {
      // Click happened inside the window, refocus the input
      focusInput()
    } else {
      // Click happened outside the window, hide it
      hideWindow()
    }
  }, [focusInput, hideWindow])

  const launchApp = useCallback(
    async (app: WindowLauncherApp | undefined) => {
      if (!app) {
        return
      }
      try {
        // Record app launch using ARC algorithm
        arcRef.current.access(app.id, app)
        saveARC(arcRef.current)
        setArcVersion(prev => prev + 1) // Trigger re-render
        
        await window.wolong.launcher.open(app)
      } catch (error) {
        console.error('[launcher] open failed', error)
      } finally {
        hideWindow()
      }
    },
    [hideWindow],
  )

  const startScan = useCallback(() => {
    const pending = scanPromiseRef.current
    if (pending) {
      return pending
    }

    const promise = (async () => {
      setIsLoading(true)
      perfLog('scan:start')
      try {
        const scanned = await window.wolong.launcher.scan()
        setApps(scanned)
        perfLog('scan:complete')
      } catch (error) {
        perfLog('scan:error')
        console.error('[launcher] scan failed', error)
      } finally {
        scanPromiseRef.current = null
        setIsLoading(false)
        shortcutStartRef.current = null
      }
    })()

    scanPromiseRef.current = promise
    return promise
  }, [perfLog])

  const hydrateApps = useCallback(async () => {
    try {
      const cached = await window.wolong.launcher.cache()
      if (cached.length) {
        setApps(cached)
      }
      perfLog('cache:loaded')
    } catch (error) {
      console.error('[launcher] cache load failed', error)
    }
    void startScan()
    perfLog('hydrate:dispatched')
  }, [startScan, perfLog])

  const handleShortcut = useCallback(() => {
    if (typeof performance !== 'undefined') {
      shortcutStartRef.current = performance.now()
      console.log('[perf][launcher][renderer] shortcut:start')
    } else {
      shortcutStartRef.current = null
    }
    setSearchTerm('')
    setActiveIndex(0)
    focusInput()
    void hydrateApps()
    perfLog('shortcut:handled')
  }, [focusInput, hydrateApps, perfLog])

  useEffect(() => {
    focusInput()
    void hydrateApps()
    const dispose = window.wolong.launcher.onIndexed((next) => {
      setApps(next)
    })
    const unsubscribeShortcut = window.wolong.shortcuts.onLauncher(handleShortcut)
    return () => {
      dispose()
      unsubscribeShortcut()
    }
  }, [focusInput, handleShortcut, hydrateApps])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        hideWindow()
        return
      }

      if (!filteredApps.length) {
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((prev) => (prev + 1) % filteredApps.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((prev) => (prev - 1 + filteredApps.length) % filteredApps.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        void launchApp(filteredApps[activeIndex])
      }
    },
    [activeIndex, filteredApps, hideWindow, launchApp],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  const virtualizedApps = appListVirtualizer.getVirtualItems()
  const virtualizedHeight = appListVirtualizer.getTotalSize()

  return (
    <div 
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      className="flex h-screen w-screen flex-col bg-gray-800 text-white"
    >
      <header className="border-b border-white/10 px-6 pb-4 pt-6">
        <input
          ref={inputRef}
          className="w-full bg-transparent px-[4px] py-[4px] text-lg font-medium text-white placeholder:text-white/50 outline-none transition"
          placeholder="Search applications..."
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
        className="flex-1 h-0 min-w-0 w-full max-w-full px-3 pb-6 pt-4 [&_[data-slot=scroll-area-thumb]]:bg-white/20 [&_[data-slot=scroll-area-thumb]]:hover:bg-white/30 [&_[data-slot=scroll-area-viewport]]:w-full [&_[data-slot=scroll-area-viewport]]:max-w-full [&_[data-slot=scroll-area-viewport]]:min-w-0"
      >
        {filteredApps.length === 0 ? (
          <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 text-center text-white/60">
            <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
              {searchTerm.trim() ? 'No matches' : 'No recommendations'}
            </div>
            <p className="text-sm">
              {searchTerm.trim()
                ? 'Try a different keyword or rescan your applications.'
                : 'Start using apps to see recommendations here.'}
            </p>
          </div>
        ) : (
          <div
            role="list"
            className="relative w-full max-w-full min-w-0"
            style={{ height: virtualizedHeight }}
          >
            {virtualizedApps.map((virtualRow) => {
              const index = virtualRow.index
              const app = filteredApps[index]
              if (!app) {
                return null
              }
              const isActive = index === activeIndex
              return (
                <div
                  key={virtualRow.key}
                  role="listitem"
                  ref={appListVirtualizer.measureElement}
                  data-active={isActive ? 'true' : 'false'}
                  className="absolute left-0 top-0 w-full pb-1"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onDoubleClick={() => {
                    void launchApp(app)
                  }}
                >
                  <div
                    className={
                      'group cursor-pointer rounded-lg px-3 py-2 transition w-full max-w-full min-w-0 box-border ' +
                      (isActive ? 'bg-white/10' : 'hover:bg-white/5')
                    }
                  >
                    <div className="flex items-center gap-3 w-full max-w-full min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                        {app.icon ? (
                          <img src={app.icon} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-indigo-300">
                            {app.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 max-w-full overflow-hidden w-0 flex items-center">
                        <p className="text-base font-medium text-white w-full flex items-center min-w-0">
                          <span className="truncate flex-shrink-0">{app.name}</span>
                          <span className="ml-2 text-sm text-white/50 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity flex-shrink overflow-hidden max-w-0 group-hover:max-w-[500px] truncate">
                            {app.launchPath}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
