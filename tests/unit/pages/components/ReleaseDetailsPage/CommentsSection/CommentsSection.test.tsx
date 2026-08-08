import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommentsSection } from '@/pages/components/ReleaseDetailsPage/CommentsSection';

const baseProps = {
  comments: [
    {
      id: 'c1',
      content: 'Looks good!',
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-01T10:00:00Z',
      user_id: 'u1',
      profiles: {
        display_name: 'Alice Author',
        avatar_url: 'https://example.com/avatar.png',
      },
    },
  ],
  isCommentsLoading: false,
  commentText: '',
  setCommentText: vi.fn(),
  user: { id: 'u1' },
  editingCommentId: null,
  editingCommentText: '',
  setEditingCommentId: vi.fn(),
  setEditingCommentText: vi.fn(),
  handleCommentSubmit: vi.fn(),
  startEditComment: vi.fn(),
  saveEditComment: vi.fn(),
  handleDeleteComment: vi.fn(),
};

describe('CommentsSection', () => {
  it('renders comment author display name', () => {
    render(<CommentsSection {...baseProps} />);
    expect(screen.getByText('Alice Author')).toBeInTheDocument();
  });

  it('renders comment author avatar when present', () => {
    render(<CommentsSection {...baseProps} />);
    const img = screen.getByAltText('Alice Author avatar');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('falls back to placeholder when avatar is missing', () => {
    render(
      <CommentsSection
        {...baseProps}
        comments={[
          {
            id: 'c1',
            content: 'No avatar',
            created_at: '2026-08-01T10:00:00Z',
            updated_at: '2026-08-01T10:00:00Z',
            user_id: 'u1',
            profiles: {
              display_name: 'Bob',
              avatar_url: null,
            },
          },
        ]}
      />,
    );
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByAltText('Bob avatar')).not.toBeInTheDocument();
    const placeholder = document.querySelector('.h-8.w-8.rounded-full.bg-gray-200');
    expect(placeholder).toBeInTheDocument();
  });

  it('shows generic "Пользователь" when display_name is missing', () => {
    render(
      <CommentsSection
        {...baseProps}
        comments={[
          {
            id: 'c1',
            content: 'Anonymous',
            created_at: '2026-08-01T10:00:00Z',
            updated_at: '2026-08-01T10:00:00Z',
            user_id: 'u1',
            profiles: {
              display_name: null,
              avatar_url: null,
            },
          },
        ]}
      />,
    );
    expect(screen.getByText('Пользователь')).toBeInTheDocument();
  });

  it('shows edit and delete buttons for comment owner', () => {
    render(<CommentsSection {...baseProps} />);
    expect(screen.getByText('Редактировать')).toBeInTheDocument();
    expect(screen.getByText('Удалить')).toBeInTheDocument();
  });

  it('hides edit and delete buttons for non-owner', () => {
    render(
      <CommentsSection
        {...baseProps}
        user={{ id: 'u2' }}
      />,
    );
    expect(screen.queryByText('Редактировать')).not.toBeInTheDocument();
    expect(screen.queryByText('Удалить')).not.toBeInTheDocument();
  });

  it('shows empty state when no comments exist', () => {
    render(<CommentsSection {...baseProps} comments={[]} />);
    expect(screen.getByText('Комментариев пока нет.')).toBeInTheDocument();
  });

  it('renders loading skeleton when loading', () => {
    render(<CommentsSection {...baseProps} isCommentsLoading={true} comments={[]} />);
    expect(screen.queryByText('Комментариев пока нет.')).not.toBeInTheDocument();
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });
});
