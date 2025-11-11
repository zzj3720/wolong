import type { LucideIcon } from 'lucide-react'
import { Settings, Keyboard, Database, Info, MessageCircle } from 'lucide-react'

export type SettingsTabValue = 'general' | 'shortcuts' | 'indexing' | 'ai' | 'about'

export type SettingsTabDefinition = {
  value: SettingsTabValue
  label: string
  icon: LucideIcon
}

export const SETTINGS_TABS: SettingsTabDefinition[] = [
  {
    value: 'general',
    label: '通用',
    icon: Settings,
  },
  {
    value: 'ai',
    label: 'AI 配置',
    icon: MessageCircle,
  },
  {
    value: 'indexing',
    label: '应用索引',
    icon: Database,
  },
  {
    value: 'shortcuts',
    label: '快捷键',
    icon: Keyboard,
  },
  {
    value: 'about',
    label: '关于',
    icon: Info,
  },
]

