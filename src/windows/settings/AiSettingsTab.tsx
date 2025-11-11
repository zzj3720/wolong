import { useCallback, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ProviderId = WindowChatProviderId
type ProviderConfig = WindowChatProviderConfig

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI',
  minimax: 'MiniMax',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
}

const PROVIDER_ORDER: ProviderId[] = ['openai', 'minimax', 'kimi', 'deepseek']
const PROVIDER_MODEL_PRESETS: Record<ProviderId, string[]> = {
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'o4-mini'],
  minimax: ['abab6.5-chat', 'abab6.5s-chat', 'abab6-chat'],
  kimi: [
    'kimi-k2-0905-preview',
    'kimi-k2-0711-preview',
    'kimi-k2-turbo-preview',
    'kimi-k2-thinking',
    'kimi-k2-thinking-turbo',
  ],
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
}

type FormState = WindowChatSettings | null

export default function AiSettingsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(null)
  const [customModelInputs, setCustomModelInputs] = useState<Partial<Record<ProviderId, string>>>({})
  const [expandedModelInput, setExpandedModelInput] = useState<ProviderId | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    window.wolong.chat
      .getConfig()
      .then(config => {
        if (!mounted) {
          return
        }
        setForm(config)
      })
      .catch(loadError => {
        console.error('[settings] load chat config failed', loadError)
        if (mounted) {
          setError('无法加载 AI 配置，请稍后重试。')
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  const addedProviders = useMemo(() => {
    if (!form) {
      return []
    }
    return PROVIDER_ORDER.filter(providerId => {
      const config = form.providers[providerId]
      return config !== undefined && config !== null
    })
  }, [form])

  const configuredProviders = useMemo(() => {
    if (!form) {
      return []
    }
    return PROVIDER_ORDER.filter(providerId => {
      const config = form.providers[providerId]
      return config && config.apiKey && config.apiKey.trim().length > 0
    })
  }, [form])

  const getProviderModels = useCallback(
    (providerId: ProviderId) => {
      if (!form) {
        return []
      }
      const presetSet = new Set<string>()
      const customSet = new Set<string>()
      
      // 预设模型（始终显示）
      const presets = PROVIDER_MODEL_PRESETS[providerId] ?? []
      for (const model of presets) {
        if (model && model.trim()) {
          presetSet.add(model.trim())
        }
      }
      
      // 已配置的模型（区分预设和自定义）
      const config = form.providers[providerId]
      if (config && config.models && Array.isArray(config.models)) {
        for (const model of config.models) {
          const trimmed = model && model.trim() ? model.trim() : ''
          if (trimmed && !presetSet.has(trimmed)) {
            // 不在预设列表中的就是自定义模型
            customSet.add(trimmed)
          }
        }
      }
      
      // 先返回预设模型（按预设顺序），然后返回自定义模型（按字母顺序）
      const presetList = presets.map(model => model.trim()).filter(Boolean)
      const customList = Array.from(customSet).sort()
      return [...presetList, ...customList]
    },
    [form],
  )

  const getProviderSelectedModels = useCallback(
    (providerId: ProviderId) => {
      if (!form) {
        return []
      }
      const config = form.providers[providerId]
      if (!config || !config.models || !Array.isArray(config.models)) {
        return []
      }
      return config.models.filter(model => model && model.trim()).map(model => model.trim())
    },
    [form],
  )

  const handleFieldChange = useCallback(
    (providerId: ProviderId, field: 'apiKey' | 'baseUrl', value: string) => {
      setForm(previous => {
        if (!previous) {
          return previous
        }
        const provider = previous.providers[providerId]
        if (!provider) {
          return previous
        }
        const fallback = getProviderFallback(providerId)
        const nextProvider: ProviderConfig = {
          ...provider,
        }

        if (field === 'apiKey') {
          nextProvider.apiKey = value
        } else if (field === 'baseUrl') {
          nextProvider.baseUrl = value || fallback.baseUrl
        }

        return {
          ...previous,
          providers: {
            ...previous.providers,
            [providerId]: nextProvider,
          },
        }
      })
      setFeedback(null)
    },
    [],
  )

  const handleDeleteProvider = useCallback(
    (providerId: ProviderId) => {
      setForm(previous => {
        if (!previous) {
          return previous
        }
        const fallback = getProviderFallback(providerId)
        return {
          ...previous,
          providers: {
            ...previous.providers,
            [providerId]: {
              apiKey: '',
              baseUrl: fallback.baseUrl,
              defaultModel: fallback.defaultModel,
              models: [...fallback.models],
            },
          },
        }
      })
      if (expandedProvider === providerId) {
        setExpandedProvider(null)
      }
      setFeedback(null)
    },
    [expandedProvider],
  )

  const handleAddProvider = useCallback(
    (providerId: ProviderId) => {
      if (!form) {
        return
      }
      const fallback = getProviderFallback(providerId)
      setForm(previous => {
        if (!previous) {
          return previous
        }
        return {
          ...previous,
          providers: {
            ...previous.providers,
            [providerId]: {
              apiKey: '',
              baseUrl: fallback.baseUrl,
              defaultModel: fallback.defaultModel,
              models: [...fallback.models],
            },
          },
        }
      })
      setExpandedProvider(providerId)
      setFeedback(null)
    },
    [form]
  )

  const handleToggleModel = useCallback(
    async (providerId: ProviderId, model: string) => {
      const trimmed = model.trim()
      if (!trimmed || !form) {
        return
      }
      const provider = form.providers[providerId]
      if (!provider) {
        return
      }
      const existing = Array.isArray(provider.models) ? provider.models : []
      const has = existing.includes(trimmed)
      let nextList: string[]
      if (has) {
        // 取消勾选：从列表中移除
        nextList = existing.filter(item => item !== trimmed)
      } else {
        // 勾选：添加到列表
        nextList = [...existing, trimmed]
      }
      
      let nextForm: FormState = null
      setForm(previous => {
        if (!previous) {
          return previous
        }
        nextForm = {
          ...previous,
          providers: {
            ...previous.providers,
            [providerId]: {
              ...provider,
              models: nextList,
            },
          },
        }
        return nextForm
      })
      
      // 自动保存
      if (nextForm) {
        setSaving(true)
        setError(null)
        try {
          const result = await window.wolong.chat.saveConfig({
            activeProvider: nextForm.activeProvider,
            providers: nextForm.providers,
          })
          setForm(result)
          setFeedback('保存成功。')
        } catch (saveError) {
          console.error('[settings] save chat config failed', saveError)
          const message = saveError instanceof Error ? saveError.message : '保存失败，请稍后再试。'
          setError(message)
        } finally {
          setSaving(false)
        }
      }
    },
    [form],
  )

  const handleDeleteModel = useCallback(
    async (providerId: ProviderId, model: string) => {
      const trimmed = model.trim()
      if (!trimmed || !form) {
        return
      }
      const provider = form.providers[providerId]
      if (!provider) {
        return
      }
      const isPreset = (PROVIDER_MODEL_PRESETS[providerId] ?? []).includes(trimmed)
      // 默认模型不能删除
      if (isPreset || provider.defaultModel === trimmed) {
        return
      }
      
      const existing = Array.isArray(provider.models) ? provider.models : []
      const nextList = existing.filter(item => item !== trimmed)
      
      let nextForm: FormState = null
      setForm(previous => {
        if (!previous) {
          return previous
        }
        nextForm = {
          ...previous,
          providers: {
            ...previous.providers,
            [providerId]: {
              ...provider,
              models: nextList,
            },
          },
        }
        return nextForm
      })
      
      // 自动保存
      if (nextForm) {
        setSaving(true)
        setError(null)
        try {
          const result = await window.wolong.chat.saveConfig({
            activeProvider: nextForm.activeProvider,
            providers: nextForm.providers,
          })
          setForm(result)
          setFeedback('保存成功。')
        } catch (saveError) {
          console.error('[settings] save chat config failed', saveError)
          const message = saveError instanceof Error ? saveError.message : '保存失败，请稍后再试。'
          setError(message)
        } finally {
          setSaving(false)
        }
      }
    },
    [form],
  )

  const handleAddCustomModel = useCallback(
    async (providerId: ProviderId) => {
      const value = customModelInputs[providerId]?.trim()
      if (!value || !form) {
        return
      }
      const provider = form.providers[providerId]
      if (!provider) {
        return
      }
      const existing = Array.isArray(provider.models) ? provider.models : []
      if (existing.includes(value)) {
        return
      }
      
      const nextList = [...existing, value]
      
      let nextForm: FormState = null
      setForm(previous => {
        if (!previous) {
          return previous
        }
        nextForm = {
          ...previous,
          providers: {
            ...previous.providers,
            [providerId]: {
              ...provider,
              models: nextList,
            },
          },
        }
        return nextForm
      })
      
      setCustomModelInputs(previous => ({
        ...previous,
        [providerId]: '',
      }))
      setExpandedModelInput(null)
      
      // 自动保存
      if (nextForm) {
        setSaving(true)
        setError(null)
        try {
          const result = await window.wolong.chat.saveConfig({
            activeProvider: nextForm.activeProvider,
            providers: nextForm.providers,
          })
          setForm(result)
          setFeedback('保存成功。')
        } catch (saveError) {
          console.error('[settings] save chat config failed', saveError)
          const message = saveError instanceof Error ? saveError.message : '保存失败，请稍后再试。'
          setError(message)
        } finally {
          setSaving(false)
        }
      }
    },
    [form, customModelInputs],
  )

  const handleSave = useCallback(async () => {
    if (!form) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await window.wolong.chat.saveConfig({
        activeProvider: form.activeProvider,
        providers: form.providers,
      })
      setForm(result)
      setFeedback('保存成功。')
      setExpandedProvider(null)
    } catch (saveError) {
      console.error('[settings] save chat config failed', saveError)
      const message = saveError instanceof Error ? saveError.message : '保存失败，请稍后再试。'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [form])

  if (loading) {
    return <div className="text-sm text-muted-foreground">正在加载…</div>
  }

  if (!form) {
    return <div className="text-sm text-rose-500">{error ?? '无法加载配置。'}</div>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Provider 配置</h3>
          <p className="text-[11px] text-gray-600">配置可用的 AI Provider，接口需兼容 OpenAI Responses 协议。</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {addedProviders.length > 0 ? (
            addedProviders.map((providerId, index) => {
              const config = form.providers[providerId]
              const isExpanded = expandedProvider === providerId
              return (
                <div key={providerId} className="group">
                  {index > 0 && <div className="border-t border-gray-200" />}
                  <div
                    className="flex items-center justify-between px-4 py-2 text-[11px] cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setExpandedProvider(isExpanded ? null : providerId)
                    }}
                  >
                    <div className="text-left flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-gray-900">{PROVIDER_LABELS[providerId]}</Label>
                        {(!config?.apiKey || config.apiKey.trim().length === 0) && (
                          <span className="text-[10px] text-gray-400">（未配置）</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={e => {
                            e.stopPropagation()
                            setExpandedProvider(isExpanded ? null : providerId)
                          }}
                          className="h-7 w-7 p-0 text-gray-500 hover:text-gray-900 hover:bg-transparent"
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      <div className="flex items-center gap-2 pt-3">
                        <Label className="text-gray-900 text-[11px] min-w-[100px]">API Key</Label>
                        <InputGroup className="flex-1 h-8">
                          <InputGroupInput
                            type="password"
                            value={config?.apiKey ?? ''}
                            onChange={event => handleFieldChange(providerId, 'apiKey', event.target.value)}
                            placeholder="API Key"
                            className="text-xs"
                          />
                        </InputGroup>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-gray-900 text-[11px] min-w-[100px]">Base URL</Label>
                        <InputGroup className="flex-1 h-8">
                          <InputGroupInput
                            value={config?.baseUrl ?? ''}
                            onChange={event => handleFieldChange(providerId, 'baseUrl', event.target.value)}
                            placeholder="Base URL"
                            className="text-xs"
                          />
                        </InputGroup>
                      </div>
                      <div className="pt-3">
                        <Label className="text-gray-900 text-[11px] mb-2 block">模型</Label>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {getProviderModels(providerId).map(model => {
                            const isSelected = getProviderSelectedModels(providerId).includes(model)
                            const isPreset = (PROVIDER_MODEL_PRESETS[providerId] ?? []).includes(model)
                            const canDelete = !isPreset && config?.defaultModel !== model
                            return (
                              <Badge
                                key={model}
                                variant={isSelected ? 'default' : 'outline'}
                                className={`cursor-pointer text-xs px-2 py-0.5 flex items-center gap-1 rounded ${
                                  isSelected
                                    ? 'bg-gray-600 text-white border-gray-600 hover:bg-gray-700'
                                    : 'bg-transparent text-gray-800 border-dashed border-gray-300 hover:bg-gray-50'
                                }`}
                                onClick={() => void handleToggleModel(providerId, model)}
                              >
                                {model}
                                {canDelete && (
                                  <X
                                    className="h-3 w-3 ml-1"
                                    onClick={e => {
                                      e.stopPropagation()
                                      void handleDeleteModel(providerId, model)
                                    }}
                                  />
                                )}
                              </Badge>
                            )
                          })}
                          {expandedModelInput !== providerId ? (
                            <Badge
                              variant="outline"
                              className="cursor-pointer text-xs px-2 py-0.5 flex items-center gap-1 rounded bg-transparent text-gray-800 border-dashed border-gray-300 hover:bg-gray-50"
                              onClick={() => {
                                setExpandedModelInput(providerId)
                                setCustomModelInputs(previous => ({
                                  ...previous,
                                  [providerId]: '',
                                }))
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Badge>
                          ) : (
                            <Input
                              value={customModelInputs[providerId] ?? ''}
                              onChange={event =>
                                setCustomModelInputs(previous => ({
                                  ...previous,
                                  [providerId]: event.target.value,
                                }))
                              }
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void handleAddCustomModel(providerId)
                                } else if (event.key === 'Escape') {
                                  event.preventDefault()
                                  setExpandedModelInput(null)
                                  setCustomModelInputs(previous => ({
                                    ...previous,
                                    [providerId]: '',
                                  }))
                                }
                              }}
                              onBlur={() => {
                                if (!customModelInputs[providerId]?.trim()) {
                                  setExpandedModelInput(null)
                                }
                              }}
                              placeholder="输入模型 ID"
                              className="h-5 w-[100px] text-xs inline-flex py-0.5"
                              autoFocus
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteProvider(providerId)}
                          className="text-gray-500 hover:text-gray-900"
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="px-4 py-8 text-center text-xs text-gray-500">
              暂无 Provider，请从下方选择添加
            </div>
          )}
          {addedProviders.length < PROVIDER_ORDER.length && (
            <>
              {addedProviders.length > 0 && <div className="border-t border-gray-200" />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center justify-start w-full px-4 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
                    <Plus className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {PROVIDER_ORDER.filter(id => !addedProviders.includes(id)).map(providerId => (
                    <DropdownMenuItem
                      key={providerId}
                      onSelect={event => {
                        event.preventDefault()
                        handleAddProvider(providerId)
                      }}
                    >
                      {PROVIDER_LABELS[providerId]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {feedback ? <div className="text-xs text-emerald-400">{feedback}</div> : null}
      {error ? <div className="text-xs text-rose-400">{error}</div> : null}
    </div>
  )
}

function getProviderFallback(providerId: ProviderId) {
  switch (providerId) {
    case 'openai':
      return { baseUrl: 'https://api.openai.com', defaultModel: 'gpt-4.1-mini', models: ['gpt-4.1-mini'] }
    case 'minimax':
      return { baseUrl: 'https://api.minimax.chat', defaultModel: 'abab6.5-chat', models: ['abab6.5-chat'] }
    case 'kimi':
      return {
        baseUrl: 'https://api.moonshot.cn',
        defaultModel: 'kimi-k2-0905-preview',
        models: [
          'kimi-k2-0905-preview',
          'kimi-k2-0711-preview',
          'kimi-k2-turbo-preview',
          'kimi-k2-thinking',
          'kimi-k2-thinking-turbo',
        ],
      }
    case 'deepseek':
      return { baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat', models: ['deepseek-chat'] }
    default:
      return { baseUrl: '', defaultModel: '', models: [] }
  }
}

type SectionProps = {
  title: string
  description?: string
  rows: Array<{
    title: string
    description?: string
    control: React.ReactNode
  }>
}

function Section({ title, description, rows }: SectionProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="text-[11px] text-gray-600">{description}</p>}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white">
        {rows.map((row, index) => (
          <div key={index} className="group">
            {index > 0 && <div className="border-t border-gray-200" />}
            <div className="flex items-center justify-between px-4 py-3 text-[11px]">
              <div className={`text-left flex-1 min-w-0 pr-4 ${row.description ? 'space-y-1' : ''}`}>
                <Label className="text-gray-900">{row.title}</Label>
                {row.description && <p className="text-[10px] text-gray-600">{row.description}</p>}
              </div>
              <div className="flex-shrink-0">{row.control}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
