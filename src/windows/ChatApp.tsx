import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { Send } from 'lucide-react'

import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TitleBar } from '@/components/ui/title-bar'
import { onSmoothingStreamChunk } from '@/utils/chatStreamProxy'

type ProviderId = WindowChatProviderId
type ChatMessage = WindowChatMessage

const PROVIDER_ORDER: ProviderId[] = ['openai', 'minimax', 'kimi', 'deepseek']

const TITLEBAR_NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export default function ChatApp() {
  const [config, setConfig] = useState<WindowChatSettings | null>(null)
  const [activeProvider, setActiveProvider] = useState<ProviderId>('openai')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [modelOverrides, setModelOverrides] = useState<Partial<Record<ProviderId, string>>>({})
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(
    () => window.localStorage.getItem('wolong.chat.lastSessionId') || null,
  )

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    let mounted = true
    window.wolong.chat
      .getConfig()
      .then(nextConfig => {
        if (!mounted) {
          return
        }
        setConfig(nextConfig)
        if (isProvider(nextConfig.activeProvider)) {
          setActiveProvider(nextConfig.activeProvider)
        }
      })
      .catch(error => {
        console.error('[chat] failed to load config', error)
        if (mounted) {
          setErrorMessage('无法加载 AI 配置，请稍后重试。')
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingConfig(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const dispose = window.wolong.shortcuts.onChat(() => {
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    })
    return () => {
      dispose()
    }
  }, [])

  const evaluateAutoScroll = useCallback(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }
    const { scrollTop, scrollHeight, clientHeight } = viewport
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
    autoScrollRef.current = distanceFromBottom <= 80
  }, [])

  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }
    const handleScroll = () => {
      evaluateAutoScroll()
    }
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    evaluateAutoScroll()
    return () => {
      viewport.removeEventListener('scroll', handleScroll)
    }
  }, [evaluateAutoScroll])

  useLayoutEffect(() => {
    if (!autoScrollRef.current) {
      return
    }
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }
    const performScroll = () => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
      })
    }
    performScroll()
    const raf = window.requestAnimationFrame(performScroll)
    return () => window.cancelAnimationFrame(raf)
  }, [messages])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!sessionId) {
      setMessages([])
      return () => {
        cancelled = true
      }
    }

    window.wolong.chat
      .getMessages(sessionId)
      .then(history => {
        if (cancelled) {
          return
        }
        setMessages(history.map(message => ({ role: message.role, content: message.content })))
      })
      .catch(error => {
        if (!cancelled) {
          console.error('[chat] failed to load session history', error)
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      const scrollHeight = textarea.scrollHeight
      const lineHeight = 20
      const maxHeight = lineHeight * 4
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`
    }
  }, [inputValue])

  const providerOptions = useMemo(() => {
    const options: ProviderId[] = []
    if (!config) {
      return options
    }
    for (const providerId of PROVIDER_ORDER) {
      const provider = config.providers[providerId]
      if (!provider) {
        continue
      }
      const hasKey = typeof provider.apiKey === 'string' && provider.apiKey.trim().length > 0
      const models = Array.isArray(provider.models)
        ? provider.models.filter(item => typeof item === 'string' && item.trim())
        : []
      if (hasKey && models.length > 0) {
        options.push(providerId)
      }
    }
    return options
  }, [config])

  const preferredProvider = config?.activeProvider

  const activeProviderWithDefault = useMemo<ProviderId | null>(() => {
    if (providerOptions.length === 0) {
      return null
    }
    if (preferredProvider && providerOptions.includes(preferredProvider)) {
      return preferredProvider
    }
    if (providerOptions.includes(activeProvider)) {
      return activeProvider
    }
    return providerOptions[0]
  }, [providerOptions, preferredProvider, activeProvider])

  useEffect(() => {
    if (!activeProviderWithDefault) {
      return
    }
    if (activeProvider !== activeProviderWithDefault) {
      setActiveProvider(activeProviderWithDefault)
    }
  }, [activeProviderWithDefault, activeProvider])

  const effectiveProvider: ProviderId | null = activeProviderWithDefault ?? (providerOptions.includes(activeProvider) ? activeProvider : null)

  const activeProviderConfig = useMemo(() => {
    if (!config || !effectiveProvider) {
      return null
    }
    return config.providers[effectiveProvider] ?? null
  }, [config, effectiveProvider])

  const availableModels = useMemo(() => {
    if (!activeProviderConfig) {
      return []
    }
    const source = Array.isArray(activeProviderConfig.models) ? activeProviderConfig.models : []
    const cleaned = Array.from(new Set(source.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)))
    if (cleaned.length > 0) {
      return cleaned
    }
    const fallback = activeProviderConfig.defaultModel?.trim()
    return fallback ? [fallback] : []
  }, [activeProviderConfig])

  const activeModel = useMemo(() => {
    const providerKey = effectiveProvider ?? activeProvider
    const override = modelOverrides[providerKey]?.trim()
    if (override && availableModels.includes(override)) {
      return override
    }
    if (availableModels.length > 0) {
      return availableModels[0]
    }
    return activeProviderConfig?.defaultModel?.trim() ?? ''
  }, [modelOverrides, effectiveProvider, activeProvider, availableModels, activeProviderConfig])

  useEffect(() => {
    if (!activeProviderConfig) {
      return
    }
    const providerKey = effectiveProvider ?? activeProvider
    setModelOverrides(previous => {
      const current = previous[providerKey]?.trim() ?? ''
      if (current && availableModels.includes(current)) {
        return previous
      }
      const fallbackModel = availableModels[0] ?? activeProviderConfig.defaultModel?.trim() ?? ''
      if (!fallbackModel) {
        if (!current) {
          return previous
        }
        const next = { ...previous }
        delete next[providerKey]
        return next
      }
      if (current === fallbackModel) {
        return previous
      }
      return {
        ...previous,
        [providerKey]: fallbackModel,
      }
    })
  }, [effectiveProvider, activeProviderConfig, availableModels, activeProvider])

  const isProviderConfigured = Boolean(activeProviderConfig?.apiKey?.trim())

  const handleSend = useCallback(async () => {
    const prompt = inputValue.trim()
    const providerKey = effectiveProvider ?? null
    if (!prompt || isSending || !config || !providerKey) {
      return
    }
    if (!isProviderConfigured) {
      setErrorMessage('当前模型未配置 API Key，请先前往设置页面填写。')
      return
    }

    const userMessage: ChatMessage = { role: 'user', content: prompt }
    const assistantMessagePlaceholder: ChatMessage = { role: 'assistant', content: '' }

    setMessages(previous => [...previous, userMessage, assistantMessagePlaceholder])
    setInputValue('')
    setIsSending(true)
    setErrorMessage(null)

    let currentStreamId: string | null = null
    let assistantContent = ''

    const unsubscribeChunk = onSmoothingStreamChunk(
      (streamId, chunk) => {
        if (currentStreamId === streamId) {
          assistantContent += chunk.content
          setMessages(previous => {
            const newMessages = [...previous]
            const lastIndex = newMessages.length - 1
            if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
              newMessages[lastIndex] = { role: 'assistant', content: assistantContent }
            }
            return newMessages
          })
          if (chunk.done) {
            setSessionId(chunk.sessionId)
            if (chunk.sessionId) {
              window.localStorage.setItem('wolong.chat.lastSessionId', chunk.sessionId)
            }
            setIsSending(false)
            unsubscribeChunk()
            unsubscribeError()
            window.requestAnimationFrame(() => {
              textareaRef.current?.focus()
            })
          }
        }
      },
      { totalDuration: 1000 },
    )

    const unsubscribeError = window.wolong.chat.onStreamError((streamId, error) => {
      if (currentStreamId === streamId) {
        console.error('[chat] stream failed', error)
        setErrorMessage(error)
        setMessages(previous => previous.filter((_, index) => index < previous.length - 1))
        setIsSending(false)
        unsubscribeChunk()
        unsubscribeError()
        window.requestAnimationFrame(() => {
          textareaRef.current?.focus()
        })
      }
    })

    try {
      const result = await window.wolong.chat.sendStream({
        messages,
        prompt,
        providerId: providerKey,
        model: activeModel || undefined,
        sessionId: sessionId || undefined,
      })
      currentStreamId = result.streamId
    } catch (error) {
      console.error('[chat] send stream failed', error)
      const fallbackMessage = error instanceof Error ? error.message : '发送失败，请稍后再试。'
      setErrorMessage(fallbackMessage)
      setMessages(previous => previous.filter((_, index) => index < previous.length - 1))
      setIsSending(false)
      unsubscribeChunk()
      unsubscribeError()
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [inputValue, isSending, isProviderConfigured, messages, effectiveProvider, activeModel, config, sessionId])

  const handleModelSelectChange = useCallback(
    (value: string) => {
      const providerKey = effectiveProvider ?? activeProvider
      if (!providerKey) {
        return
      }
      setModelOverrides(previous => {
        if (availableModels.length > 0 && !availableModels.includes(value)) {
          return previous
        }
        if (previous[providerKey] === value) {
          return previous
        }
        return {
          ...previous,
          [providerKey]: value,
        }
      })
    },
    [effectiveProvider, activeProvider, availableModels],
  )

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  const handleClear = useCallback(() => {
    setMessages([])
    setErrorMessage(null)
    setSessionId(null)
    window.localStorage.removeItem('wolong.chat.lastSessionId')
  }, [])

  const handleOpenSettings = useCallback(() => {
    void window.wolong.window.show('settings')
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50 text-gray-900">
      <TitleBar windowType="chat" />

      <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-hidden">
            {loadingConfig ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-gray-600"
                style={TITLEBAR_NO_DRAG_STYLE}
              >
                <p>正在加载配置…</p>
              </div>
            ) : !config ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-gray-600"
                style={TITLEBAR_NO_DRAG_STYLE}
              >
                <p>{errorMessage ?? '无法加载 AI 配置。'}</p>
                <Button className="rounded-lg bg-gray-900 px-4 text-sm text-white hover:bg-gray-800" onClick={handleOpenSettings}>
                  前往设置
                </Button>
              </div>
            ) : !isProviderConfigured ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-gray-600"
                style={TITLEBAR_NO_DRAG_STYLE}
              >
                <p>当前选择的 Provider 尚未配置 API Key。</p>
                <Button className="rounded-lg bg-gray-900 px-4 text-sm text-white hover:bg-gray-800" onClick={handleOpenSettings}>
                  前往设置
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-full px-6" style={TITLEBAR_NO_DRAG_STYLE} viewportRef={scrollViewportRef}>
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 py-6">
                  {messages.map((message, index) => (
                    <ChatMessageBubble key={`${message.role}-${index}`} message={message} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

        <footer className="px-6 py-2" style={TITLEBAR_NO_DRAG_STYLE}>
          {errorMessage ? <div className="mb-3 text-[11px] text-rose-400">{errorMessage}</div> : null}
          <div className="relative mx-auto w-full max-w-3xl">
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="w-full rounded-t-lg bg-transparent px-3 pt-2">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={event => setInputValue(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="输入消息，Enter 发送"
                  className="min-h-[20px] max-h-[80px] w-full resize-none overflow-y-auto bg-transparent text-sm leading-[20px] text-gray-900 placeholder:text-gray-400 outline-none"
                  disabled={isSending || !isProviderConfigured || !config}
                  rows={1}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 px-3 py-0.5 text-[11px] text-gray-600">
                <div className="flex items-center gap-2">
                  {availableModels.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={availableModels.length === 0}
                        className="text-[11px] text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-400 outline-none"
                      >
                        {activeModel || '未配置模型'}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" alignOffset={-30}>
                        <DropdownMenuRadioGroup
                          value={activeModel || undefined}
                          onValueChange={handleModelSelectChange}
                        >
                          {availableModels.map(model => (
                            <DropdownMenuRadioItem
                              key={model}
                              value={model}
                              className="text-[11px] [&>span]:left-1 pl-6"
                            >
                              {model}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-[11px] text-gray-400">未配置模型</span>
                  )}
                </div>
                <button
                  onClick={() => void handleSend()}
                  disabled={isSending || !inputValue.trim() || !isProviderConfigured || !config}
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                  title={isSending ? '发送中…' : '发送 (Enter)'}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === 'assistant'
  
  if (isAssistant) {
    // AI消息：使用 Markdown 渲染
    return (
      <div className="flex w-full items-start text-left">
        <div className="w-full px-2 text-sm leading-relaxed text-gray-900">
          <Markdown content={message.content} />
        </div>
      </div>
    )
  }
  
  // 用户消息：白色气泡
  return (
    <div className="flex w-full items-end text-right">
      <div className="max-w-[65%] rounded-lg px-2 py-1.5 text-sm leading-relaxed bg-white border border-gray-200 text-gray-900 whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  )
}

function isProvider(value: unknown): value is ProviderId {
  return value === 'openai' || value === 'minimax' || value === 'kimi' || value === 'deepseek'
}
