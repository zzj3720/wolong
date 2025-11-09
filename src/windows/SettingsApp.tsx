import { useCallback, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import AboutSettingsTab from './settings/AboutSettingsTab'
import GeneralSettingsTab from './settings/GeneralSettingsTab'
import IndexingSettingsTab from './settings/IndexingSettingsTab'
import ShortcutSettingsTab from './settings/ShortcutSettingsTab'
import { SETTINGS_TABS, type SettingsTabValue } from './settings/tabs'

export default function SettingsApp() {
  const [activeTab, setActiveTab] = useState<SettingsTabValue>('general')

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as SettingsTabValue)
  }, [])

  return (
    <div className="min-h-screen w-full bg-background">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="!flex !flex-row h-screen w-full gap-0" orientation="vertical">
        <div className="shrink-0 border-r bg-muted/30 p-4">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">设置</h1>
          </div>
          <TabsList className="flex h-auto w-full flex-col items-start justify-start bg-transparent p-0">
            {SETTINGS_TABS.map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="w-full justify-start gap-2 data-[state=active]:bg-background"
              >
                <tab.icon className="size-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="min-w-0 flex-1">
          <div className="p-8">
            <TabsContent value="general" className="mt-0 space-y-6">
              <GeneralSettingsTab />
            </TabsContent>
            <TabsContent value="shortcuts" className="mt-0 space-y-6">
              <ShortcutSettingsTab />
            </TabsContent>
            <TabsContent value="indexing" className="mt-0 space-y-6">
              <IndexingSettingsTab />
            </TabsContent>
            <TabsContent value="about" className="mt-0 space-y-6">
              <AboutSettingsTab />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  )
}

