/**
 * Safe Singleton Supabase Client & Mock Fallback (Spec §4.3, Parcel E)
 *
 * Multiplexes all WebSocket CDC subscriptions over a single Supabase instance.
 * When environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing
 * (such as in test runners, CI, and static preview builds), falls back to a safe
 * MockSupabaseClient so that importing and mounting realtime components never throws.
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';

export interface MockRealtimeListener {
  type: string;
  filter: Record<string, unknown>;
  callback: (payload: unknown) => void;
}

export class MockRealtimeChannel {
  public topic: string;
  public status: string = 'CLOSED';
  private listeners: MockRealtimeListener[] = [];
  private presenceMap: Record<string, unknown[]> = {};
  private trackedKeys = new Set<string>();

  private subscribeCallbacks: ((status: string, err?: Error) => void)[] = [];

  constructor(topic: string) {
    this.topic = topic;
  }

  on(
    type: string,
    filterOrCallback: Record<string, unknown> | ((payload: unknown) => void),
    callback?: (payload: unknown) => void
  ): this {
    let filter: Record<string, unknown> = {};
    let cb: (payload: unknown) => void;

    if (typeof filterOrCallback === 'function') {
      cb = filterOrCallback;
    } else {
      filter = filterOrCallback || {};
      cb = callback || (() => {});
    }

    this.listeners.push({ type, filter, callback: cb });
    return this;
  }

  subscribe(callback?: (status: string, err?: Error) => void): this {
    this.status = 'SUBSCRIBED';
    if (callback) {
      this.subscribeCallbacks.push(callback);
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
          try {
            callback('SUBSCRIBED');
          } catch {
            // ignore callback exceptions in mock
          }
        });
      } else {
        setTimeout(() => {
          try {
            callback('SUBSCRIBED');
          } catch {
            // ignore callback exceptions in mock
          }
        }, 0);
      }
    }
    return this;
  }

  emitStatus(status: string, err?: Error): void {
    this.status = status;
    for (const cb of this.subscribeCallbacks) {
      try {
        cb(status, err);
      } catch {
        // ignore callback exceptions in mock
      }
    }
  }

  async unsubscribe(): Promise<'ok'> {
    this.status = 'CLOSED';
    this.listeners = [];
    this.subscribeCallbacks = [];
    this.presenceMap = {};
    this.trackedKeys.clear();
    return 'ok';
  }

  // Testing helper to simulate Postgres CDC events or custom channel events
  emit(event: string, payload: unknown): void {
    const normEvent = String(event).toUpperCase();
    const payloadRecord = payload as Record<string, unknown> | null | undefined;

    for (const listener of this.listeners) {
      if (listener.type === 'postgres_changes') {
        const filterEvent = listener.filter.event
          ? String(listener.filter.event).toUpperCase()
          : '*';
        const payloadEvent = payloadRecord?.eventType
          ? String(payloadRecord.eventType).toUpperCase()
          : '';

        if (
          filterEvent === '*' ||
          filterEvent === normEvent ||
          filterEvent === payloadEvent ||
          event === 'postgres_changes'
        ) {
          listener.callback(payload);
        }
      } else if (listener.type === 'presence') {
        const filterEvent = listener.filter?.event
          ? String(listener.filter.event).toLowerCase()
          : '*';
        const normEv = String(event).toLowerCase();
        const payloadEvent = payloadRecord?.event
          ? String(payloadRecord.event).toLowerCase()
          : '';

        const isMatch =
          filterEvent === '*' ||
          filterEvent === normEv ||
          (payloadEvent !== '' && filterEvent === payloadEvent);

        if (isMatch) {
          listener.callback(payload);
        }
      } else if (listener.type === event) {
        listener.callback(payload);
      }
    }
  }

  getListeners(): MockRealtimeListener[] {
    return [...this.listeners];
  }

  async send(_payload: unknown): Promise<'ok'> {
    return 'ok';
  }

  presenceState<T extends Record<string, unknown> = Record<string, unknown>>(): Record<string, T[]> {
    return { ...this.presenceMap } as Record<string, T[]>;
  }

  setPresenceState(state: Record<string, unknown[]>): void {
    this.presenceMap = { ...state };
  }

  async track(payload: Record<string, unknown>): Promise<'ok'> {
    const key = String(payload.userId || payload.id || 'current_user');
    this.trackedKeys.add(key);
    const presenceItem = {
      ...payload,
      presence_ref: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    this.presenceMap[key] = [presenceItem];
    this.emit('presence', {
      event: 'join',
      key,
      newPresences: [presenceItem],
      currentPresences: this.presenceMap[key],
    });
    this.emit('presence', {
      event: 'sync',
      key,
      newPresences: [presenceItem],
      currentPresences: this.presenceMap[key],
    });
    return 'ok';
  }

  async untrack(): Promise<'ok'> {
    const keysToUntrack = this.trackedKeys.size > 0
      ? Array.from(this.trackedKeys)
      : ['current_user'];

    for (const key of keysToUntrack) {
      const leftPresences = this.presenceMap[key] || [];
      delete this.presenceMap[key];
      this.emit('presence', {
        event: 'leave',
        key,
        leftPresences,
        currentPresences: [],
      });
      this.emit('presence', {
        event: 'sync',
        key,
        leftPresences,
      });
    }
    this.trackedKeys.clear();
    return 'ok';
  }
}

export class MockSupabaseClient {
  private channels = new Map<string, MockRealtimeChannel>();

  channel(name: string, _opts?: Record<string, unknown>): MockRealtimeChannel {
    const existing = this.channels.get(name);
    if (existing) {
      return existing;
    }

    const mockChannel = new MockRealtimeChannel(`realtime:${name}`);
    this.channels.set(name, mockChannel);
    return mockChannel;
  }

  async removeChannel(channel: RealtimeChannel | MockRealtimeChannel | string): Promise<'ok'> {
    let targetChannel: MockRealtimeChannel | undefined;

    if (typeof channel === 'string') {
      const ch = this.channels.get(channel);
      if (ch) {
        targetChannel = ch;
        this.channels.delete(channel);
      } else {
        // Fallback for topic lookup (e.g. 'realtime:cdc_work_requests')
        for (const [key, val] of this.channels.entries()) {
          if (val.topic === channel || val.topic === `realtime:${channel}`) {
            targetChannel = val;
            this.channels.delete(key);
            break;
          }
        }
      }
    } else if (channel && typeof channel === 'object') {
      const channelTopic = 'topic' in channel ? (channel as { topic: string }).topic : undefined;
      for (const [key, val] of this.channels.entries()) {
        if (val === channel || (channelTopic && val.topic === channelTopic)) {
          targetChannel = val;
          this.channels.delete(key);
          break;
        }
      }
    }

    if (targetChannel) {
      await targetChannel.unsubscribe();
    }

    return 'ok';
  }

  async removeAllChannels(): Promise<'ok'> {
    const toRemove = Array.from(this.channels.values());
    this.channels.clear();
    for (const ch of toRemove) {
      await ch.unsubscribe();
    }
    return 'ok';
  }

  getChannels(): MockRealtimeChannel[] {
    return Array.from(this.channels.values());
  }

  getChannel(name: string): MockRealtimeChannel | undefined {
    return this.channels.get(name);
  }
}

/**
 * Checks whether valid Supabase credentials are configured in the environment.
 */
