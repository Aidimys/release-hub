const OWN_EVENT_TTL_MS = 5_000;

interface OwnEvent {
  value: unknown;
  expiresAt: number;
}

const ownEvents = new Map<string, OwnEvent>();

const signature = (table: string, id: string) => `${table}:${id}`;

export const realtimeDedup = {
  markOwn(table: string, id: string, value?: unknown) {
    ownEvents.set(signature(table, id), { value, expiresAt: Date.now() + OWN_EVENT_TTL_MS });
  },

  consumeIfOwn(table: string, id: string, value?: unknown): boolean {
    const key = signature(table, id);
    const entry = ownEvents.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      ownEvents.delete(key);
      return false;
    }
    if (value !== undefined && entry.value !== value) {
      return false;
    }
    ownEvents.delete(key);
    return true;
  },

  clear() {
    ownEvents.clear();
  },
};
