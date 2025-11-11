import { useCallback, useEffect, useMemo, useState } from 'react'
import type React from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'

type AppInfo = {
  id: string
  name: string
  launchPath: string
  source: string
}

type ScanPaths = {
  start_menu_paths: string[]
  registry_paths: string[]
}

export default function IndexingSettingsTab() {
  const [scanInProgress, setScanInProgress] = useState(false)
  const [lastScanCount, setLastScanCount] = useState<number | null>(null)
  const [scanPaths, setScanPaths] = useState<ScanPaths | null>(null)
  const [clearCacheInProgress, setClearCacheInProgress] = useState(false)
  const [apps, setApps] = useState<AppInfo[]>([])

  useEffect(() => {
    let mounted = true

    window.wolong.native
      .scanPaths()
      .then((paths) => {
        if (mounted) {
          setScanPaths(paths)
        }
      })
      .catch((error) => {
        console.error('[settings] scan paths load failed', error)
      })

    window.wolong.launcher
      .cache()
      .then((cachedApps) => {
        if (!mounted) {
          return
        }
        setApps(
          cachedApps.map(app => ({
            id: app.id,
            name: app.name,
            launchPath: app.launchPath,
            source: app.source,
          })),
        )
        setLastScanCount(cachedApps.length)
      })
      .catch((error) => {
        console.error('[settings] load apps cache failed', error)
      })

    return () => {
      mounted = false
    }
  }, [])

  const triggerScan = useCallback(async () => {
    try {
      setScanInProgress(true)
      const scannedApps = await window.wolong.launcher.scan()
      setLastScanCount(scannedApps.length)
      setApps(
        scannedApps.map(app => ({
          id: app.id,
          name: app.name,
          launchPath: app.launchPath,
          source: app.source,
        })),
      )
    } catch (error) {
      console.error('[settings] scan failed', error)
    } finally {
      setScanInProgress(false)
    }
  }, [])

  const clearCache = useCallback(async () => {
    if (!confirm('确定要清除应用索引缓存吗？这将删除所有已索引的应用。')) {
      return
    }
    try {
      setClearCacheInProgress(true)
      await window.wolong.launcher.clearCache()
      setLastScanCount(null)
      setApps([])
    } catch (error) {
      console.error('[settings] clear cache failed', error)
    } finally {
      setClearCacheInProgress(false)
    }
  }, [])

  const openLauncherWindow = useCallback(async () => {
    try {
      await window.wolong.window.show('launcher')
    } catch (error) {
      console.error('[settings] failed to open window: launcher', error)
    }
  }, [])

  const scanSummary = useMemo(() => {
    if (scanInProgress) {
      return '正在扫描应用…'
    }
    if (lastScanCount == null) {
      return '扫描系统以索引可用应用。'
    }
    return `上次扫描索引了 ${lastScanCount} 个应用。`
  }, [lastScanCount, scanInProgress])

  return (
    <div className="space-y-6">
      <Section
        title="索引管理"
        rows={[
          {
            title: '扫描状态',
            description: scanSummary,
            control: (
              <Button
                onClick={triggerScan}
                disabled={scanInProgress}
                size="sm"
              >
                {scanInProgress ? '正在扫描…' : '立即扫描'}
              </Button>
            ),
          },
        ]}
      />

      <Section
        title="操作"
        rows={[
          {
            title: '清除缓存',
            description: '从缓存中删除所有已索引的应用。',
            control: (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCache}
                disabled={clearCacheInProgress}
                className="border-rose-400/60 text-rose-600 hover:bg-rose-50 hover:border-rose-500"
              >
                {clearCacheInProgress ? '正在清除…' : '清除缓存'}
              </Button>
            ),
          },
          {
            title: '启动器窗口',
            description: '打开启动器，快速搜索应用。',
            control: (
              <Button
                variant="outline"
                size="sm"
                onClick={openLauncherWindow}
              >
                打开
              </Button>
            ),
          },
        ]}
      />

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">扫描路径</h3>
          <p className="text-[11px] text-gray-600">用于扫描应用的文件夹与注册表项。</p>
        </div>
        <div className="space-y-2">
          {scanPaths ? (
            <>
              {scanPaths.start_menu_paths.length > 0 && (
                <div className="space-y-2">
                  {scanPaths.start_menu_paths.map((path, index) => (
                    <div
                      key={`start-${index}`}
                      className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-700"
                    >
                      {path}
                    </div>
                  ))}
                </div>
              )}
              {scanPaths.registry_paths.length > 0 && (
                <div className="space-y-2">
                  {scanPaths.registry_paths.map((path, index) => (
                    <div
                      key={`registry-${index}`}
                      className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-700"
                    >
                      {path}
                    </div>
                  ))}
                </div>
              )}
              {scanPaths.start_menu_paths.length === 0 && scanPaths.registry_paths.length === 0 && (
                <p className="text-xs text-gray-600">未配置扫描路径。</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-600">正在加载扫描路径…</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">已索引应用</h3>
          <p className="text-[11px] text-gray-600">
            {apps.length > 0 ? `找到 ${apps.length} 个应用` : '尚未索引任何应用。'}
          </p>
        </div>
        {apps.length > 0 ? (
          <ScrollArea className="h-[360px] rounded-lg border border-gray-200 bg-gray-50">
            <div className="space-y-1 p-2">
              {apps.map(app => (
                <div
                  key={app.id}
                  className="rounded-md px-3 py-2 text-xs text-gray-900 hover:bg-white"
                >
                  <div className="truncate font-medium text-gray-900">{app.name}</div>
                  <div className="truncate font-mono text-[11px] text-gray-600">{app.source}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-xs text-gray-600">扫描系统以索引应用。</p>
        )}
      </div>
    </div>
  )
}

type SectionProps = {
  title: string
  description?: string
  rows: Array<{
    title: string
    description?: string
    control: React.ReactNode
  }>
}

function Section({ title, description, rows }: SectionProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-[11px] text-gray-600">{description}</p>}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        {rows.map((row, index) => (
          <div key={index}>
            {index > 0 && <div className="border-t border-gray-200" />}
            <div className="flex items-center justify-between px-4 py-3 text-[11px]">
              <div className={`text-left flex-1 min-w-0 pr-4 ${row.description ? 'space-y-1' : ''}`}>
                <Label className="text-gray-900">{row.title}</Label>
                {row.description && <p className="text-[10px] text-gray-600">{row.description}</p>}
              </div>
              <div className="flex-shrink-0">{row.control}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

