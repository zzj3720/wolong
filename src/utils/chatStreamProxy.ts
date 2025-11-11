type StreamHandler = (streamId: string, chunk: WindowChatStreamChunk) => void

type SmoothStreamProxyOptions = {
  totalDuration?: number
  minSegments?: number
  suggestedSegmentLength?: number
}

type SmoothStreamProxy = {
  wrap(handler: StreamHandler): StreamHandler
  dispose(): void
}

type InternalState = {
  streamId: string | null
  sessionId: string | null
  content: string
  sentIndex: number
  segmentsDelivered: number
  startTime: number | null
  deadline: number | null
  doneReceived: boolean
  doneDispatched: boolean
  disposed: boolean
}

const DEFAULT_OPTIONS: Required<SmoothStreamProxyOptions> = {
  totalDuration: 1000,
  minSegments: 8,
  suggestedSegmentLength: 1,
}

export function createSmoothStreamProxy(options?: SmoothStreamProxyOptions): SmoothStreamProxy {
  const { totalDuration, minSegments, suggestedSegmentLength } = {
    ...DEFAULT_OPTIONS,
    ...options,
  }

  const state: InternalState = {
    streamId: null,
    sessionId: null,
    content: '',
    sentIndex: 0,
    segmentsDelivered: 0,
    startTime: null,
    deadline: null,
    doneReceived: false,
    doneDispatched: false,
    disposed: false,
  }

  const segmentTimers = new Set<number>()
  let doneTimer: number | null = null
  let handlerRef: StreamHandler | null = null

  function clearSegmentTimers() {
    for (const timer of segmentTimers) {
      window.clearTimeout(timer)
    }
    segmentTimers.clear()
  }

  function clearDoneTimer() {
    if (doneTimer !== null) {
      window.clearTimeout(doneTimer)
      doneTimer = null
    }
  }

  function dispose() {
    if (state.disposed) {
      return
    }
    state.disposed = true
    clearSegmentTimers()
    clearDoneTimer()
  }

  function sliceText(input: string, parts: number): string[] {
    if (parts <= 0 || !input) {
      return []
    }
    if (parts === 1) {
      return [input]
    }
    const slices: string[] = []
    let offset = 0
    for (let remainingParts = parts; remainingParts > 0 && offset < input.length; remainingParts -= 1) {
      const remainingChars = input.length - offset
      const size = Math.ceil(remainingChars / remainingParts)
      const nextOffset = offset + size
      slices.push(input.slice(offset, nextOffset))
      offset = nextOffset
    }
    return slices
  }

  function deliverSegment(streamId: string, segment: string) {
    if (!handlerRef || state.disposed || !segment) {
      return
    }
    state.segmentsDelivered += 1
    state.sentIndex = Math.min(state.sentIndex + segment.length, state.content.length)
    handlerRef(streamId, {
      content: segment,
      done: false,
      sessionId: state.sessionId ?? streamId,
    })
  }

  function scheduleDone(streamId: string) {
    clearDoneTimer()
    if (!state.doneReceived || state.doneDispatched || !handlerRef || state.disposed) {
      return
    }
    if (!state.deadline) {
      handlerRef(streamId, {
        content: '',
        done: true,
        sessionId: state.sessionId ?? streamId,
      })
      state.doneDispatched = true
      dispose()
      return
    }
    const now = performance.now()
    const delay = Math.max(0, state.deadline - now)
    doneTimer = window.setTimeout(() => {
      doneTimer = null
      if (state.disposed || !handlerRef) {
        return
      }
      if (state.sentIndex < state.content.length) {
        const remainder = state.content.slice(state.sentIndex)
        state.sentIndex = state.content.length
        if (remainder) {
          handlerRef(streamId, {
            content: remainder,
            done: false,
            sessionId: state.sessionId ?? streamId,
          })
        }
      }
      if (!state.doneDispatched) {
        state.doneDispatched = true
        handlerRef(streamId, {
          content: '',
          done: true,
          sessionId: state.sessionId ?? streamId,
        })
      }
      dispose()
    }, delay)
  }

  function reschedule(streamId: string) {
    if (state.disposed || !handlerRef) {
      return
    }

    const now = performance.now()
    if (state.startTime === null) {
      state.startTime = now
    }
    state.deadline = now + totalDuration
    const deadline = state.deadline ?? now
    const remainingTime = Math.max(0, deadline - now)

    clearSegmentTimers()

    const remainingText = state.content.slice(state.sentIndex)

    if (!remainingText) {
      scheduleDone(streamId)
      return
    }

    const segmentsFromLength = Math.ceil(remainingText.length / suggestedSegmentLength)
    const segmentsNeededForMinimum = Math.max(0, minSegments - state.segmentsDelivered)
    let segmentCount = Math.max(1, segmentsFromLength, segmentsNeededForMinimum)
    if (segmentCount > remainingText.length) {
      segmentCount = remainingText.length
    }

    const slices = sliceText(remainingText, segmentCount)
    if (slices.length === 0) {
      scheduleDone(streamId)
      return
    }

    if (remainingTime <= 0) {
      for (const slice of slices) {
        deliverSegment(streamId, slice)
      }
      scheduleDone(streamId)
      return
    }

    const interval = remainingTime / slices.length
    slices.forEach((slice, index) => {
      const delay = Math.max(0, interval * index)
      const timer = window.setTimeout(() => {
        segmentTimers.delete(timer)
        deliverSegment(streamId, slice)
      }, delay)
      segmentTimers.add(timer)
    })

    scheduleDone(streamId)
  }

  function handleChunk(streamId: string, chunk: WindowChatStreamChunk) {
    if (state.disposed) {
      return
    }

    if (state.streamId === null) {
      state.streamId = streamId
    }

    if (state.streamId !== streamId) {
      return
    }

    if (typeof chunk.sessionId === 'string' && chunk.sessionId) {
      state.sessionId = chunk.sessionId
    }

    if (chunk.content) {
      state.content += chunk.content
    }

    if (chunk.done) {
      state.doneReceived = true
    }

    reschedule(streamId)
  }

  function wrap(handler: StreamHandler): StreamHandler {
    handlerRef = handler
    return (streamId, chunk) => {
      handleChunk(streamId, chunk)
    }
  }

  return {
    wrap,
    dispose,
  }
}

export function onSmoothingStreamChunk(
  handler: StreamHandler,
  options?: SmoothStreamProxyOptions,
): WindowUnsubscribe {
  const proxy = createSmoothStreamProxy(options)
  const unsubscribe = window.wolong.chat.onStreamChunk(
    proxy.wrap((streamId, chunk) => {
      handler(streamId, chunk)
    }),
  )
  return () => {
    proxy.dispose()
    unsubscribe()
  }
}

