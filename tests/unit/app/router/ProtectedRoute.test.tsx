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
    mockedUseAuth.mockReturnValue({ session: null, isLoading: false });

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
      session: { user: { id: 'u1' } } as { user: { id: string } },
      isLoading: false,
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
