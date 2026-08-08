import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useReorderReleaseChanges,
  useSubmitReleaseForReview,
  useCastReleaseVote,
  usePublishRelease,
  useReturnRejectedReleaseToDraft,
} from '@/features/workspaces/api/useReleaseDetails';
import { supabase } from '@/shared/api/supabase';

vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const mockedSupabase = supabase as unknown as { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };

const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapperFor = (client: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

describe('useSubmitReleaseForReview', () => {
  it('invalidates release, reviewers, changes and activity on success', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);
    mockedSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSubmitReleaseForReview(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ releaseId: 'r1', reviewerIds: ['u1'] });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey).filter(Boolean);
    expect(keys).toContainEqual(['release', 'r1']);
    expect(keys).toContainEqual(['release_reviewers', 'r1']);
    expect(keys).toContainEqual(['release_changes', 'r1']);
    expect(keys).toContainEqual(['release_activity', 'r1']);
  });

  it('propagates server error when RPC fails', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Not allowed' } });

    const { result } = renderHook(() => useSubmitReleaseForReview(), { wrapper });

    await expect(result.current.mutateAsync({ releaseId: 'r1', reviewerIds: ['u1'] })).rejects.toThrow('Not allowed');
  });
});

describe('useCastReleaseVote', () => {
  it('invalidates release, reviewers and activity on success', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);
    mockedSupabase.rpc.mockResolvedValue({ data: 'approved', error: null });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCastReleaseVote(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ releaseId: 'r1', decision: 'approved' });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey).filter(Boolean);
    expect(keys).toContainEqual(['release', 'r1']);
    expect(keys).toContainEqual(['release_reviewers', 'r1']);
    expect(keys).toContainEqual(['release_activity', 'r1']);
  });
});

describe('usePublishRelease', () => {
  it('invalidates release and changes on success', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);
    mockedSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePublishRelease(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ releaseId: 'r1' });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey).filter(Boolean);
    expect(keys).toContainEqual(['release', 'r1']);
    expect(keys).toContainEqual(['release_changes', 'r1']);
  });
});

describe('useReturnRejectedReleaseToDraft', () => {
  it('invalidates release and reviewers on success', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);
    mockedSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useReturnRejectedReleaseToDraft(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ releaseId: 'r1' });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey).filter(Boolean);
    expect(keys).toContainEqual(['release', 'r1']);
    expect(keys).toContainEqual(['release_reviewers', 'r1']);
  });
});

describe('useReorderReleaseChanges', () => {
  it('rolls back optimistic reorder when server request fails', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);

    queryClient.setQueryData(['release_changes', 'r1'], [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);

    mockedSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Server failure' } });

    const { result } = renderHook(() => useReorderReleaseChanges('r1'), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          items: [
            { id: 'b', position: 0 },
            { id: 'a', position: 1 },
          ],
          expectedUpdatedAt: null,
        });
      }),
    ).rejects.toThrow('Server failure');

    expect(queryClient.getQueryData(['release_changes', 'r1'])).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });

  it('restores previous cache on optimistic locking conflict', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);

    queryClient.setQueryData(['release_changes', 'r1'], [
      { id: 'a', position: 0, updated_at: '2026-08-01T00:00:00Z' },
      { id: 'b', position: 1, updated_at: '2026-08-01T00:00:00Z' },
    ]);

    mockedSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Release has been modified by another user. Please refresh.' },
    });

    const { result } = renderHook(() => useReorderReleaseChanges('r1'), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          items: [
            { id: 'b', position: 0 },
            { id: 'a', position: 1 },
          ],
          expectedUpdatedAt: '2026-08-01T00:00:00Z',
        });
      }),
    ).rejects.toThrow('Release has been modified by another user. Please refresh.');

    expect(queryClient.getQueryData(['release_changes', 'r1'])).toEqual([
      { id: 'a', position: 0, updated_at: '2026-08-01T00:00:00Z' },
      { id: 'b', position: 1, updated_at: '2026-08-01T00:00:00Z' },
    ]);
  });
});
