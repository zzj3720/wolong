import { useEffect, useMemo, useState } from 'react'

import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

type Feature = {
  name: string
  description: string
}

export default function AboutSettingsTab() {
  const [nativeVersion, setNativeVersion] = useState<string>('…')

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

    return () => {
      mounted = false
    }
  }, [])

  const features = useMemo<Feature[]>(
    () => [
      {
        name: '应用启动器',
        description: '通过强大的索引系统即时搜索并启动已安装的桌面应用。',
      },
      {
        name: '剪贴板历史',
        description: '浏览最近的剪贴板历史记录，预览片段，并轻松重新应用。',
      },
      {
        name: '截图捕获',
        description: '捕获屏幕，绘制区域，并将结果复制到剪贴板。',
      },
    ],
    [],
  )

  return (
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
  )
}

