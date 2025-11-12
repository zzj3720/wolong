import { describe, expect, it } from 'vitest'
import { toPinyinVariants, matchesPinyin } from './pinyin'

describe('Pinyin utility', () => {
  describe('toPinyinVariants', () => {
    it('converts Chinese characters to Pinyin variants', () => {
      const variants = toPinyinVariants('微信')
      
      expect(variants).toContain('weixin')  // full pinyin
      expect(variants).toContain('wx')      // initials
      expect(variants.length).toBeGreaterThanOrEqual(2) // at least full + initials
    })

    it('includes Shuangpin variants', () => {
      const variants = toPinyinVariants('微信')
      
      // Should include full pinyin, initials, and shuangpin schemes
      expect(variants.length).toBeGreaterThan(2)
      // At minimum should have: full pinyin + initials + shuangpin variants
    })

    it('handles mixed Chinese and English', () => {
      const variants = toPinyinVariants('QQ音乐')
      
      expect(variants.some(v => v.includes('yinyue') || v.includes('yy'))).toBe(true)
    })

    it('returns original text for non-Chinese text', () => {
      const variants = toPinyinVariants('Steam')
      
      expect(variants).toContain('steam')
      expect(variants.length).toBeGreaterThan(0)
    })

    it('handles empty string', () => {
      const variants = toPinyinVariants('')
      
      expect(variants).toEqual([])
    })

    it('handles single Chinese character', () => {
      const variants = toPinyinVariants('中')
      
      expect(variants).toContain('zhong')
      expect(variants).toContain('z')
    })

    it('removes duplicate variants', () => {
      const variants = toPinyinVariants('测试')
      
      // Should not have duplicates
      expect(new Set(variants).size).toBe(variants.length)
    })
  })

  describe('matchesPinyin', () => {
    it('matches full Pinyin', () => {
      expect(matchesPinyin('微信', 'weixin')).toBe(true)
      expect(matchesPinyin('微信', 'weixi')).toBe(true)
    })

    it('matches Pinyin initials', () => {
      expect(matchesPinyin('微信', 'wx')).toBe(true)
      expect(matchesPinyin('微信', 'w')).toBe(true)
    })

    it('matches partial Pinyin', () => {
      expect(matchesPinyin('微信', 'wei')).toBe(true)
    })

    it('is case-insensitive', () => {
      expect(matchesPinyin('微信', 'WX')).toBe(true)
      expect(matchesPinyin('微信', 'WeiXin')).toBe(true)
    })

    it('returns false for non-matching query', () => {
      expect(matchesPinyin('微信', 'abc')).toBe(false)
    })

    it('matches English text normally', () => {
      expect(matchesPinyin('Steam', 'steam')).toBe(true)
      expect(matchesPinyin('Steam', 'ste')).toBe(true)
    })

    it('may match Shuangpin input', () => {
      // Shuangpin schemes produce different encodings
      // We just verify that variants are generated
      const variants = toPinyinVariants('微信')
      expect(variants.length).toBeGreaterThan(2)
    })
  })
})
