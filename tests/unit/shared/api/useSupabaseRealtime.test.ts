import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAppRealtime,
  useProductReleasesRealtime,
  useReleaseRealtime,
  useWorkspaceRealtime,
} from '@/shared/api/useSupabaseRealtime';
import { realtimeDedup } from '@/shared/api/realtimeDedup';
import { supabase } from '@/shared/api/supabase';

interface TestPayload {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}

interface Sub {
  opts: Record<string, unknown>;
  cb: (payload: TestPayload) => void;
}

interface FakeChannel {
  channelName: string;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  subs: Sub[];
  emit: (table: string, payload: TestPayload) => void;
}

const createFakeChannel = (channelName: string): FakeChannel => {
  const subs: Sub[] = [];
  const channel: FakeChannel = {
    channelName,
    on: vi.fn((_event: string, opts: Record<string, unknown>, cb: (payload: TestPayload) => void) => {
      subs.push({ opts, cb });
      return channel;
    }),
    subscribe: vi.fn(() => Promise.resolve('subscribed')),
    subs,
    emit: (table: string, payload: TestPayload) => {
      const sub = subs.find((s) => s.opts.table === table);
      sub?.cb(payload);
    },
  };
  return channel;
};

vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const mockedSupabase = supabase as unknown as {
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });

const wrapperFor = (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);

const channels: FakeChannel[] = [];

const setup = () => {
  const queryClient = makeQueryClient();
  const wrapper = wrapperFor(queryClient);
  channels.length = 0;
  mockedSupabase.channel.mockImplementation((name: string) => {
    const ch = createFakeChannel(name);
    channels.push(ch);
    return ch;
  });
  mockedSupabase.removeChannel.mockClear();
  realtimeDedup.clear();
  return { queryClient, wrapper };
};

const scopedKeys = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map((call) => call?.[0]?.queryKey ?? null);

describe('realtimeDedup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    realtimeDedup.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    realtimeDedup.clear();
  });

  it('marks and consumes its own optimistic event', () => {
    realtimeDedup.markOwn('releases', 'R1', 'review');
    expect(realtimeDedup.consumeIfOwn('releases', 'R1', 'review')).toBe(true);
    expect(realtimeDedup.consumeIfOwn('releases', 'R1', 'review')).toBe(false);
  });

  it('matches by value, a different value is not consumed', () => {
    realtimeDedup.markOwn('releases', 'R1', 'review');
    expect(realtimeDedup.consumeIfOwn('releases', 'R1', 'published')).toBe(false);
    expect(realtimeDedup.consumeIfOwn('releases', 'R1', 'review')).toBe(true);
  });

  it('does not match a different record id', () => {
    realtimeDedup.markOwn('releases', 'R1', 'review');
    expect(realtimeDedup.consumeIfOwn('releases', 'R2', 'review')).toBe(false);
  });

  it('matches any value when none is provided', () => {
    realtimeDedup.markOwn('releases', 'R1', 'review');
    expect(realtimeDedup.consumeIfOwn('releases', 'R1')).toBe(true);
  });

  it('expires its marker after the TTL', () => {
    realtimeDedup.markOwn('releases', 'R1', 'review');
    vi.advanceTimersByTime(5_001);
    expect(realtimeDedup.consumeIfOwn('releases', 'R1', 'review')).toBe(false);
  });
});

describe('useAppRealtime', () => {
  it('subscribes to workspace tables only and never to releases (no global release invalidation)', () => {
    const { wrapper } = setup();
    renderHook(() => useAppRealtime(), { wrapper });

    const channel = channels[0];
    expect(channel.channelName).toBe('app-realtime');
    const tables = channel.subs.map((s) => s.opts.table);
    expect(tables).toEqual(expect.arrayContaining(['workspaces', 'workspace_members', 'workspace_invites']));
    expect(tables).not.toContain('releases');
  });

  it('does not perform a bare (global) invalidateQueries on unknown tables', () => {
    const { queryClient, wrapper } = setup();
    renderHook(() => useAppRealtime(), { wrapper });
    const channel = channels[0];

    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    channel.emit('workspace_invites', { eventType: 'INSERT', new: { id: 'i1', workspace_id: 'w1' } });

    const keys = scopedKeys(spy);
    expect(keys).not.toContain(null);
  });
});

