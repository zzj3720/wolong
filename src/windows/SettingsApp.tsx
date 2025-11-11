import { useCallback, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TitleBar } from '@/components/ui/title-bar'

import AboutSettingsTab from './settings/AboutSettingsTab'
import GeneralSettingsTab from './settings/GeneralSettingsTab'
import IndexingSettingsTab from './settings/IndexingSettingsTab'
import AiSettingsTab from './settings/AiSettingsTab'
import ShortcutSettingsTab from './settings/ShortcutSettingsTab'
import { SETTINGS_TABS, type SettingsTabValue } from './settings/tabs'

const TITLEBAR_NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export default function SettingsApp() {
  const [activeTab, setActiveTab] = useState<SettingsTabValue>('general')

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as SettingsTabValue)
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-gray-900">
      <TitleBar windowType="settings" />

      <div className="flex flex-1 overflow-hidden" style={TITLEBAR_NO_DRAG_STYLE}>
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="!flex !flex-row h-full w-full gap-0"
          orientation="vertical"
        >
          <div className="flex h-full w-56 flex-col border-r border-gray-200 bg-gray-50">
            <ScrollArea className="flex-1">
              <div className="px-3 py-4">
                <TabsList className="flex h-auto w-full flex-col gap-0.5 bg-transparent p-0">
                  {SETTINGS_TABS.map(tab => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="w-full justify-start gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 data-[state=active]:bg-white data-[state=active]:text-gray-900"
                    >
                      <tab.icon className="size-4 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </ScrollArea>
          </div>

          <ScrollArea className="min-w-0 flex-1 bg-white">
            <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-6">
              <TabsContent value="general" className="mt-0">
                <GeneralSettingsTab />
              </TabsContent>
              <TabsContent value="shortcuts" className="mt-0">
                <ShortcutSettingsTab />
              </TabsContent>
              <TabsContent value="indexing" className="mt-0">
                <IndexingSettingsTab />
              </TabsContent>
              <TabsContent value="ai" className="mt-0">
                <AiSettingsTab />
              </TabsContent>
              <TabsContent value="about" className="mt-0">
                <AboutSettingsTab />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>
    </div>
  )
}

