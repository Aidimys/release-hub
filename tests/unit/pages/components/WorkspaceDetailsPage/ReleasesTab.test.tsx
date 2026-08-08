import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleasesTab } from '@/pages/components/WorkspaceDetailsPage/ReleasesTab';
import type { ReleasesTabProps } from '@/features/workspaces/hooks/useWorkspaceDetailsPage';

const baseProps: ReleasesTabProps = {
  filteredReleases: [
    {
      id: 'r1',
      version: '1.0.0',
      title: 'Release 1.0',
      status: 'draft',
      updated_at: '2026-08-01T00:00:00Z',
      planned_at: null,
      published_at: null,
      products: { id: 'p1', name: 'Test Product', workspace_id: 'w1' },
    },
  ],
  pagedReleases: [
    {
      id: 'r1',
      version: '1.0.0',
      title: 'Release 1.0',
      status: 'draft',
      updated_at: '2026-08-01T00:00:00Z',
      planned_at: null,
      published_at: null,
      products: { id: 'p1', name: 'Test Product', workspace_id: 'w1' },
    },
  ],
  totalPages: 1,
  safePage: 1,
  statusFilter: 'all',
  searchFilter: '',
  sortOrder: 'date-desc',
  updateParams: vi.fn(),
  permissions: {
    canDeleteRelease: true,
    canCancelPublishedRelease: true,
  },
  workspaceId: 'w1',
  handleDeleteRelease: vi.fn(),
  handleCancelPublishedRelease: vi.fn(),
  deleteRelease: { isPending: false },
  cancelPublishedRelease: { isPending: false },
};

describe('ReleasesTab', () => {
  it('renders release list items', () => {
    render(<ReleasesTab {...baseProps} />);
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Release 1.0')).toBeInTheDocument();
  });

  it('shows delete and cancel buttons for owner', () => {
    render(<ReleasesTab {...baseProps} />);
    expect(screen.getByText('Удалить')).toBeInTheDocument();
  });

  it('hides owner-only buttons for contributor', () => {
    render(
      <ReleasesTab
        {...baseProps}
        permissions={{
          canDeleteRelease: false,
          canCancelPublishedRelease: false,
        }}
      />,
    );
    expect(screen.queryByText('Удалить')).not.toBeInTheDocument();
    expect(screen.queryByText('Отменить публикацию')).not.toBeInTheDocument();
  });

  it('shows cancel button only for published release when permitted', () => {
    render(
      <ReleasesTab
        {...baseProps}
        pagedReleases={[
          {
            id: 'r1',
            version: '1.0.0',
            title: 'Release 1.0',
            status: 'published',
            updated_at: '2026-08-01T00:00:00Z',
            planned_at: null,
            published_at: '2026-08-01T00:00:00Z',
            products: { id: 'p1', name: 'Test Product', workspace_id: 'w1' },
          },
        ]}
        permissions={{
          canDeleteRelease: true,
          canCancelPublishedRelease: true,
        }}
      />,
    );
    expect(screen.getByText('Отменить публикацию')).toBeInTheDocument();
  });

  it('hides cancel button for contributor even on published release', () => {
    render(
      <ReleasesTab
        {...baseProps}
        pagedReleases={[
          {
            id: 'r1',
            version: '1.0.0',
            title: 'Release 1.0',
            status: 'published',
            updated_at: '2026-08-01T00:00:00Z',
            planned_at: null,
            published_at: '2026-08-01T00:00:00Z',
            products: { id: 'p1', name: 'Test Product', workspace_id: 'w1' },
          },
        ]}
        permissions={{
          canDeleteRelease: false,
          canCancelPublishedRelease: false,
        }}
      />,
    );
    expect(screen.queryByText('Удалить')).not.toBeInTheDocument();
    expect(screen.queryByText('Отменить публикацию')).not.toBeInTheDocument();
  });

  it('shows empty state when no releases match filters', () => {
    render(<ReleasesTab {...baseProps} filteredReleases={[]} pagedReleases={[]} />);
    expect(screen.getByText('По вашему запросу релизы не найдены')).toBeInTheDocument();
  });
});
