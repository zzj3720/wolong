import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useEffect, useState } from 'react'

export default function GeneralSettingsTab() {
  const [autoStartEnabled, setAutoStartEnabled] = useState(false)
  const [autoStartLoading, setAutoStartLoading] = useState(true)

  useEffect(() => {
    // Load initial auto-start state
    window.wolong.settings
      .getAutoStart()
      .then(enabled => {
        setAutoStartEnabled(enabled)
      })
      .catch(error => {
        console.error('[settings] Failed to load auto-start setting', error)
      })
      .finally(() => {
        setAutoStartLoading(false)
      })
  }, [])

  const handleAutoStartChange = async (enabled: boolean) => {
    setAutoStartLoading(true)
    try {
      await window.wolong.settings.setAutoStart(enabled)
      setAutoStartEnabled(enabled)
    } catch (error) {
      console.error('[settings] Failed to update auto-start setting', error)
      // Revert on error
      setAutoStartEnabled(!enabled)
    } finally {
      setAutoStartLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="外观"
        rows={[
          { title: '主题', value: '深色' },
          { title: '语言', value: window.navigator.language },
        ]}
      />
      <Section
        title="窗口行为"
        rows={[
          {
            title: '开机自启',
            description: '系统启动时自动启动卧龙',
            control: (
              <Switch
                checked={autoStartEnabled}
                onCheckedChange={handleAutoStartChange}
                disabled={autoStartLoading}
              />
            ),
          },
          { title: '最小化到托盘', description: '关闭或最小化窗口时隐藏到系统托盘', value: '已启用' },
        ]}
      />
    </div>
  )
}

type SectionProps = {
  title: string
  rows: Array<{ title: string; description?: string; value?: string; control?: React.ReactNode }>
}

function Section({ title, rows }: SectionProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        {rows.map((row, index) => (
          <div key={row.title}>
            {index > 0 && <div className="border-t border-gray-200" />}
            <div className="flex items-center justify-between px-4 py-3 text-[11px]">
              <div className={`text-left flex-1 min-w-0 pr-4 ${row.description ? 'space-y-1' : ''}`}>
                <Label className="text-gray-900">{row.title}</Label>
                {row.description && <p className="text-[10px] text-gray-600">{row.description}</p>}
              </div>
              {row.control ? (
                <div className="flex-shrink-0">{row.control}</div>
              ) : (
                <span className="text-[11px] text-gray-600 flex-shrink-0">{row.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

