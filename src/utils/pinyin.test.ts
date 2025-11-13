import { describe, expect, it } from 'vitest'
import { toPinyinVariants, matchesPinyin } from './pinyin'

describe('Pinyin utility', () => {
  describe('toPinyinVariants', () => {
    it('converts Chinese characters to Pinyin variants', () => {
      const variants = toPinyinVariants('微信')
      
      expect(variants).toContain('weixin')  // full pinyin
      expect(variants).toContain('wx')      // initials
      // Should have at least 2 variants (full + initials) plus Shuangpin variants
      expect(variants.length).toBeGreaterThanOrEqual(2)
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
    it('generates Shuangpin variants in addition to full Pinyin and initials', () => {
      const variants = toPinyinVariants('微信')
      
      // Should have at least: full pinyin + initials + some Shuangpin variants
      expect(variants.length).toBeGreaterThan(2)
      
      // Verify basic variants are present
      expect(variants).toContain('weixin')  // full pinyin
      expect(variants).toContain('wx')      // initials
      
      // There should be additional variants (Shuangpin)
      const nonBasicVariants = variants.filter(v => v !== 'weixin' && v !== 'wx')
      expect(nonBasicVariants.length).toBeGreaterThan(0)
    })

    it('Shuangpin variants are matchable', () => {
      const variants = toPinyinVariants('测试')
      
      // Should have full pinyin and initials
      expect(variants).toContain('ceshi')
      expect(variants).toContain('cs')
      
      // All generated variants should be matchable
      variants.forEach(variant => {
        expect(matchesPinyin('测试', variant)).toBe(true)
      })
    })

    it('generates Shuangpin for multiple characters', () => {
      const variants = toPinyinVariants('中国')
      
      // Should have basic variants
      expect(variants).toContain('zhongguo')
      expect(variants).toContain('zg')
      
      // Should have additional Shuangpin variants
      expect(variants.length).toBeGreaterThan(2)
    })

    it('Shuangpin works for common app names', () => {
      const testCases = ['微信', '中文', '音乐', '测试']
      
      testCases.forEach(text => {
        const variants = toPinyinVariants(text)
        
        // Should generate multiple variants including Shuangpin
        expect(variants.length).toBeGreaterThan(2)
        
        // All variants should be matchable
        variants.forEach(variant => {
          expect(matchesPinyin(text, variant)).toBe(true)
        })
      })
    })

    it('handles partial Shuangpin matches', () => {
      const variants = toPinyinVariants('微信')
      
      // If any Shuangpin variant starts with specific patterns, it should match
      variants.forEach(variant => {
        if (variant.length >= 2) {
          const partialMatch = variant.substring(0, 2)
          expect(matchesPinyin('微信', partialMatch)).toBe(true)
        }
      })
    })
  })
})
