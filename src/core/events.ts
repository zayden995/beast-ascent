/** Tiny typed event bus. Systems talk through it instead of importing each other. */
export class EventBus<T extends object> {
  private listeners = new Map<keyof T, Set<(payload: never) => void>>();

  on<K extends keyof T>(type: K, fn: (payload: T[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as (payload: never) => void);
    return () => set.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof T>(type: K, payload: T[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) (fn as (payload: T[K]) => void)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
