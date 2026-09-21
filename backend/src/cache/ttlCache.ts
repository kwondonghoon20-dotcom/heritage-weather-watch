interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  // ttlMs 를 주면 이 항목만 그 시간 동안 유지한다(예: 실패 결과는 성공보다 짧게).
  set(key: string, value: T, ttlMs: number = this.ttlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.store.size > 1000) this.prune();
  }

  // 조회되지 않고 만료만 된 항목(예: 지난 시각의 키)이 쌓이지 않도록 가끔 정리한다.
  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) if (now > entry.expiresAt) this.store.delete(key);
  }
}
