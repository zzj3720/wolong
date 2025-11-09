import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Settings, Keyboard, Database, Info } from 'lucide-react'

const SHORTCUTS: Array<{ label: string; hotkey: string; target: WindowType }> = [
  { label: '应用启动器', hotkey: 'Alt + Space', target: 'launcher' },
  { label: '剪贴板历史', hotkey: 'Ctrl + Shift + V', target: 'clipboard' },
  { label: '截图捕获', hotkey: 'Ctrl + Shift + S', target: 'screenshot' },
]

type AppInfo = {
  id: string
  name: string
  launchPath: string
  source: string
}

export default function SettingsApp() {
  const [activeTab, setActiveTab] = useState('general')
  const [nativeVersion, setNativeVersion] = useState<string>('…')
  const [scanInProgress, setScanInProgress] = useState(false)
  const [lastScanCount, setLastScanCount] = useState<number | null>(null)
  const [scanPaths, setScanPaths] = useState<{ start_menu_paths: string[]; registry_paths: string[] } | null>(null)
  const [clearCacheInProgress, setClearCacheInProgress] = useState(false)
  const [apps, setApps] = useState<AppInfo[]>([])

  const openWindow = useCallback(async (target: WindowType) => {
    try {
      await window.wolong.window.show(target)
    } catch (error) {
      console.error(`[settings] failed to open window: ${target}`, error)
    }
  }, [])

  const triggerScan = useCallback(async () => {
    try {
      setScanInProgress(true)
      const scannedApps = await window.wolong.launcher.scan()
      setLastScanCount(scannedApps.length)
      setApps(scannedApps.map(app => ({
        id: app.id,
        name: app.name,
        launchPath: app.launchPath,
        source: app.source,
      })))
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

  useEffect(() => {
    let mounted = true
    window.wolong.native
      .version()
      .then((version) => {
        if (mounted) {
          setNativeVersion(version)
        }
      })
      .catch((error) => {
        console.error('[settings] version load failed', error)
        if (mounted) {
          setNativeVersion('不可用')
        }
      })

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
        if (mounted) {
          setApps(cachedApps.map(app => ({
            id: app.id,
            name: app.name,
            launchPath: app.launchPath,
            source: app.source,
          })))
          setLastScanCount(cachedApps.length)
        }
      })
      .catch((error) => {
        console.error('[settings] load apps cache failed', error)
      })

    return () => {
      mounted = false
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

  const features = useMemo<Array<{ name: string; description: string }>>(
    () => [
      { 
        name: '应用启动器', 
        description: '通过强大的索引系统即时搜索并启动已安装的桌面应用。' 
      },
      { 
        name: '剪贴板历史', 
        description: '浏览最近的剪贴板历史记录，预览片段，并轻松重新应用。' 
      },
      { 
        name: '截图捕获', 
        description: '捕获屏幕，绘制区域，并将结果复制到剪贴板。' 
      },
    ],
    [],
  )

  return (
    <div className="min-h-screen w-full bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="!flex !flex-row h-screen w-full gap-0" orientation="vertical">
        {/* Left sidebar with tabs */}
        <div className="shrink-0 border-r bg-muted/30 p-4">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">设置</h1>
          </div>
          <TabsList className="flex h-auto w-full flex-col items-start justify-start bg-transparent p-0">
            <TabsTrigger
              value="general"
              className="w-full justify-start gap-2 data-[state=active]:bg-background"
            >
              <Settings className="size-4" />
              通用
            </TabsTrigger>
            <TabsTrigger
              value="shortcuts"
              className="w-full justify-start gap-2 data-[state=active]:bg-background"
            >
              <Keyboard className="size-4" />
              快捷键
            </TabsTrigger>
            <TabsTrigger
              value="indexing"
              className="w-full justify-start gap-2 data-[state=active]:bg-background"
            >
              <Database className="size-4" />
              应用索引
            </TabsTrigger>
            <TabsTrigger
              value="about"
              className="w-full justify-start gap-2 data-[state=active]:bg-background"
            >
              <Info className="size-4" />
              关于
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Right content area */}
        <ScrollArea className="flex-1 min-w-0">
          <div className="p-8">
              {/* General Settings */}
              <TabsContent value="general" className="mt-0 space-y-6">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-semibold">外观</h3>
                      <p className="text-sm text-muted-foreground">自定义卧龙的外观</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>主题</Label>
                        <p className="text-sm text-muted-foreground">选择您偏好的主题</p>
                      </div>
                      <div className="text-sm text-muted-foreground">深色</div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>语言</Label>
                        <p className="text-sm text-muted-foreground">选择您偏好的语言</p>
                      </div>
                      <div className="text-sm text-muted-foreground">{window.navigator.language}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-semibold">窗口行为</h3>
                      <p className="text-sm text-muted-foreground">配置窗口的行为方式</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>开机自启</Label>
                        <p className="text-sm text-muted-foreground">系统启动时自动启动卧龙</p>
                      </div>
                      <div className="text-sm text-muted-foreground">即将推出</div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>最小化到托盘</Label>
                        <p className="text-sm text-muted-foreground">关闭或最小化窗口时隐藏到系统托盘</p>
                      </div>
                      <div className="text-sm text-muted-foreground">已启用</div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Shortcuts Settings */}
              <TabsContent value="shortcuts" className="mt-0 space-y-6">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-semibold">全局快捷键</h3>
                      <p className="text-sm text-muted-foreground">管理全局键盘快捷键以便快速访问</p>
                    </div>
                    <div className="space-y-4">
                      {SHORTCUTS.map((shortcut, index) => (
                        <div key={shortcut.target}>
                          <div className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-4">
                              <Label className="text-base font-medium">{shortcut.label}</Label>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm whitespace-nowrap">
                                {shortcut.hotkey}
                              </div>
                              <Button variant="outline" size="sm" onClick={() => openWindow(shortcut.target)}>
                                测试
                              </Button>
                            </div>
                          </div>
                          {index < SHORTCUTS.length - 1 && <Separator className="my-2" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Application Index Settings */}
              <TabsContent value="indexing" className="mt-0 space-y-6">
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
                        <Button variant="outline" size="sm" onClick={() => openWindow('launcher')}>
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
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{app.name}</div>
                                    <div className="text-xs text-muted-foreground truncate font-mono">{app.source}</div>
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
              </TabsContent>

              {/* About Settings */}
              <TabsContent value="about" className="mt-0 space-y-6">
                <div>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xl font-semibold">卧龙工具箱</h3>
                        <p className="text-sm text-muted-foreground">应用启动器和生产力工具</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>原生模块版本</Label>
                        <div className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm">
                          v{nativeVersion}
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-4">
                        <div>
                          <h4 className="mb-3 text-sm font-semibold">功能</h4>
                          <div className="space-y-3">
                            {features.map((feature) => (
                              <div key={feature.name} className="space-y-1">
                                <Label className="text-sm font-medium">{feature.name}</Label>
                                <p className="text-sm text-muted-foreground">{feature.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
