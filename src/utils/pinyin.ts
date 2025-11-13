import { pinyin } from 'pinyin-pro'

/**
 * Convert Chinese characters to Pinyin for search matching
 * @param text - Text to convert (can contain Chinese and non-Chinese characters)
 * @returns Array of Pinyin representations:
 *   - Full Pinyin (e.g., "weixin" for "微信")
 *   - Initial letters (e.g., "wx" for "微信")
 */
export function toPinyinVariants(text: string): string[] {
  if (!text) {
    return []
  }

  // Check if text contains any Chinese characters
  const hasChinese = /[\u4e00-\u9fa5]/.test(text)
  
  if (!hasChinese) {
    // No Chinese characters, return original text
    return [text]
  }

  const variants: string[] = []

  // Get full Pinyin without tone marks (e.g., "weixin")
  const fullPinyin = pinyin(text, {
    toneType: 'none',
    type: 'all',
    nonZh: 'consecutive',
  })
  if (fullPinyin) {
    variants.push(fullPinyin.toLowerCase())
  }

  // Get initial letters only (e.g., "wx" for "微信")
  const initials = pinyin(text, {
    pattern: 'first',
    toneType: 'none',
    type: 'all',
    nonZh: 'consecutive',
  })
  if (initials) {
    variants.push(initials.toLowerCase())
  }

  // Remove duplicates and empty strings
  return Array.from(new Set(variants.filter(v => v.length > 0)))
}

/**
 * Check if a search query matches any Pinyin variant of the text
 * @param text - Text to search in (e.g., app name with Chinese characters)
 * @param query - Search query (e.g., user input)
 * @returns true if query matches any Pinyin variant
 */
export function matchesPinyin(text: string, query: string): boolean {
  const variants = toPinyinVariants(text)
  const lowerQuery = query.toLowerCase()
  
  return variants.some(variant => 
    variant.includes(lowerQuery) || 
    variant.startsWith(lowerQuery)
  )
}
