import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export default function GeneralSettingsTab() {
  return (
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
  )
}

