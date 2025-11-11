import { net } from 'electron'
import { getSetting, setSetting, createOrUpdateChatSession, appendChatMessage } from '../storage/realm.js'

export type AiProviderId = 'openai' | 'minimax' | 'kimi' | 'deepseek'

export type ChatMessageRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatMessageRole
  content: string
}

export type ChatSessionSummary = {
  id: string
  providerId: string
  model?: string
  createdAt: number
  updatedAt: number
}

export type AiProviderConfig = {
  apiKey: string
  baseUrl?: string
  defaultModel?: string
  models: string[]
}

export type AiSettings = {
  activeProvider: AiProviderId
  providers: Record<AiProviderId, AiProviderConfig>
}

export type AiSettingsPatch = Partial<AiSettings> & {
  providers?: Partial<Record<AiProviderId, Partial<AiProviderConfig>>>
}

export type SendChatMessagePayload = {
  messages?: ChatMessage[]
  prompt: string
  providerId?: AiProviderId
  model?: string
  sessionId?: string
}

export type SendChatMessageResult = {
  message: ChatMessage
  raw: unknown
  sessionId: string
}

export type StreamChatMessageChunk = {
  content: string
  done: boolean
  sessionId: string
}

const STORAGE_KEY = 'ai.config'

const PROVIDER_DEFAULTS: Record<
  AiProviderId,
  {
    baseUrl: string
    defaultModel: string
  }
> = {
  openai: {
    baseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4.1-mini',
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat',
    defaultModel: 'abab6.5-chat',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn',
    defaultModel: 'kimi-k2-0905-preview',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
  },
}

const DEFAULT_SETTINGS: AiSettings = {
  activeProvider: 'openai',
  providers: {
    openai: {
      apiKey: '',
      baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
      defaultModel: PROVIDER_DEFAULTS.openai.defaultModel,
      models: [PROVIDER_DEFAULTS.openai.defaultModel],
    },
    minimax: {
      apiKey: '',
      baseUrl: PROVIDER_DEFAULTS.minimax.baseUrl,
      defaultModel: PROVIDER_DEFAULTS.minimax.defaultModel,
      models: [PROVIDER_DEFAULTS.minimax.defaultModel],
    },
    kimi: {
      apiKey: '',
      baseUrl: PROVIDER_DEFAULTS.kimi.baseUrl,
      defaultModel: PROVIDER_DEFAULTS.kimi.defaultModel,
      models: [
        'kimi-k2-0905-preview',
        'kimi-k2-0711-preview',
        'kimi-k2-turbo-preview',
        'kimi-k2-thinking',
        'kimi-k2-thinking-turbo',
      ],
    },
    deepseek: {
      apiKey: '',
      baseUrl: PROVIDER_DEFAULTS.deepseek.baseUrl,
      defaultModel: PROVIDER_DEFAULTS.deepseek.defaultModel,
      models: [PROVIDER_DEFAULTS.deepseek.defaultModel],
    },
  },
}

export async function getChatConfig(): Promise<AiSettings> {
  const stored = await getSetting(STORAGE_KEY)
  if (!stored) {
    return cloneSettings(DEFAULT_SETTINGS)
  }

  try {
    const parsed = JSON.parse(stored) as unknown
    return normalizeSettings(parsed)
  } catch (error) {
    console.error('[chat] failed to parse stored config, resetting to defaults', error)
    return cloneSettings(DEFAULT_SETTINGS)
  }
}

export async function updateChatConfig(patch: AiSettingsPatch): Promise<AiSettings> {
  const current = await getChatConfig()
  const next = mergeSettings(current, patch)
  validateSettings(next)
  await setSetting(STORAGE_KEY, JSON.stringify(next))
  return next
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { fetchChatMessages } = await import('../storage/realm.js')
  const messages = await fetchChatMessages(sessionId)
  return messages
    .sort((a, b) => a.sequence - b.sequence)
    .map(msg => ({
      role: msg.role,
      content: msg.content,
    }))
}

export async function getChatSessions(limit?: number): Promise<ChatSessionSummary[]> {
  const { fetchChatSessions } = await import('../storage/realm.js')
  const sanitized =
    typeof limit === 'number' && Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) || undefined : undefined
  const sessions = await fetchChatSessions(sanitized)
  return sessions.map(session => ({
    id: session.id,
    providerId: session.providerId,
    model: session.model ?? undefined,
    createdAt: session.createdAt.getTime(),
    updatedAt: session.updatedAt.getTime(),
  }))
}

