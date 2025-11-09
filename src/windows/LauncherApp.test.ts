import { describe, expect, it } from 'vitest'
import { getBestMatchForApp } from './LauncherApp'

function createApp(overrides: Partial<WindowLauncherApp>): WindowLauncherApp {
  return {
    id: 'test',
    name: 'Example',
    source: 'shortcut',
    launchPath: 'C:/Example.exe',
    launchCount: 0,
    lastLaunchedAt: null,
    ...overrides,
  }
}

describe('launcher search matching', () => {
  it('supports fuzzy matching for subsequence queries', () => {
    const result = getBestMatchForApp(createApp({ name: 'Steam' }), 'sm')

    expect(result).not.toBeNull()
    expect(result?.matchType).toBe('fuzzy')
  })

  it('prefers prefix matches over fuzzy matches', () => {
    const prefixResult = getBestMatchForApp(createApp({ name: 'Steam' }), 'ste')
    const fuzzyResult = getBestMatchForApp(createApp({ name: 'Stream' }), 'sam')

    expect(prefixResult).not.toBeNull()
    expect(prefixResult?.matchType).toBe('prefix')
    expect(fuzzyResult).not.toBeNull()
    expect(prefixResult!.totalScore).toBeLessThan(fuzzyResult!.totalScore)
  })

  it('prioritises name matches over path matches', () => {
    const nameMatch = getBestMatchForApp(createApp({ name: 'Steam' }), 'steam')
    const pathMatch = getBestMatchForApp(
      createApp({ name: 'Another App', launchPath: 'C:/Tools/steam.exe' }),
      'steam',
    )

    expect(nameMatch).not.toBeNull()
    expect(pathMatch).not.toBeNull()
    expect(nameMatch!.totalScore).toBeLessThan(pathMatch!.totalScore)
  })
})
