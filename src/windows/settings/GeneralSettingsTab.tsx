import { Label } from '@/components/ui/label'

export default function GeneralSettingsTab() {
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
          { title: '开机自启', description: '系统启动时自动启动卧龙', value: '即将推出' },
          { title: '最小化到托盘', description: '关闭或最小化窗口时隐藏到系统托盘', value: '已启用' },
        ]}
      />
    </div>
  )
}

type SectionProps = {
  title: string
  rows: Array<{ title: string; description?: string; value: string }>
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
              <span className="text-[11px] text-gray-600 flex-shrink-0">{row.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

