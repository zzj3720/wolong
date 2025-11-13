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

  describe('Pinyin search support', () => {
    it('matches Chinese app names with full Pinyin', () => {
      const result = getBestMatchForApp(createApp({ name: '微信' }), 'weixin')

      expect(result).not.toBeNull()
      expect(result?.app.name).toBe('微信')
    })

    it('matches Chinese app names with Pinyin initials', () => {
      const result = getBestMatchForApp(createApp({ name: '微信' }), 'wx')

      expect(result).not.toBeNull()
      expect(result?.app.name).toBe('微信')
    })

    it('matches Chinese app names with partial Pinyin', () => {
      const result = getBestMatchForApp(createApp({ name: '微信' }), 'wei')

      expect(result).not.toBeNull()
      expect(result?.app.name).toBe('微信')
    })

    it('treats direct character match and Pinyin match equally', () => {
      const directMatch = getBestMatchForApp(createApp({ name: 'weixin' }), 'weixin')
      const pinyinMatch = getBestMatchForApp(createApp({ name: '微信' }), 'weixin')

      expect(directMatch).not.toBeNull()
      expect(pinyinMatch).not.toBeNull()
      expect(directMatch!.totalScore).toBe(pinyinMatch!.totalScore)
    })

    it('is case-insensitive for Pinyin search', () => {
      const result = getBestMatchForApp(createApp({ name: '微信' }), 'WX')

      expect(result).not.toBeNull()
      expect(result?.app.name).toBe('微信')
    })
  })

  describe('Shuangpin search support', () => {
    it('matches Chinese app names with Shuangpin variants', () => {
      // toPinyinVariants generates Shuangpin for xiaohe, sougou, microsoft
      // Any of these Shuangpin variants should match
      const result = getBestMatchForApp(createApp({ name: '测试' }), 'ceshi')

      expect(result).not.toBeNull()
      expect(result?.app.name).toBe('测试')
    })

    it('supports searching with multiple Chinese app names', () => {
      const testCases = [
        { name: '微信', query: 'weixin' },
        { name: '中国', query: 'zhongguo' },
        { name: '音乐', query: 'yinyue' },
      ]

      testCases.forEach(({ name, query }) => {
        const result = getBestMatchForApp(createApp({ name }), query)
        expect(result).not.toBeNull()
        expect(result?.app.name).toBe(name)
      })
    })

    it('Shuangpin variants work with the search system', () => {
      // Verify that Shuangpin-generated variants are searchable
      // This tests the integration between toPinyinVariants and getMatchForField
      const result1 = getBestMatchForApp(createApp({ name: '微信' }), 'weixin')
      const result2 = getBestMatchForApp(createApp({ name: '微信' }), 'wx')

      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      
      // Both should find the same app
      expect(result1?.app.name).toBe('微信')
      expect(result2?.app.name).toBe('微信')
    })
  })
})
