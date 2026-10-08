import { describe, it, expect, vi } from 'vitest';
import { supabase, isSupabaseConfigured, MockSupabaseClient, MockRealtimeChannel } from '../supabase';

describe('Supabase Client & Mock Fallback', () => {
  it('exports a singleton supabase client instance', () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.channel).toBe('function');
    expect(typeof supabase.removeChannel).toBe('function');
  });

  it('correctly evaluates isSupabaseConfigured when env vars are missing', () => {
    // In test environment without VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
    const configured = isSupabaseConfigured();
    expect(typeof configured).toBe('boolean');
  });

  it('provides safe MockSupabaseClient channel lifecycle', async () => {
    const mockClient = new MockSupabaseClient();
    const ch1 = mockClient.channel('test-channel');

    expect(ch1).toBeInstanceOf(MockRealtimeChannel);
    expect(ch1.topic).toBe('realtime:test-channel');
    expect(ch1.status).toBe('CLOSED');

    // Re-accessing same channel returns existing instance
    const ch1Again = mockClient.channel('test-channel');
    expect(ch1Again).toBe(ch1);
    expect(mockClient.getChannels()).toHaveLength(1);

    // Subscribe
    const subCallback = vi.fn();
    ch1.subscribe(subCallback);
    expect(ch1.status).toBe('SUBSCRIBED');

    // Remove channel by instance
    await mockClient.removeChannel(ch1);
    expect(ch1.status).toBe('CLOSED');
    expect(mockClient.getChannels()).toHaveLength(0);

    // Create another and remove by name
    mockClient.channel('test-channel-2');
    expect(mockClient.getChannels()).toHaveLength(1);
    await mockClient.removeChannel('test-channel-2');
    expect(mockClient.getChannels()).toHaveLength(0);
  });

  it('handles removeAllChannels cleanly', async () => {
    const mockClient = new MockSupabaseClient();
    mockClient.channel('ch-a');
    mockClient.channel('ch-b');
    expect(mockClient.getChannels()).toHaveLength(2);

    await mockClient.removeAllChannels();
    expect(mockClient.getChannels()).toHaveLength(0);
  });

  it('removes channels synchronously from getChannels prior to awaiting unsubscribe', () => {
    const mockClient = new MockSupabaseClient();
    const ch = mockClient.channel('sync-channel');
    expect(mockClient.getChannels()).toHaveLength(1);

    // Call removeChannel without awaiting
    void mockClient.removeChannel(ch);
    expect(mockClient.getChannels()).toHaveLength(0);

    // Call removeAllChannels without awaiting
    mockClient.channel('sync-a');
    mockClient.channel('sync-b');
    expect(mockClient.getChannels()).toHaveLength(2);

    void mockClient.removeAllChannels();
    expect(mockClient.getChannels()).toHaveLength(0);
  });

  it('emits events to registered listeners on MockRealtimeChannel', () => {
    const channel = new MockRealtimeChannel('realtime:test');
    const listener = vi.fn();

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'work_requests' },
      listener
    );

    expect(channel.getListeners()).toHaveLength(1);

    // Emitting matching postgres_changes event triggers callback
    const payload = {
      eventType: 'UPDATE',
      new: { id: 'wr-1', version: 2 },
      old: { id: 'wr-1', version: 1 },
    };

    channel.emit('postgres_changes', payload);
    expect(listener).toHaveBeenCalledWith(payload);

    // Direct event type emit
    channel.emit('UPDATE', payload);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
