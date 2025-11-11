import { Fragment, useEffect, useMemo, useState } from 'react'
import type React from 'react'

import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Label } from '@/components/ui/label'

type Feature = {
  name: string
  shortcutKey: 'launcher' | 'clipboard' | 'screenshot'
  shortcut: string | null
  description: string
  descriptionSuffix: string
}

function formatShortcutDisplay(accelerator: string): string {
  return accelerator.replace(/\+/g, ' + ')
}

function formatShortcutToKbd(accelerator: string): React.ReactNode {
  const keys = accelerator.split('+').map(key => key.trim())
  return (
    <KbdGroup>
      {keys.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="text-xs text-gray-500">+</span>}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </KbdGroup>
  )
}

export default function AboutSettingsTab() {
  const [nativeVersion, setNativeVersion] = useState<string>('…')
  const [shortcutConfig, setShortcutConfig] = useState<WindowShortcutConfig | null>(null)

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

    window.wolong.shortcuts
      .getAll()
      .then((config) => {
        if (mounted) {
          setShortcutConfig(config)
        }
      })
      .catch((error) => {
        console.error('[settings] load shortcuts failed', error)
      })

    return () => {
      mounted = false
    }
  }, [])

  const features = useMemo(() => {
    const launcherShortcut = shortcutConfig?.launcher
      ? shortcutConfig.launcher
      : null
    const clipboardShortcut = shortcutConfig?.clipboard
      ? shortcutConfig.clipboard
      : null
    const screenshotShortcut = shortcutConfig?.screenshot
      ? shortcutConfig.screenshot
      : null

    return [
      {
        name: '应用启动器',
        shortcutKey: 'launcher' as const,
        shortcut: launcherShortcut,
        description: '快速启动已安装的应用，支持模糊搜索',
        descriptionSuffix: launcherShortcut ? '，通过' : '',
      },
      {
        name: '剪贴板历史',
        shortcutKey: 'clipboard' as const,
        shortcut: clipboardShortcut,
        description: '自动记录剪贴板内容，支持文本和图片',
        descriptionSuffix: clipboardShortcut ? '，通过' : '，快速查看和复用历史记录',
      },
      {
        name: '截图工具',
        shortcutKey: 'screenshot' as const,
        shortcut: screenshotShortcut,
        description: '一键截图并选择区域，截图后自动复制到剪贴板',
        descriptionSuffix: screenshotShortcut ? '，快捷键' : '',
      },
    ]
  }, [shortcutConfig])

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">卧龙</h3>
          <p className="text-[11px] text-gray-600 mt-1">AI 助手</p>
        </div>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-600">原生模块版本：</span>
            <span className="font-mono text-gray-900">v{nativeVersion}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">功能概览</h3>
        </div>
        <div className="space-y-3">
          {features.map(feature => (
            <div key={feature.name}>
              <Label className="text-sm font-medium text-gray-900">{feature.name}</Label>
              <p className="mt-1 text-xs text-gray-600">
                {feature.description}
                {feature.shortcut ? (
                  <>
                    {feature.descriptionSuffix && ' '}
                    {feature.descriptionSuffix}
                    {' '}
                    {formatShortcutToKbd(feature.shortcut)}
                    {feature.shortcutKey === 'launcher' && ' 随时呼出'}
                    {feature.shortcutKey === 'clipboard' && ' 快速查看和复用历史记录'}
                  </>
                ) : (
                  feature.descriptionSuffix
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">未来愿景</h3>
        </div>
        <p className="text-xs text-gray-600">
          卧龙将基于大模型技术，成为你使用电脑时的智能军师，提供更智能的决策建议和操作辅助。
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">系统要求</h3>
        </div>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-600">操作系统：</span>
            <span className="text-gray-900">Windows 10/11</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">技术架构</h3>
        </div>
        <p className="text-xs text-gray-600">
          卧龙基于 Electron + React 构建，使用 Rust 原生模块提供系统级功能，并通过 Realm 进行数据持久化。
        </p>
      </div>
    </div>
  )
}


