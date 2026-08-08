import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from '@/features/workspaces/api/usePermissions';
import { useAuth } from '@/app/providers/AuthProvider';

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe('usePermissions RLS isolation between workspaces', () => {
  it('treats a user as contributor when not a member of the workspace', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' } } as any);
    const { result } = renderHook(() =>
      usePermissions([{ user_id: 'u2', role: 'owner' }]),
    );
    expect(result.current.role).toBe('contributor');
    expect(result.current.canDeleteRelease).toBe(false);
    expect(result.current.canEditRelease).toBe(false);
  });

  it('grants owner privileges only for the user in the owner workspace member record', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u1' } } as any);
    const { result } = renderHook(() =>
      usePermissions([{ user_id: 'u1', role: 'owner' }]),
    );
    expect(result.current.role).toBe('owner');
    expect(result.current.canDeleteRelease).toBe(true);
    expect(result.current.canCancelPublishedRelease).toBe(true);
    expect(result.current.canManageMembers).toBe(true);
  });

  it('does not grant owner privileges when another user is owner', () => {
    mockedUseAuth.mockReturnValue({ user: { id: 'u2' } } as any);
    const { result } = renderHook(() =>
      usePermissions([{ user_id: 'u1', role: 'owner' }]),
    );
    expect(result.current.role).toBe('contributor');
    expect(result.current.canDeleteRelease).toBe(false);
  });
});
