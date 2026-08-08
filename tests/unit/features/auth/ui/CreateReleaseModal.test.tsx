import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateReleaseModal } from '@/features/auth/ui/CreateReleaseModal';
import { useCreateRelease } from '@/features/workspaces/api/useCreateRelease';

vi.mock('@/features/workspaces/api/useCreateRelease', () => ({
  useCreateRelease: vi.fn(),
}));

const mockedUseCreateRelease = useCreateRelease as unknown as ReturnType<typeof vi.fn>;

describe('CreateReleaseModal', () => {
  it('validates required fields and submits form', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseCreateRelease.mockReturnValue({ mutateAsync });

    render(<CreateReleaseModal isOpen={true} onClose={vi.fn()} productId="p1" />);

    await userEvent.type(screen.getByPlaceholderText('1.2.0'), '1.0.0');
    await userEvent.type(screen.getByPlaceholderText('Новый релиз'), 'Release title');
    await userEvent.type(screen.getByPlaceholderText('Кратко опишите релиз'), 'Release description');
    await userEvent.click(screen.getByRole('button', { name: /Создать релиз/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      productId: 'p1',
      version: '1.0.0',
      title: 'Release title',
      description: 'Release description',
      status: 'draft',
      plannedAt: null,
    });
  });

  it('shows validation errors for empty required fields', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseCreateRelease.mockReturnValue({ mutateAsync });

    render(<CreateReleaseModal isOpen={true} onClose={vi.fn()} productId="p1" />);

    await userEvent.click(screen.getByRole('button', { name: /Создать релиз/i }));

    expect(await screen.findByText('Укажите версию релиза')).toBeInTheDocument();
    expect(await screen.findByText('Название должно быть не менее 2 символов')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
