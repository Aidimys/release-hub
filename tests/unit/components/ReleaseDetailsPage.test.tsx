import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleaseActionsSection } from '@/pages/components/ReleaseDetailsPage/ReleaseActionsSection';
import { ReviewersSection } from '@/pages/components/ReleaseDetailsPage/ReviewersSection';
import { CommentsSection } from '@/pages/components/ReleaseDetailsPage/CommentsSection';
import { ChangesList } from '@/pages/components/ReleaseDetailsPage/ChangesList';

describe('ReleaseActionsSection', () => {
  it('shows review button for owner in draft status', () => {
    render(
      <ReleaseActionsSection
        permissions={{ canSendForReview: true, canPublishRelease: true }}
        releaseStatus="draft"
        handleStatusChange={vi.fn()}
      />
    );

    expect(screen.getByText('Отправить на review')).toBeEnabled();
    expect(screen.getByText('Опубликовать')).toBeDisabled();
  });

  it('shows publish button for owner in approved status', () => {
    render(
      <ReleaseActionsSection
        permissions={{ canSendForReview: true, canPublishRelease: true }}
        releaseStatus="approved"
        handleStatusChange={vi.fn()}
      />
    );

    expect(screen.getByText('Отправить на review')).toBeDisabled();
    expect(screen.getByText('Опубликовать')).toBeEnabled();
  });

  it('hides actions when permissions are missing', () => {
    render(
      <ReleaseActionsSection
        permissions={{ canSendForReview: false, canPublishRelease: false }}
        releaseStatus="draft"
        handleStatusChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Отправить на review')).not.toBeInTheDocument();
    expect(screen.queryByText('Опубликовать')).not.toBeInTheDocument();
  });
});

describe('ReviewersSection', () => {
  const defaultProps = {
    reviewers: [
      { id: 'r1', user_id: 'user-1', decision: null, decided_at: null, profiles: { display_name: 'Alice' } },
    ],
    isReviewersLoading: false,
    pendingReviewerIds: [],
    setPendingReviewerIds: vi.fn(),
    permissions: { canApproveRelease: true },
    isPublished: false,
    workspaceMembers: [],
    user: { id: 'user-1' },
    handleVote: vi.fn(),
    isVotingClosed: false,
  };

  it('shows vote buttons in review status', () => {
    render(<ReviewersSection {...defaultProps} />);
    expect(screen.getByText('Проголосовать за')).toBeEnabled();
    expect(screen.getByText('Проголосовать против')).toBeEnabled();
  });

  it('disables vote buttons when voting is closed', () => {
    render(<ReviewersSection {...defaultProps} isVotingClosed={true} />);
    expect(screen.getByText('Проголосовать за')).toBeDisabled();
    expect(screen.getByText('Проголосовать против')).toBeDisabled();
  });
});

describe('CommentsSection', () => {
  const defaultProps = {
    comments: [
      {
        id: 'c1',
        content: 'Looks good',
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
        user_id: 'user-1',
        profiles: {
          display_name: 'Alice',
          avatar_url: 'https://example.com/avatar.png',
        },
      },
    ],
    isCommentsLoading: false,
    commentText: '',
    setCommentText: vi.fn(),
    user: { id: 'user-1' },
    editingCommentId: null,
    editingCommentText: '',
    setEditingCommentId: vi.fn(),
    setEditingCommentText: vi.fn(),
    handleCommentSubmit: vi.fn(),
    startEditComment: vi.fn(),
    saveEditComment: vi.fn(),
    handleDeleteComment: vi.fn(),
  };

  it('renders comment with author name and avatar', () => {
    render(<CommentsSection {...defaultProps} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Looks good')).toBeInTheDocument();
    const img = screen.getByAltText('Alice avatar');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('shows edit and delete buttons for own comment', () => {
    render(<CommentsSection {...defaultProps} />);
    expect(screen.getByText('Редактировать')).toBeInTheDocument();
    expect(screen.getByText('Удалить')).toBeInTheDocument();
  });
});

import type { Database } from '@/shared/api/database.types';

// ... rest of imports

describe('ChangesList', () => {
  const defaultProps = {
    orderedChanges: [
      {
        id: 'ch1',
        category: 'feature' as Database['public']['Enums']['change_category'],
        title: 'New feature',
        description: 'Added something',
        position: 0,
        created_by: 'user-1',
        authorName: 'Alice',
        updated_at: '2026-08-01T00:00:00Z',
      },
    ],
    isChangesLoading: false,
    isChangesError: false,
    changesError: null,
    draggedId: null,
    dropTargetId: null,
    setDraggedId: vi.fn(),
    setDropTargetId: vi.fn(),
    canReorderChanges: true,
    editingChangeId: null,
    editingChangeForm: { category: 'feature' as Database['public']['Enums']['change_category'], title: '', description: '' },
    setEditingChangeForm: vi.fn(),
    user: { id: 'user-1' },
    releaseStatus: 'draft' as const,
    handleDrop: vi.fn(),
    startEditChange: vi.fn(),
    saveEditChange: vi.fn(),
    handleDeleteChange: vi.fn(),
  };

  it('renders change with category and title', () => {
    render(<ChangesList {...defaultProps} />);
    expect(screen.getByText('New feature')).toBeInTheDocument();
    expect(screen.getByText('Added something')).toBeInTheDocument();
    expect(screen.getByText('feature')).toHaveClass('text-indigo-600');
  });

  it('shows edit and delete buttons for owner in draft', () => {
    render(<ChangesList {...defaultProps} />);
    expect(screen.getByText('Редактировать')).toBeInTheDocument();
    expect(screen.getByText('Удалить')).toBeInTheDocument();
  });

  it('hides edit and delete buttons for published release', () => {
    render(<ChangesList {...defaultProps} releaseStatus="published" />);
    expect(screen.queryByText('Редактировать')).not.toBeInTheDocument();
    expect(screen.queryByText('Удалить')).not.toBeInTheDocument();
  });
});
