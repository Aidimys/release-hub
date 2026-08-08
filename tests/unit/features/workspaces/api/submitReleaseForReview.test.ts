import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSubmitReleaseForReview } from '@/features/workspaces/api/useReleaseDetails';
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

describe('submit_release_for_review as composite operation', () => {
  it('calls the RPC with releaseId and reviewerIds and invalidates all affected queries on success', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);
    mockedSupabase.rpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useSubmitReleaseForReview(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        releaseId: 'release-123',
        reviewerIds: ['reviewer-1', 'reviewer-2'],
        expectedUpdatedAt: '2026-08-01T00:00:00Z',
      });
    });

    expect(mockedSupabase.rpc).toHaveBeenCalledWith('submit_release_for_review', {
      p_release_id: 'release-123',
      p_reviewer_ids: ['reviewer-1', 'reviewer-2'],
      p_expected_updated_at: '2026-08-01T00:00:00Z',
    });

    const invalidatedKeys = mockedSupabase.rpc.mock.calls.map((call) => call[1]?.p_release_id);
    expect(invalidatedKeys).toContain('release-123');
  });

  it('propagates server error when composite operation fails', async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient);
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'RLS violation' } });

    const { result } = renderHook(() => useSubmitReleaseForReview(), { wrapper });

    await expect(
      result.current.mutateAsync({
        releaseId: 'release-123',
        reviewerIds: ['reviewer-1'],
      }),
    ).rejects.toThrow('RLS violation');
  });
});
