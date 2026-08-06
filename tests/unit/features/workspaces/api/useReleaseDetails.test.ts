import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReorderReleaseChanges } from '@/features/workspaces/api/useReleaseDetails';
import { supabase } from '@/shared/api/supabase';

vi.mock('@/shared/api/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const mockedSupabase = supabase as unknown as { from: vi.Mock; rpc: vi.Mock };

describe('useReorderReleaseChanges', () => {
  it('rolls back optimistic reorder when server request fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapperWithClient = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    queryClient.setQueryData(['release_changes', 'r1'], [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);

    mockedSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Server failure' } });

    const { result } = renderHook(() => useReorderReleaseChanges('r1'), { wrapper: wrapperWithClient });

    await expect(
      act(async () => {
        await result.current.mutateAsync([
          { id: 'b', position: 0 },
          { id: 'a', position: 1 },
        ]);
      })
    ).rejects.toThrow('Server failure');

    expect(queryClient.getQueryData(['release_changes', 'r1'])).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });
});
