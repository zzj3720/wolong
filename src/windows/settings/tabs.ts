import type { LucideIcon } from 'lucide-react'
import { Settings, Keyboard, Database, Info } from 'lucide-react'

export type SettingsTabValue = 'general' | 'shortcuts' | 'indexing' | 'about'

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
    value: 'shortcuts',
    label: '快捷键',
    icon: Keyboard,
  },
  {
    value: 'indexing',
    label: '应用索引',
    icon: Database,
  },
  {
    value: 'about',
    label: '关于',
    icon: Info,
  },
]

