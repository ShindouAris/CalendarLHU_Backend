function getCurrentTime(): number {
  return Math.floor(Date.now() / 1000);
}

class LRUCacheNode<K, V> {
  key: K;
  value: V;
  lastAccessTimestamp: number;
  prevKey: K | null;
  nextKey: K | null;

  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
    this.lastAccessTimestamp = getCurrentTime();
    this.prevKey = null;
    this.nextKey = null;
  }
}

export class LRUCache<K, V> {
  private capacity: number;
  private expireSeconds: number;
  private cache: Map<K, LRUCacheNode<K, V>>;
  private headKey: K | null;
  private tailKey: K | null;

  constructor(capacity: number, expireSeconds: number) {
    this.capacity = capacity;
    this.expireSeconds = expireSeconds;
    this.cache = new Map();
    this.headKey = null;
    this.tailKey = null;
  }

  private remove(key: K): void {
    const node = this.cache.get(key)!;
    const prevKey = node.prevKey;
    const nextKey = node.nextKey;

    if (prevKey !== null) {
      this.cache.get(prevKey)!.nextKey = nextKey;
    } else {
      this.headKey = nextKey;
    }

    if (nextKey !== null) {
      this.cache.get(nextKey)!.prevKey = prevKey;
    } else {
      this.tailKey = prevKey;
    }
  }

  private add(key: K): void {
    const node = this.cache.get(key)!;
    node.lastAccessTimestamp = getCurrentTime();
    node.prevKey = this.tailKey;
    node.nextKey = null;

    if (this.tailKey !== null) {
      this.cache.get(this.tailKey)!.nextKey = key;
    } else {
      this.headKey = key;
    }

    this.tailKey = key;
  }

  get(key: K, defaultValue: V | null = null): V | null {
    if (!this.cache.has(key)) {
      return defaultValue;
    }

    const node = this.cache.get(key)!;

    if (
      this.expireSeconds > 0 &&
      node.lastAccessTimestamp + this.expireSeconds < getCurrentTime()
    ) {
      this.remove(key);
      this.cache.delete(key);
      return defaultValue;
    }

    this.remove(key);
    this.add(key);

    return node.value;
  }

  put(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.remove(key);
    }

    const node = new LRUCacheNode<K, V>(key, value);
    this.cache.set(key, node);
    this.add(key);

    if (this.cache.size > this.capacity) {
      const lruKey = this.headKey;
      if (lruKey !== null) {
        this.remove(lruKey);
        this.cache.delete(lruKey);
      }
    }
  }

  delete(key: K): void {
    if (this.cache.has(key)) {
      this.remove(key);
      this.cache.delete(key);
    }
  }
}
