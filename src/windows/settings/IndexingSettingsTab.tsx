import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">索引管理</h3>
            <p className="text-sm text-muted-foreground">管理应用索引和来源</p>
          </div>
          <Button onClick={triggerScan} disabled={scanInProgress}>
            {scanInProgress ? '正在扫描…' : '立即扫描'}
          </Button>
        </div>
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">{scanSummary}</p>
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">清除缓存</Label>
              <p className="text-sm text-muted-foreground">从缓存中删除所有已索引的应用</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={clearCache}
              disabled={clearCacheInProgress}
            >
              {clearCacheInProgress ? '正在清除…' : '清除缓存'}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">启动器窗口</Label>
              <p className="text-sm text-muted-foreground">快速搜索应用</p>
            </div>
            <Button variant="outline" size="sm" onClick={openLauncherWindow}>
              打开
            </Button>
          </div>
          <div className="rounded-lg border p-4">
            <div className="mb-3">
              <Label className="text-base">扫描路径</Label>
              <p className="text-sm text-muted-foreground">用于扫描应用的文件夹和注册表项</p>
            </div>
            <div className="space-y-2">
              {scanPaths ? (
                <>
                  {scanPaths.start_menu_paths.length > 0 && (
                    <div className="space-y-2">
                      {scanPaths.start_menu_paths.map((path, index) => (
                        <div key={`start-${index}`} className="rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">
                          {path}
                        </div>
                      ))}
                    </div>
                  )}
                  {scanPaths.registry_paths.length > 0 && (
                    <div className="space-y-2">
                      {scanPaths.registry_paths.map((path, index) => (
                        <div key={`registry-${index}`} className="rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">
                          {path}
                        </div>
                      ))}
                    </div>
                  )}
                  {scanPaths.start_menu_paths.length === 0 && scanPaths.registry_paths.length === 0 && (
                    <p className="text-sm text-muted-foreground">未配置扫描路径</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">正在加载扫描路径…</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="mb-3">
              <Label className="text-base">已索引应用</Label>
              <p className="text-sm text-muted-foreground">
                {apps.length > 0
                  ? `找到 ${apps.length} 个应用`
                  : '尚未索引任何应用'}
              </p>
            </div>
            {apps.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-1">
                  {apps.map((app) => (
                    <div key={app.id} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{app.name}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">{app.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">扫描系统以索引应用。</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

