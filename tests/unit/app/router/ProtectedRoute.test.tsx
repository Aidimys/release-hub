import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { useAuth } from '@/app/providers/AuthProvider';

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to login', () => {
    mockedUseAuth.mockReturnValue({ session: null, user: null, isLoading: false, signOut: async () => {} });

    render(
      <MemoryRouter initialEntries={['/workspaces']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/workspaces" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders protected content when authenticated', () => {
    mockedUseAuth.mockReturnValue({
      session: { user: { id: 'u1', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2024-01-01T00:00:00Z' }, access_token: 'token', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer' },
      user: { id: 'u1', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2024-01-01T00:00:00Z' },
      isLoading: false,
      signOut: async () => {},
    });

    render(
      <MemoryRouter initialEntries={['/workspaces']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/workspaces" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
