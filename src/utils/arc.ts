/**
 * ARC (Adaptive Replacement Cache) Algorithm
 * 
 * ARC maintains two LRU lists:
 * - T1: Recently accessed items with low frequency
 * - T2: Frequently accessed items
 * 
 * The algorithm adaptively balances between recency and frequency
 * based on hit patterns, without requiring manual parameter tuning.
 */

export interface CacheItem<T> {
  key: string
  value: T
  lastAccessed: number
  accessCount: number
}

export interface ARCStats {
  t1Size: number
  t2Size: number
  p: number
}

export class ARC<T> {
  private t1: Map<string, CacheItem<T>> // Recently accessed, low frequency
  private t2: Map<string, CacheItem<T>> // Frequently accessed
  private b1: Map<string, CacheItem<T>> // Ghost list for T1 (evicted items)
  private b2: Map<string, CacheItem<T>> // Ghost list for T2 (evicted items)
  private p: number // Adaptation parameter (0 to capacity)
  private capacity: number

  constructor(capacity: number = 5) {
    this.capacity = capacity
    this.t1 = new Map()
    this.t2 = new Map()
    this.b1 = new Map()
    this.b2 = new Map()
    this.p = 0
  }

  /**
   * Access an item, updating its position in the cache
   */
  access(key: string, value: T): void {
    const now = Date.now()

    // Case 1: Item is in T1 or T2 (cache hit)
    if (this.t1.has(key)) {
      // Move from T1 to T2 (promote to frequent list)
      const item = this.t1.get(key)!
      this.t1.delete(key)
      item.accessCount++
      item.lastAccessed = now
      this.t2.set(key, item)
      this.replace(false) // Hit in T1, decrease p
      return
    }

    if (this.t2.has(key)) {
      // Update in T2 (already frequent)
      const item = this.t2.get(key)!
      item.accessCount++
      item.lastAccessed = now
      // Move to end (most recently used in T2)
      this.t2.delete(key)
      this.t2.set(key, item)
      this.replace(true) // Hit in T2, increase p
      return
    }

    // Case 2: Item is in B1 (ghost of T1)
    if (this.b1.has(key)) {
      // Adapt: increase p
      const delta = Math.min(this.b2.size, 1)
      this.p = Math.min(this.capacity, this.p + delta)
      this.replace(true)
      // Move from B1 to T2
      this.b1.delete(key)
      const item: CacheItem<T> = {
        key,
        value,
        lastAccessed: now,
        accessCount: 1,
      }
      this.t2.set(key, item)
      return
    }

    // Case 3: Item is in B2 (ghost of T2)
    if (this.b2.has(key)) {
      // Adapt: decrease p
      const delta = Math.min(this.b1.size, 1)
      this.p = Math.max(0, this.p - delta)
      this.replace(false)
      // Move from B2 to T2
      this.b2.delete(key)
      const item: CacheItem<T> = {
        key,
        value,
        lastAccessed: now,
        accessCount: 1,
      }
      this.t2.set(key, item)
      return
    }

    // Case 4: Item is not in cache (cache miss)
    const item: CacheItem<T> = {
      key,
      value,
      lastAccessed: now,
      accessCount: 1,
    }

    // Decide where to place new item based on current state
    const l1Size = this.t1.size + this.b1.size
    const l2Size = this.t2.size + this.b2.size

    if (l1Size === this.capacity) {
      // L1 is full
      if (this.t1.size < this.capacity) {
        // Evict from B1
        const firstKey = this.b1.keys().next().value
        if (firstKey) {
          this.b1.delete(firstKey)
        }
        this.replace(false)
      } else {
        // Evict from T1
        const firstKey = this.t1.keys().next().value
        if (firstKey) {
          const evicted = this.t1.get(firstKey)!
          this.t1.delete(firstKey)
          this.b1.set(firstKey, evicted)
        }
      }
    } else if (l1Size < this.capacity && l1Size + l2Size >= this.capacity) {
      // Total size exceeds capacity
      if (l1Size + l2Size === 2 * this.capacity) {
        // Evict from B2
        const firstKey = this.b2.keys().next().value
        if (firstKey) {
          this.b2.delete(firstKey)
        }
      }
      this.replace(false)
    }

    // Add to T1 (new items start in recent list)
    this.t1.set(key, item)
  }

  /**
   * Replace items when cache is full
   */
  private replace(containsInT2: boolean): void {
    if (
      this.t1.size >= 1 &&
      ((containsInT2 && this.t1.size > this.p) || this.t1.size > this.p)
    ) {
      // Evict from T1
      const firstKey = this.t1.keys().next().value
      if (firstKey) {
        const evicted = this.t1.get(firstKey)!
        this.t1.delete(firstKey)
        this.b1.set(firstKey, evicted)
      }
    } else {
      // Evict from T2
      const firstKey = this.t2.keys().next().value
      if (firstKey) {
        const evicted = this.t2.get(firstKey)!
        this.t2.delete(firstKey)
        this.b2.set(firstKey, evicted)
      }
    }
  }

  /**
   * Get all items in T2 (frequently accessed items)
   * These are the recommended items
   */
  getRecommended(): CacheItem<T>[] {
    return Array.from(this.t2.values())
  }

  /**
   * Get all cached items (T1 + T2)
   */
  getAll(): CacheItem<T>[] {
    return [...Array.from(this.t1.values()), ...Array.from(this.t2.values())]
  }

  /**
   * Get item by key
   */
  get(key: string): T | undefined {
    if (this.t1.has(key)) {
      return this.t1.get(key)!.value
    }
    if (this.t2.has(key)) {
      return this.t2.get(key)!.value
    }
    return undefined
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.t1.has(key) || this.t2.has(key)
  }

  /**
   * Get statistics
   */
  getStats(): ARCStats {
    return {
      t1Size: this.t1.size,
      t2Size: this.t2.size,
      p: this.p,
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.t1.clear()
    this.t2.clear()
    this.b1.clear()
    this.b2.clear()
    this.p = 0
  }

  /**
   * Export state for persistence
   */
  export(): {
    t1: Array<[string, CacheItem<T>]>
    t2: Array<[string, CacheItem<T>]>
    b1: Array<[string, CacheItem<T>]>
    b2: Array<[string, CacheItem<T>]>
    p: number
    capacity: number
  } {
    return {
      t1: Array.from(this.t1.entries()),
      t2: Array.from(this.t2.entries()),
      b1: Array.from(this.b1.entries()),
      b2: Array.from(this.b2.entries()),
      p: this.p,
      capacity: this.capacity,
    }
  }

  /**
   * Import state from persistence
   */
  import(data: {
    t1: Array<[string, CacheItem<T>]>
    t2: Array<[string, CacheItem<T>]>
    b1: Array<[string, CacheItem<T>]>
    b2: Array<[string, CacheItem<T>]>
    p: number
    capacity: number
  }): void {
    this.t1 = new Map(data.t1)
    this.t2 = new Map(data.t2)
    this.b1 = new Map(data.b1)
    this.b2 = new Map(data.b2)
    this.p = data.p
    this.capacity = data.capacity
  }
}


