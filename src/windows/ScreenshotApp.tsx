import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type DragState = {
  startClient: { x: number; y: number }
  currentClient: { x: number; y: number }
  startImage: { x: number; y: number }
  currentImage: { x: number; y: number }
  active: boolean
}

type SelectionBox = {
  x: number
  y: number
  width: number
  height: number
}

export default function ScreenshotApp() {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [frame, setFrame] = useState<WindowScreenshotFrame | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [imageRect, setImageRect] = useState<DOMRect | null>(null)

  const selectionBox = useMemo<SelectionBox | null>(() => {
    if (!drag) {
      return null
    }
    const width = Math.abs(drag.startImage.x - drag.currentImage.x)
    const height = Math.abs(drag.startImage.y - drag.currentImage.y)
    if (width < 2 || height < 2) {
      return null
    }
    const x = Math.min(drag.startImage.x, drag.currentImage.x)
    const y = Math.min(drag.startImage.y, drag.currentImage.y)
    return { x, y, width, height }
  }, [drag])

  const visualRect = useMemo(() => {
    if (!drag || !imageRect) {
      return null
    }
    const width = Math.abs(drag.startClient.x - drag.currentClient.x)
    const height = Math.abs(drag.startClient.y - drag.currentClient.y)
    if (width < 2 || height < 2) {
      return null
    }
    const left = Math.min(drag.startClient.x, drag.currentClient.x) - imageRect.left
    const top = Math.min(drag.startClient.y, drag.currentClient.y) - imageRect.top
    return { left, top, width, height }
  }, [drag, imageRect])

  const translatePoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!imageRect || !frame) {
        return {
          client: { x: clientX, y: clientY },
          image: { x: clientX, y: clientY },
        }
      }

      const clampedX = Math.min(Math.max(clientX, imageRect.left), imageRect.right)
      const clampedY = Math.min(Math.max(clientY, imageRect.top), imageRect.bottom)
      const ratioX = frame.width / imageRect.width
      const ratioY = frame.height / imageRect.height

      return {
        client: { x: clampedX, y: clampedY },
        image: {
          x: Math.min(Math.max((clampedX - imageRect.left) * ratioX, 0), frame.width),
          y: Math.min(Math.max((clampedY - imageRect.top) * ratioY, 0), frame.height),
        },
      }
    },
    [frame, imageRect],
  )

  const hideWindow = useCallback(() => {
    setDrag(null)
    void window.wolong.window.hide('screenshot')
  }, [])

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!frame || !imageRef.current) {
        return
      }
      const bounds = imageRef.current.getBoundingClientRect()
      setImageRect(bounds)
      const { client, image } = translatePoint(event.clientX, event.clientY)
      setDrag({
        startClient: client,
        currentClient: client,
        startImage: image,
        currentImage: image,
        active: true,
      })
    },
    [frame, translatePoint],
  )

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      setDrag((state) => {
        if (!state || !state.active) {
          return state
        }
        const next = translatePoint(event.clientX, event.clientY)
        return {
          ...state,
          currentClient: next.client,
          currentImage: next.image,
        }
      })
    },
    [translatePoint],
  )

  const handleMouseUp = useCallback(() => {
    setDrag((state) => {
      if (!state) {
        return state
      }
      return { ...state, active: false }
    })
  }, [])

  const confirmSelection = useCallback(async () => {
    if (!frame || !selectionBox) {
      return
    }
    try {
      const payload: WindowScreenshotSelection = {
        mimeType: frame.mimeType,
        bounds: {
          x: Math.round(selectionBox.x),
          y: Math.round(selectionBox.y),
          width: Math.max(1, Math.round(selectionBox.width)),
          height: Math.max(1, Math.round(selectionBox.height)),
        },
      }
      console.log('[screenshot] sending selection', payload)
      await window.wolong.screenshot.complete(payload)
      console.log('[screenshot] selection sent')
    } catch (error) {
      console.error('[screenshot] complete failed', error)
    } finally {
      setFrame(null)
      hideWindow()
    }
  }, [frame, hideWindow, selectionBox])

  const cancelSelection = useCallback(() => {
    setFrame(null)
    hideWindow()
  }, [hideWindow])

  const handleImageLoad = useCallback(() => {
    if (!imageRef.current) {
      return
    }
    setImageRect(imageRef.current.getBoundingClientRect())
  }, [])

  useEffect(() => {
    const dispose = window.wolong.screenshot.onShortcut((nextFrame) => {
      setFrame(nextFrame)
      setDrag(null)
      requestAnimationFrame(() => {
        handleImageLoad()
      })
    })
    return () => {
      dispose()
    }
  }, [handleImageLoad])

  useEffect(() => {
    if (!frame) {
      document.body.style.cursor = ''
      return
    }
    document.body.style.cursor = 'crosshair'
    return () => {
      document.body.style.cursor = ''
    }
  }, [frame])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelSelection()
      } else if (event.key === 'Enter' && selectionBox) {
        event.preventDefault()
        void confirmSelection()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [cancelSelection, confirmSelection, selectionBox])

  return (
    <div className="relative h-screen w-screen select-none bg-black/90 text-slate-100" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {frame ? (
        <>
          <img
            ref={imageRef}
            src={frame.dataUrl}
            alt="Captured screen"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            onLoad={handleImageLoad}
          />
          <div className="pointer-events-none absolute inset-0 bg-slate-950/60" />

          {visualRect ? (
            <div
              className="pointer-events-none absolute rounded-2xl border-2 border-indigo-400/80 bg-indigo-500/20 shadow-[0_0_0_9999px_rgba(2,6,23,0.75)]"
              style={{ left: visualRect.left, top: visualRect.top, width: visualRect.width, height: visualRect.height }}
            >
              <div
                className="pointer-events-auto absolute -top-14 right-0 flex items-center gap-3 rounded-full border border-slate-700/70 bg-slate-900/90 px-4 py-2 text-sm font-semibold text-slate-200 shadow-2xl"
                onMouseDown={event => event.stopPropagation()}
                onMouseUp={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
              >
                <span className="text-xs font-medium text-slate-400">
                  {Math.round(selectionBox?.width ?? 0)} × {Math.round(selectionBox?.height ?? 0)} px
                </span>
                <button
                  type="button"
                  onClick={confirmSelection}
                  onMouseDown={event => event.stopPropagation()}
                  onMouseUp={event => event.stopPropagation()}
                  className="rounded-full border border-indigo-400/60 bg-indigo-500/30 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-100 transition hover:bg-indigo-500/50"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={cancelSelection}
                  onMouseDown={event => event.stopPropagation()}
                  onMouseUp={event => event.stopPropagation()}
                  className="rounded-full border border-slate-700 bg-slate-800/60 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-full border border-slate-700/70 bg-slate-900/80 px-6 py-2 text-sm font-medium text-slate-200">
                Drag to select a region · Press Esc to cancel
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">Waiting for screenshot…</div>
      )}
    </div>
  )
}