describe('useReleaseRealtime', () => {
  it('subscribes with an SQL filter by release id for every release-related table (SQL filtering, not event filtering only)', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    renderHook(() => useReleaseRealtime('R1', 'W1'), { wrapper });

    const channel = channels[0];
    expect(channel.channelName).toBe('release-R1');
    const filters = Object.fromEntries(channel.subs.map((s) => [s.opts.table, s.opts.filter]));
    expect(filters.releases).toBe('id=eq.R1');
    expect(filters.release_changes).toBe('release_id=eq.R1');
    expect(filters.comments).toBe('release_id=eq.R1');
    expect(filters.release_reviewers).toBe('release_id=eq.R1');
    expect(filters.activity_events).toBe('release_id=eq.R1');
  });

  it('invalidates only scoped release keys on a remote status UPDATE (no global invalidation)', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['release', 'R1'], { id: 'R1', status: 'draft', title: 't', version: '1' } as Record<string, unknown>);
    renderHook(() => useReleaseRealtime('R1', 'W1'), { wrapper });

    const channel = channels[0];
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      channel.emit('releases', { eventType: 'UPDATE', new: { id: 'R1', status: 'review', product_id: 'P1' } });
    });

    const release = queryClient.getQueryData<Record<string, unknown>>(['release', 'R1']);
    expect(release?.status).toBe('review');

    const keys = scopedKeys(spy);
    expect(keys).toContainEqual(['release', 'R1']);
    expect(keys).toContainEqual(['workspace_releases', 'W1']);
    expect(keys).not.toContainEqual(['release']);
    expect(keys).not.toContainEqual(['workspace_releases']);
    expect(keys).not.toContainEqual(['product_releases']);
    expect(keys).not.toContain(null);
  });

  it('dedups the own optimistic status event and applies a different status change', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['release', 'R1'], { id: 'R1', status: 'draft' } as Record<string, unknown>);
    queryClient.setQueryData(['release_deleted', 'R1'], false);
    renderHook(() => useReleaseRealtime('R1', 'W1'), { wrapper });

    const channel = channels[0];
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    realtimeDedup.markOwn('releases', 'R1', 'review');

    act(() => {
      channel.emit('releases', { eventType: 'UPDATE', new: { id: 'R1', status: 'review' } });
    });

    expect(queryClient.getQueryData<Record<string, unknown>>(['release', 'R1'])?.status).toBe('draft');
    expect(scopedKeys(spy)).not.toContainEqual(['release', 'R1']);

    act(() => {
      channel.emit('releases', { eventType: 'UPDATE', new: { id: 'R1', status: 'published' } });
    });

    expect(queryClient.getQueryData<Record<string, unknown>>(['release', 'R1'])?.status).toBe('published');
    expect(scopedKeys(spy)).toContainEqual(['release', 'R1']);
  });

  it('dedups own optimistic reorder events on release_changes but applies unrelated edits', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['release_changes', 'R1'], [
      { id: 'c1', position: 0 },
      { id: 'c2', position: 1 },
    ] as unknown as Record<string, unknown>[]);
    renderHook(() => useReleaseRealtime('R1'), { wrapper });

    realtimeDedup.markOwn('release_changes', 'c1', 1);
    realtimeDedup.markOwn('release_changes', 'c2', 0);

    const channel = channels[0];
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      channel.emit('release_changes', { eventType: 'UPDATE', new: { id: 'c1', position: 1, release_id: 'R1' } });
    });
    act(() => {
      channel.emit('release_changes', { eventType: 'UPDATE', new: { id: 'c2', position: 0, release_id: 'R1' } });
    });

    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['release_changes', 'R1'] });

    act(() => {
      channel.emit('release_changes', { eventType: 'UPDATE', new: { id: 'c3', position: 2, release_id: 'R1' } });
    });

    expect(queryClient.getQueryData<unknown>(['release_changes', 'R1'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'c3', position: 2 })])
    );
  });

  it('handles DELETE: clears release cache, marks deleted and removes from scoped list caches', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['release', 'R1'], { id: 'R1', status: 'draft' } as Record<string, unknown>);
    queryClient.setQueryData(['release_deleted', 'R1'], false);
    queryClient.setQueryData(['workspace_releases', 'W1'], [{ id: 'R1', status: 'draft' }]);
    queryClient.setQueryData(['product_releases', 'P1'], [{ id: 'R1', status: 'draft' }]);
    renderHook(() => useReleaseRealtime('R1', 'W1'), { wrapper });

    const channel = channels[0];
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      channel.emit('releases', {
        eventType: 'DELETE',
        old: { id: 'R1', product_id: 'P1', status: 'draft' },
      });
    });

    expect(queryClient.getQueryData(['release', 'R1'])).toBeNull();
    expect(queryClient.getQueryData(['release_deleted', 'R1'])).toBe(true);
    expect(queryClient.getQueryData<Array<{ id: string }>>(['workspace_releases', 'W1'])).toEqual([]);
    expect(queryClient.getQueryData<Array<{ id: string }>>(['product_releases', 'P1'])).toEqual([]);

    const keys = scopedKeys(spy);
    expect(keys).toContainEqual(['workspace_releases', 'W1']);
    expect(keys).toContainEqual(['product_releases', 'P1']);
    expect(keys).not.toContain(null);
  });

  it('marks an open release as deleted when another user removes it (cross-user delete of open release)', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['release', 'R1'], { id: 'R1', status: 'draft', title: 'R1' } as Record<string, unknown>);
    queryClient.setQueryData(['release_deleted', 'R1'], false);
    renderHook(() => useReleaseRealtime('R1', 'W1'), { wrapper });

    const channel = channels[0];

    act(() => {
      channel.emit('releases', { eventType: 'DELETE', old: { id: 'R1', product_id: 'P1' } });
    });

    expect(queryClient.getQueryData(['release_deleted', 'R1'])).toBe(true);
    expect(queryClient.getQueryData(['release', 'R1'])).toBeNull();
  });

  it('applies list mutations for changes, comments, reviewers and activity via scoped caches', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['release_changes', 'R1'], [{ id: 'c1', position: 0, title: 'old' }]);
    queryClient.setQueryData(['release_comments', 'R1'], [{ id: 'cm1', content: 'x' }]);
    queryClient.setQueryData(['release_reviewers', 'R1'], [{ id: 'rv1', user_id: 'u1' }]);
    queryClient.setQueryData(['release_activity', 'R1'], [{ id: 'a1' }]);
    renderHook(() => useReleaseRealtime('R1'), { wrapper });

    const channel = channels[0];

    act(() => {
      channel.emit('release_changes', { eventType: 'UPDATE', new: { id: 'c1', position: 0, title: 'new' } });
    });
    act(() => {
      channel.emit('comments', { eventType: 'INSERT', new: { id: 'cm2', content: 'y' } });
    });
    act(() => {
      channel.emit('release_reviewers', { eventType: 'DELETE', old: { id: 'rv1' } });
    });
    act(() => {
      channel.emit('activity_events', { eventType: 'INSERT', new: { id: 'a2' } });
    });

    expect(queryClient.getQueryData<Array<{ id: string; title: string }>>(['release_changes', 'R1'])).toEqual([
      expect.objectContaining({ id: 'c1', title: 'new' }),
    ]);
    expect(queryClient.getQueryData<Array<{ id: string }>>(['release_comments', 'R1'])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'cm1' }),
        expect.objectContaining({ id: 'cm2' }),
      ])
    );
    expect(queryClient.getQueryData<Array<{ id: string }>>(['release_reviewers', 'R1'])).toEqual([]);
    expect(queryClient.getQueryData<Array<{ id: string }>>(['release_activity', 'R1'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'a2' })])
    );
  });

  it('removes the old release channel and subscribes to the new release id on id change (no leftover subscription)', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    const { rerender } = renderHook(({ releaseId }) => useReleaseRealtime(releaseId, 'W1'), {
      wrapper,
      initialProps: { releaseId: 'R1' },
    });

    const firstChannel = channels[0];
    expect(firstChannel.channelName).toBe('release-R1');

    rerender({ releaseId: 'R2' });

    const removeCalls = mockedSupabase.removeChannel.mock.calls;
    expect(removeCalls.length).toBe(1);
    expect(removeCalls[0]?.[0]).toBe(firstChannel);

    expect(channels.length).toBe(2);
    const secondChannel = channels[1];
    expect(secondChannel.channelName).toBe('release-R2');
    const filters = Object.fromEntries(secondChannel.subs.map((s) => [s.opts.table, s.opts.filter]));
    expect(filters.releases).toBe('id=eq.R2');
  });

  it('cleans up the channel on unmount (no leftover subscription)', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    const { unmount } = renderHook(() => useReleaseRealtime('R1', 'W1'), { wrapper });

    const firstChannel = channels[0];
    unmount();

    expect(mockedSupabase.removeChannel).toHaveBeenCalledWith(firstChannel);
  });
});

