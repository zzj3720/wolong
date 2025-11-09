import { describe, expect, test } from 'vitest'
import { formatClipboardLabel, formatRelativeTime } from './format.js'

describe('formatClipboardLabel', () => {
  test('returns trimmed text for textual entries', () => {
    const entry: WindowClipboardEntry = {
      sequence: 1,
      timestamp: Date.now(),
      format: 'text/plain',
      text: 'A quick brown fox jumps over the lazy dog',
    }

    expect(formatClipboardLabel(entry)).toBe('A quick brown fox jumps over the lazy dog')
  })

  test('shortens long text with ellipsis', () => {
    const entry: WindowClipboardEntry = {
      sequence: 2,
      timestamp: Date.now(),
      format: 'text/plain',
      text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin finibus orci in.',
    }

    expect(formatClipboardLabel(entry)).toMatch(/…$/)
    expect(formatClipboardLabel(entry).length).toBeLessThanOrEqual(60)
  })

  test('returns image label when image data exists', () => {
    const entry: WindowClipboardEntry = {
      sequence: 3,
      timestamp: Date.now(),
      format: 'image/png',
      image: { dataUrl: 'data:image/png;base64,AAA', mimeType: 'image/png' },
    }

    expect(formatClipboardLabel(entry)).toBe('Image')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2024-06-01T12:00:00Z').getTime()

  test('handles recent timestamps as just now', () => {
    expect(formatRelativeTime(now - 20_000, now)).toBe('just now')
  })

  test('formats minutes and hours appropriately', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(formatRelativeTime(now - 2 * 60 * 60_000, now)).toBe('2h ago')
  })

  test('formats days and higher units', () => {
    expect(formatRelativeTime(now - 3 * 24 * 60 * 60_000, now)).toBe('3d ago')
    expect(formatRelativeTime(now - 14 * 24 * 60 * 60_000, now)).toBe('2w ago')
    expect(formatRelativeTime(now - 80 * 24 * 60 * 60_000, now)).toBe('2mo ago')
    expect(formatRelativeTime(now - 400 * 24 * 60 * 60_000, now)).toBe('1y ago')
  })
})