export const isSupabaseConfigured = (): boolean => {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  const url =
    env?.VITE_SUPABASE_URL ??
    (typeof process !== 'undefined' ? (process.env?.VITE_SUPABASE_URL as string | undefined) : undefined);
  const key =
    env?.VITE_SUPABASE_ANON_KEY ??
    (typeof process !== 'undefined' ? (process.env?.VITE_SUPABASE_ANON_KEY as string | undefined) : undefined);

  return Boolean(
    url &&
    key &&
    typeof url === 'string' &&
    typeof key === 'string' &&
    url.trim() !== '' &&
    key.trim() !== '' &&
    !url.includes('placeholder')
  );
};

function createSupabaseInstance(): SupabaseClient {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  const url =
    env?.VITE_SUPABASE_URL ??
    (typeof process !== 'undefined' ? (process.env?.VITE_SUPABASE_URL as string | undefined) : undefined);
  const key =
    env?.VITE_SUPABASE_ANON_KEY ??
    (typeof process !== 'undefined' ? (process.env?.VITE_SUPABASE_ANON_KEY as string | undefined) : undefined);

  if (isSupabaseConfigured() && url && key) {
    return createClient(url, key, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return new MockSupabaseClient() as unknown as SupabaseClient;
}

/**
 * Singleton Supabase Client.
 * Guaranteed not to throw at import time even if env vars are undefined.
 */
export const supabase: SupabaseClient = createSupabaseInstance();