describe('useWorkspaceRealtime', () => {
  it('subscribes to workspace-scoped tables with SQL filters', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    renderHook(() => useWorkspaceRealtime('W1'), { wrapper });

    const channel = channels[0];
    expect(channel.channelName).toBe('workspace-W1');
    const filters = Object.fromEntries(channel.subs.map((s) => [s.opts.table, s.opts.filter]));
    expect(filters.workspace_members).toBe('workspace_id=eq.W1');
    expect(filters.workspace_invites).toBe('workspace_id=eq.W1');
    expect(filters.products).toBe('workspace_id=eq.W1');
  });

  it('only applies a release event to the workspace when the release belongs to the workspace (no cross-workspace pollution)', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['products', 'W1'], [{ id: 'P1', workspace_id: 'W1' }]);
    queryClient.setQueryData(['workspace_releases', 'W1'], [{ id: 'R1', status: 'draft' }]);
    renderHook(() => useWorkspaceRealtime('W1'), { wrapper });

    const channel = channels[0];
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      channel.emit('releases', { eventType: 'UPDATE', new: { id: 'R2', product_id: 'P2', status: 'review' } });
    });

    expect(queryClient.getQueryData<Array<{ id: string }>>(['workspace_releases', 'W1'])).toEqual([
      expect.objectContaining({ id: 'R1' }),
    ]);
    expect(scopedKeys(spy)).not.toContainEqual(['workspace_releases', 'W1']);

    act(() => {
      channel.emit('releases', { eventType: 'UPDATE', new: { id: 'R1', product_id: 'P1', status: 'review' } });
    });

    expect(queryClient.getQueryData<Array<{ id: string }>>(['workspace_releases', 'W1'])).toEqual([
      expect.objectContaining({ id: 'R1', status: 'review' }),
    ]);
  });
});