export async function sendChatMessage(payload: SendChatMessagePayload): Promise<SendChatMessageResult> {
  if (!net || typeof net.fetch !== 'function') {
    throw new Error('[chat] Electron net module is not available.')
  }

  const config = await getChatConfig()
  const providerId = payload.providerId ?? config.activeProvider
  if (!isProviderId(providerId)) {
    throw new Error('[chat] Invalid provider selection')
  }

  const provider = config.providers[providerId]
  if (!provider) {
    throw new Error(`[chat] Provider configuration missing: ${providerId}`)
  }

  const apiKey = provider.apiKey?.trim()
  if (!apiKey) {
    throw new Error('[chat] Missing API key for selected provider')
  }

  const baseUrl = sanitizeBaseUrl(provider.baseUrl ?? PROVIDER_DEFAULTS[providerId].baseUrl)
  const availableModels = resolveAvailableModels(provider, providerId)
  let selectedModel = (payload.model ?? '').trim()
  if (!selectedModel) {
    selectedModel = provider.defaultModel?.trim() ?? ''
  }
  if (!selectedModel && availableModels.length > 0) {
    selectedModel = availableModels[0]
  }
  if (!selectedModel) {
    selectedModel = PROVIDER_DEFAULTS[providerId].defaultModel
  }
  if (availableModels.length > 0 && !availableModels.includes(selectedModel)) {
    selectedModel = availableModels[0]
  }
  if (!selectedModel) {
    throw new Error('[chat] Model must be specified')
  }

  const history = buildHistory(payload.messages, payload.prompt)
  const requestBody = {
    model: selectedModel,
    messages: history.map(message => ({
      role: message.role,
      content: message.content,
    })),
  }

  const endpoint = buildChatCompletionsEndpoint(baseUrl)
  let response: Response
  try {
    // Use Electron's net module so requests appear in DevTools Network panel
    response = await net.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error && 'cause' in error ? String(error.cause) : undefined
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      throw new Error(`[chat] Network error: Unable to connect to ${baseUrl}. Please check your internet connection and API endpoint.`)
    }
    throw new Error(`[chat] Request failed: ${errorMessage}${cause ? ` (${cause})` : ''}`)
  }

  const responseText = await response.text()
  if (!response.ok) {
    let errorMessage = response.statusText || 'Request failed'
    try {
      const errorJson = JSON.parse(responseText) as { error?: { message?: string } }
      if (errorJson?.error?.message) {
        errorMessage = errorJson.error.message
      }
    } catch {
      // ignore parse error
    }
    throw new Error(`[chat] Provider request failed (${response.status}): ${errorMessage}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(responseText)
  } catch (error) {
    throw new Error('[chat] Provider response is not valid JSON')
  }

  const assistantMessage = extractAssistantMessage(parsed)
  if (!assistantMessage) {
    throw new Error('[chat] Provider did not return assistant content')
  }

  // Save messages to database
  const sessionId = payload.sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  const now = Date.now()
  
  try {
    // Create or update session
    await createOrUpdateChatSession({
      id: sessionId,
      providerId,
      model: selectedModel,
    })

    // Get current message count for sequence
    // If sessionId exists, load existing messages; otherwise start from 0
    let existingMessageCount = 0
    if (payload.sessionId) {
      const { fetchChatMessages } = await import('../storage/realm.js')
      const existingMessages = await fetchChatMessages(sessionId)
      existingMessageCount = existingMessages.length
    }
    
    // The history already includes the user prompt, so we need to account for that
    // But we're saving the current user message and assistant message
    const userSequence = existingMessageCount
    const assistantSequence = existingMessageCount + 1

    // Save user message
    await appendChatMessage({
      id: `msg-${now}-user-${Math.random().toString(36).substring(2, 9)}`,
      sessionId,
      role: 'user',
      content: payload.prompt,
      sequence: userSequence,
    })

    // Save assistant message
    await appendChatMessage({
      id: `msg-${now}-assistant-${Math.random().toString(36).substring(2, 9)}`,
      sessionId,
      role: 'assistant',
      content: assistantMessage.content,
      sequence: assistantSequence,
    })
  } catch (error) {
    console.error('[chat] Failed to save messages to database', error)
    // Continue even if save fails
  }

  return {
    message: assistantMessage,
    raw: parsed,
    sessionId,
  }
}

export async function* sendChatMessageStream(
  payload: SendChatMessagePayload,
): AsyncGenerator<StreamChatMessageChunk, void, unknown> {
  if (!net || typeof net.fetch !== 'function') {
    throw new Error('[chat] Electron net module is not available.')
  }

  const config = await getChatConfig()
  const providerId = payload.providerId ?? config.activeProvider
  if (!isProviderId(providerId)) {
    throw new Error('[chat] Invalid provider selection')
  }

  const provider = config.providers[providerId]
  if (!provider) {
    throw new Error(`[chat] Provider configuration missing: ${providerId}`)
  }

  const apiKey = provider.apiKey?.trim()
  if (!apiKey) {
    throw new Error('[chat] Missing API key for selected provider')
  }

  const baseUrl = sanitizeBaseUrl(provider.baseUrl ?? PROVIDER_DEFAULTS[providerId].baseUrl)
  const availableModels = resolveAvailableModels(provider, providerId)
  let selectedModel = (payload.model ?? '').trim()
  if (!selectedModel) {
    selectedModel = provider.defaultModel?.trim() ?? ''
  }
  if (!selectedModel && availableModels.length > 0) {
    selectedModel = availableModels[0]
  }
  if (!selectedModel) {
    selectedModel = PROVIDER_DEFAULTS[providerId].defaultModel
  }
  if (availableModels.length > 0 && !availableModels.includes(selectedModel)) {
    selectedModel = availableModels[0]
  }
  if (!selectedModel) {
    throw new Error('[chat] Model must be specified')
  }

  const history = buildHistory(payload.messages, payload.prompt)
  const requestBody = {
    model: selectedModel,
    messages: history.map(message => ({
      role: message.role,
      content: message.content,
    })),
    stream: true,
  }

  const endpoint = buildChatCompletionsEndpoint(baseUrl)
  let response: Response
  try {
    response = await net.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error && 'cause' in error ? String(error.cause) : undefined
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      throw new Error(`[chat] Network error: Unable to connect to ${baseUrl}. Please check your internet connection and API endpoint.`)
    }
    throw new Error(`[chat] Request failed: ${errorMessage}${cause ? ` (${cause})` : ''}`)
  }

  if (!response.ok) {
    const responseText = await response.text()
    let errorMessage = response.statusText || 'Request failed'
    try {
      const errorJson = JSON.parse(responseText) as { error?: { message?: string } }
      if (errorJson?.error?.message) {
        errorMessage = errorJson.error.message
      }
    } catch {
      // ignore parse error
    }
    throw new Error(`[chat] Provider request failed (${response.status}): ${errorMessage}`)
  }

  if (!response.body) {
    throw new Error('[chat] Response body is null')
  }

  // Generate sessionId
  const sessionId = payload.sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  const now = Date.now()

  // Create or update session
  try {
    await createOrUpdateChatSession({
      id: sessionId,
      providerId,
      model: selectedModel,
    })
  } catch (error) {
    console.error('[chat] Failed to create session', error)
  }

  // Save user message
  let existingMessageCount = 0
  try {
    if (payload.sessionId) {
      const { fetchChatMessages } = await import('../storage/realm.js')
      const existingMessages = await fetchChatMessages(sessionId)
      existingMessageCount = existingMessages.length
    }
    await appendChatMessage({
      id: `msg-${now}-user-${Math.random().toString(36).substring(2, 9)}`,
      sessionId,
      role: 'user',
      content: payload.prompt,
      sequence: existingMessageCount,
    })
  } catch (error) {
    console.error('[chat] Failed to save user message', error)
  }

  // Read stream
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim() === '') {
          continue
        }
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            // Stream finished, save final message
            try {
              await appendChatMessage({
                id: `msg-${now}-assistant-${Math.random().toString(36).substring(2, 9)}`,
                sessionId,
                role: 'assistant',
                content: fullContent,
                sequence: existingMessageCount + 1,
              })
            } catch (error) {
              console.error('[chat] Failed to save assistant message', error)
            }
            yield { content: '', done: true, sessionId }
            return
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
            }
            const choice = parsed.choices?.[0]
            if (choice?.delta?.content) {
              const chunk = choice.delta.content
              fullContent += chunk
              yield { content: chunk, done: false, sessionId }
            }
            if (choice?.finish_reason) {
              // Stream finished
              try {
                await appendChatMessage({
                  id: `msg-${now}-assistant-${Math.random().toString(36).substring(2, 9)}`,
                  sessionId,
                  role: 'assistant',
                  content: fullContent,
                  sequence: existingMessageCount + 1,
                })
              } catch (error) {
                console.error('[chat] Failed to save assistant message', error)
              }
              yield { content: '', done: true, sessionId }
              return
            }
          } catch (error) {
            // Ignore parse errors for individual chunks
            console.error('[chat] Failed to parse stream chunk', error)
          }
        }
      }
    }

    // Final flush
    if (buffer.trim()) {
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6)
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>
            }
            const choice = parsed.choices?.[0]
            if (choice?.delta?.content) {
              const chunk = choice.delta.content
              fullContent += chunk
              yield { content: chunk, done: false, sessionId }
            }
          } catch (error) {
            // Ignore parse errors
          }
        }
      }
    }

    // Save final message if not already saved
    if (fullContent) {
      try {
        await appendChatMessage({
          id: `msg-${now}-assistant-${Math.random().toString(36).substring(2, 9)}`,
          sessionId,
          role: 'assistant',
          content: fullContent,
          sequence: existingMessageCount + 1,
        })
      } catch (error) {
        console.error('[chat] Failed to save assistant message', error)
      }
    }

    yield { content: '', done: true, sessionId }
  } finally {
    reader.releaseLock()
  }
}

function cloneSettings(settings: AiSettings): AiSettings {
  return {
    activeProvider: settings.activeProvider,
    providers: {
      openai: {
        ...settings.providers.openai,
        models: [...(settings.providers.openai.models ?? [])],
      },
      minimax: {
        ...settings.providers.minimax,
        models: [...(settings.providers.minimax.models ?? [])],
      },
      kimi: {
        ...settings.providers.kimi,
        models: [...(settings.providers.kimi.models ?? [])],
      },
      deepseek: {
        ...settings.providers.deepseek,
        models: [...(settings.providers.deepseek.models ?? [])],
      },
    },
  }
}

function normalizeSettings(value: unknown): AiSettings {
  const fallback = cloneSettings(DEFAULT_SETTINGS)
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const input = value as Partial<AiSettings>
  const result = cloneSettings(DEFAULT_SETTINGS)

  if (isProviderId(input.activeProvider)) {
    result.activeProvider = input.activeProvider
  }

  if (input.providers && typeof input.providers === 'object') {
    for (const providerId of Object.keys(PROVIDER_DEFAULTS) as AiProviderId[]) {
      const candidate = (input.providers as Record<string, unknown>)[providerId]
      if (!candidate || typeof candidate !== 'object') {
        continue
      }
      const candidateConfig = candidate as AiProviderConfig
      const defaultModel =
        typeof candidateConfig.defaultModel === 'string' && candidateConfig.defaultModel
          ? candidateConfig.defaultModel
          : PROVIDER_DEFAULTS[providerId].defaultModel
      const merged: AiProviderConfig = {
        apiKey: typeof candidateConfig.apiKey === 'string' ? candidateConfig.apiKey : '',
        baseUrl:
          typeof candidateConfig.baseUrl === 'string'
            ? sanitizeBaseUrl(candidateConfig.baseUrl)
            : PROVIDER_DEFAULTS[providerId].baseUrl,
        defaultModel,
        models: sanitizeModelList(candidateConfig.models, providerId, defaultModel),
      }
      result.providers[providerId] = merged
    }
  }

  return result
}

function mergeSettings(base: AiSettings, patch: AiSettingsPatch): AiSettings {
  const next = cloneSettings(base)

  if (patch.activeProvider && isProviderId(patch.activeProvider)) {
    next.activeProvider = patch.activeProvider
  }

  if (patch.providers) {
    for (const [providerId, providerPatch] of Object.entries(patch.providers)) {
      if (!isProviderId(providerId) || !providerPatch) {
        continue
      }
      const current = next.providers[providerId]
      const updated: AiProviderConfig = {
        apiKey: providerPatch.apiKey !== undefined ? String(providerPatch.apiKey ?? '').trim() : current.apiKey,
        baseUrl:
          providerPatch.baseUrl !== undefined && providerPatch.baseUrl !== null
            ? sanitizeBaseUrl(String(providerPatch.baseUrl))
            : current.baseUrl,
        defaultModel:
          providerPatch.defaultModel !== undefined && providerPatch.defaultModel !== null
            ? String(providerPatch.defaultModel).trim()
            : current.defaultModel,
        models: Array.isArray(current.models) ? [...current.models] : [],
      }
      if (!updated.baseUrl) {
        updated.baseUrl = PROVIDER_DEFAULTS[providerId].baseUrl
      }
      if (!updated.defaultModel) {
        updated.defaultModel = PROVIDER_DEFAULTS[providerId].defaultModel
      }
      if (providerPatch.models !== undefined) {
        updated.models = sanitizeModelList(providerPatch.models, providerId, updated.defaultModel)
      } else {
        updated.models = sanitizeModelList(updated.models, providerId, updated.defaultModel)
      }
      next.providers[providerId] = updated
    }
  }

  for (const providerId of Object.keys(PROVIDER_DEFAULTS) as AiProviderId[]) {
    const config = next.providers[providerId]
    config.models = sanitizeModelList(config.models, providerId, config.defaultModel)
  }

  return next
}

function validateSettings(settings: AiSettings) {
  if (!isProviderId(settings.activeProvider)) {
    throw new Error('[chat] Active provider is invalid')
  }
  for (const providerId of Object.keys(PROVIDER_DEFAULTS) as AiProviderId[]) {
    const config = settings.providers[providerId]
    if (!config) {
      throw new Error(`[chat] Missing provider config for ${providerId}`)
    }
    if (typeof config.apiKey !== 'string') {
      throw new Error(`[chat] API key must be a string for ${providerId}`)
    }
    if (config.baseUrl && typeof config.baseUrl !== 'string') {
      throw new Error(`[chat] Base URL must be a string for ${providerId}`)
    }
    if (config.defaultModel && typeof config.defaultModel !== 'string') {
      throw new Error(`[chat] Default model must be a string for ${providerId}`)
    }
    if (!Array.isArray(config.models)) {
      throw new Error(`[chat] Models must be an array for ${providerId}`)
    }
  }
}

function sanitizeBaseUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) {
    return trimmed
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function buildChatCompletionsEndpoint(baseUrl: string): string {
  return `${sanitizeBaseUrl(baseUrl) || ''}/v1/chat/completions`
}

function buildHistory(messages: ChatMessage[] | undefined, prompt: string): ChatMessage[] {
  const history: ChatMessage[] = []
  if (Array.isArray(messages)) {
    for (const item of messages) {
      if (!item || typeof item !== 'object') {
        continue
      }
      if (!isChatMessageRole(item.role) || typeof item.content !== 'string') {
        continue
      }
      history.push({
        role: item.role,
        content: item.content,
      })
    }
  }
  history.push({
    role: 'user',
    content: prompt,
  })
  return history
}

function extractAssistantMessage(payload: unknown): ChatMessage | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  // Standard OpenAI API format: { choices: [{ message: { role, content } }] }
  const choices = (payload as { choices?: unknown[] }).choices
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0]
    if (firstChoice && typeof firstChoice === 'object') {
      const message = (firstChoice as { message?: { role?: string; content?: string } }).message
      if (message && typeof message === 'object') {
        const role = message.role
        const content = message.content
        if (role === 'assistant' && typeof content === 'string') {
          return { role: 'assistant', content }
        }
      }
    }
  }

  // Fallback: try to extract from delta (streaming format)
  const delta = (payload as { choices?: unknown[] }).choices?.[0]
  if (delta && typeof delta === 'object') {
    const deltaMessage = (delta as { delta?: { role?: string; content?: string } }).delta
    if (deltaMessage && typeof deltaMessage === 'object') {
      const content = deltaMessage.content
      if (typeof content === 'string' && content) {
        return { role: 'assistant', content }
      }
    }
  }

  return null
}

function isProviderId(value: unknown): value is AiProviderId {
  return value === 'openai' || value === 'minimax' || value === 'kimi' || value === 'deepseek'
}

function isChatMessageRole(value: unknown): value is ChatMessageRole {
  return value === 'system' || value === 'user' || value === 'assistant'
}

function sanitizeModelList(models: unknown, providerId: AiProviderId, preferredDefault?: string | null): string[] {
  const raw = Array.isArray(models) ? models : []
  const cleaned: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue
    }
    const trimmed = item.trim()
    if (!trimmed || cleaned.includes(trimmed)) {
      continue
    }
    cleaned.push(trimmed)
  }
  const fallback =
    (preferredDefault && preferredDefault.trim()) || PROVIDER_DEFAULTS[providerId].defaultModel || cleaned[0] || ''
  if (fallback && !cleaned.includes(fallback)) {
    cleaned.unshift(fallback)
  }
  return cleaned
}

function resolveAvailableModels(config: AiProviderConfig, providerId: AiProviderId): string[] {
  return sanitizeModelList(config.models, providerId, config.defaultModel)
}

