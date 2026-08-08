import { describe, expect, it, vi } from 'vitest';
import { usePermissions } from '@/features/workspaces/api/usePermissions';
import { renderHook } from '@testing-library/react';
import { useAuth } from '@/app/providers/AuthProvider';

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

const renderPermissions = (members?: Array<{ user_id: string | null; role: string }>, userId?: string | null) => {
  mockedUseAuth.mockReturnValue({ user: userId ? { id: userId } : null } as any);
  return renderHook(() => usePermissions(members));
};

describe('usePermissions', () => {
  it('returns owner privileges for owner role', () => {
    const { result } = renderPermissions([{ user_id: 'u1', role: 'owner' }], 'u1');
    expect(result.current.role).toBe('owner');
    expect(result.current.canCreateRelease).toBe(true);
    expect(result.current.canAssignRoles).toBe(true);
  });

  it('returns maintainer privileges for maintainer role', () => {
    const { result } = renderPermissions([{ user_id: 'u1', role: 'maintainer' }], 'u1');
    expect(result.current.role).toBe('maintainer');
    expect(result.current.canCreateRelease).toBe(true);
    expect(result.current.canAssignRoles).toBe(false);
  });

  it('treats unknown or missing member as contributor', () => {
    const { result } = renderPermissions([{ user_id: 'u2', role: 'owner' }], 'u1');
    expect(result.current.role).toBe('contributor');
    expect(result.current.canCreateRelease).toBe(false);
    expect(result.current.canAddComment).toBe(true);
  });
});