describe('useProductReleasesRealtime', () => {
  it('subscribes with an SQL filter by product_id', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    renderHook(() => useProductReleasesRealtime('P1'), { wrapper });

    const channel = channels[0];
    expect(channel.channelName).toBe('product-releases-P1');
    const filters = Object.fromEntries(channel.subs.map((s) => [s.opts.table, s.opts.filter]));
    expect(filters.releases).toBe('product_id=eq.P1');
  });

  it('applies DELETE/UPDATE to the scoped product_releases cache', () => {
    const { queryClient } = setup();
    const wrapper = wrapperFor(queryClient);
    queryClient.setQueryData(['product_releases', 'P1'], [
      { id: 'R1', status: 'draft' },
      { id: 'R2', status: 'draft' },
    ]);
    renderHook(() => useProductReleasesRealtime('P1'), { wrapper });

    const channel = channels[0];

    act(() => {
      channel.emit('releases', { eventType: 'UPDATE', new: { id: 'R1', status: 'review' } });
    });
    expect(queryClient.getQueryData<Array<{ id: string; status: string }>>(['product_releases', 'P1'])).toEqual([
      expect.objectContaining({ id: 'R1', status: 'review' }),
      expect.objectContaining({ id: 'R2' }),
    ]);

    act(() => {
      channel.emit('releases', { eventType: 'DELETE', old: { id: 'R2' } });
    });
    expect(queryClient.getQueryData<Array<{ id: string }>>(['product_releases', 'P1'])).toEqual([
      expect.objectContaining({ id: 'R1' }),
    ]);
  });
});
