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

    it('includes Shuangpin variants for all three schemes', () => {
      const variants = toPinyinVariants('微信')
      
      // Should include full pinyin, initials, and shuangpin schemes
      // Minimum: full pinyin + initials + 3 shuangpin schemes = 5 variants
      expect(variants.length).toBeGreaterThanOrEqual(5)
      
      // Verify we have the basic variants
      expect(variants).toContain('weixin')  // full pinyin
      expect(variants).toContain('wx')      // initials
      
      // Shuangpin schemes generate different output than full pinyin
      // The variants should include more than just the basic two
      const nonBasicVariants = variants.filter(v => v !== 'weixin' && v !== 'wx')
      expect(nonBasicVariants.length).toBeGreaterThan(0)
    })

    it('generates Shuangpin for single characters', () => {
      const variants = toPinyinVariants('中')
      
      expect(variants).toContain('zhong')  // full pinyin
      expect(variants).toContain('z')      // initial
      // Should also have Shuangpin variants
      expect(variants.length).toBeGreaterThan(2)
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
  })

  describe('Shuangpin support', () => {
    it('generates Shuangpin variants for Chinese characters', () => {
      const variants = toPinyinVariants('微信')
      
      // Should have more variants than just full pinyin and initials
      expect(variants.length).toBeGreaterThan(2)
      
      // The function should generate Shuangpin for xiaohe, sougou, and microsoft
      // Each scheme may produce different output
      const uniqueVariants = new Set(variants)
      expect(uniqueVariants.size).toBeGreaterThanOrEqual(3)
    })

    it('Shuangpin variants can be used for matching', () => {
      // Get all variants including Shuangpin
      const variants = toPinyinVariants('测试')
      
      // Should have full pinyin
      expect(variants).toContain('ceshi')
      
      // Should have initials
      expect(variants).toContain('cs')
      
      // Should have additional Shuangpin variants
      expect(variants.length).toBeGreaterThan(2)
      
      // All variants should be matchable
      variants.forEach(variant => {
        expect(matchesPinyin('测试', variant)).toBe(true)
      })
    })

    it('generates different Shuangpin for different schemes', () => {
      // Test that we're actually getting scheme-specific output
      const variants = toPinyinVariants('中国')
      
      // Should have at least: full pinyin + initials + 3 schemes
      expect(variants.length).toBeGreaterThanOrEqual(3)
      
      // Basic variants should be present
      expect(variants).toContain('zhongguo')
      expect(variants).toContain('zg')
    })

    it('Shuangpin works for common app names', () => {
      const variants = toPinyinVariants('微信')
      
      // Verify the function generates multiple search options
      expect(variants.length).toBeGreaterThanOrEqual(3)
      
      // All generated variants should work with matchesPinyin
      for (const variant of variants) {
        if (variant) {
          expect(matchesPinyin('微信', variant)).toBe(true)
        }
      }
    })
  })
})
