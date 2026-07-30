import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import {
  useCreateReleaseChange,
  useCreateReleaseComment,
  useReleaseActivity,
  useReleaseChanges,
  useReleaseComments,
  useReleaseDetails,
  useReleaseReviewers,
  useReorderReleaseChanges,
} from '../features/workspaces/api/useReleaseDetails';
import { supabase } from '../shared/api/supabase';
import { useReleaseRealtime } from '../shared/api/useSupabaseRealtime';

const createReleaseChangeSchema = z.object({
  category: z.enum(['feature', 'improvement', 'bugfix', 'security', 'breaking']),
  title: z.string().min(2, 'Название должно быть не менее 2 символов'),
  description: z.string().min(2, 'Описание должно быть не менее 2 символов'),
});

type FormData = z.infer<typeof createReleaseChangeSchema>;

interface ReleaseChangeItem {
  id: string;
  category: string;
  title: string;
  description: string;
  position: number;
}

export const ReleaseDetailsPage = () => {
  const { workspaceId, releaseId } = useParams<{ workspaceId: string; releaseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [localReleaseStatus, setLocalReleaseStatus] = useState<'draft' | 'review' | 'approved' | 'rejected' | 'published' | null>(null);

  const resolvedWorkspaceId = workspaceId ?? '';
  const resolvedReleaseId = releaseId ?? '';

  const { data: release, isLoading: isReleaseLoading, isError: isReleaseError, error: releaseError } = useReleaseDetails(resolvedReleaseId);
  const { data: changes, isLoading: isChangesLoading, isError: isChangesError, error: changesError } = useReleaseChanges(resolvedReleaseId);
  const { data: reviewers, isLoading: isReviewersLoading } = useReleaseReviewers(resolvedReleaseId);
  const { data: comments, isLoading: isCommentsLoading } = useReleaseComments(resolvedReleaseId);
  const { data: activity, isLoading: isActivityLoading } = useReleaseActivity(resolvedReleaseId);
  const createReleaseChange = useCreateReleaseChange(resolvedReleaseId);
  const createReleaseComment = useCreateReleaseComment(resolvedReleaseId);
  const reorderReleaseChanges = useReorderReleaseChanges(resolvedReleaseId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(createReleaseChangeSchema),
    defaultValues: {
      category: 'feature',
    },
  });

  const orderedChanges = useMemo(() => {
    if (!changes) return [] as ReleaseChangeItem[];
    return [...changes].sort((a, b) => a.position - b.position);
  }, [changes]);

  const releaseStatus = localReleaseStatus ?? release?.status ?? 'draft';
  const isVotingClosed = releaseStatus !== 'review';
  const hasRejectVote = reviewers?.some((reviewer) => reviewer.decision === 'rejected');

  useReleaseRealtime(resolvedReleaseId, resolvedWorkspaceId);

  const onSubmit = async (data: FormData) => {
    setErrorText(null);

    try {
      await createReleaseChange.mutateAsync({
        releaseId: resolvedReleaseId,
        category: data.category,
        title: data.title.trim(),
        description: data.description.trim(),
        position: orderedChanges.length,
        createdBy: user?.id ?? null,
      });
      reset();
    } catch (err: any) {
      setErrorText(err.message || 'Не удалось создать изменение');
    }
  };

  const handleStatusChange = async (nextStatus: 'draft' | 'review' | 'approved' | 'rejected' | 'published') => {
    setErrorText(null);

    const allowedTransitions: Record<'draft' | 'review' | 'approved' | 'rejected' | 'published', Array<'draft' | 'review' | 'approved' | 'rejected' | 'published'>> = {
      draft: ['review'],
      review: ['approved', 'rejected'],
      approved: ['published'],
      rejected: ['review'],
      published: ['published'],
    };

    if (!allowedTransitions[releaseStatus as keyof typeof allowedTransitions]?.includes(nextStatus)) {
      setErrorText('Статус можно менять только по цепочке draft → review → approved → published');
      return;
    }

    if (!user?.id) {
      setErrorText('Сначала нужно авторизоваться');
      return;
    }

    if (nextStatus === 'approved' && reviewers?.some((reviewer) => reviewer.decision === 'rejected')) {
      setErrorText('Нельзя подтвердить релиз: есть голос против. Сначала отклоните или пересмотрите решение.');
      return;
    }

    try {
      const { error } = await supabase
        .from('releases')
        .update({ status: nextStatus })
        .eq('id', resolvedReleaseId);

      if (error) throw new Error(error.message);

      setLocalReleaseStatus(nextStatus);
      const publishedAt = nextStatus === 'published' ? new Date().toISOString() : null;
      await supabase
        .from('releases')
        .update({ published_at: publishedAt })
        .eq('id', resolvedReleaseId);
      await supabase.from('activity_events').insert({
        workspace_id: resolvedWorkspaceId,
        release_id: resolvedReleaseId,
        actor_id: user.id,
        event_type: 'status_changed',
        payload: { from: releaseStatus, to: nextStatus, message: `Статус изменён с ${releaseStatus} на ${nextStatus}` },
      } as any);
      await queryClient.invalidateQueries({ queryKey: ['release', resolvedReleaseId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace_releases', resolvedWorkspaceId] });
    } catch (err: any) {
      setErrorText(err.message || 'Не удалось сменить статус релиза');
    }
  };

  const handleCommentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commentText.trim()) return;

    setErrorText(null);

    try {
      await createReleaseComment.mutateAsync({
        releaseId: resolvedReleaseId,
        content: commentText.trim(),
        userId: user?.id ?? null,
      });
      await supabase.from('activity_events').insert({
        workspace_id: resolvedWorkspaceId,
        release_id: resolvedReleaseId,
        actor_id: user?.id ?? null,
        event_type: 'comment_added',
        payload: { message: 'Добавлен комментарий' },
      } as any);
      setCommentText('');
    } catch (err: any) {
      setErrorText(err.message || 'Не удалось отправить комментарий');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setErrorText(null);

    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: ['release_comments', resolvedReleaseId] });
      await queryClient.invalidateQueries({ queryKey: ['release_activity', resolvedReleaseId] });
    } catch (err: any) {
      setErrorText(err.message || 'Не удалось удалить комментарий');
    }
  };

  const handleVote = async (decision: 'approved' | 'rejected') => {
    if (!user?.id) return;
    if (releaseStatus !== 'review') {
      setErrorText('Голосование доступно только в статусе review');
      return;
    }

    setErrorText(null);

    try {
      const { error } = await supabase
        .from('release_reviewers')
        .upsert({
          release_id: resolvedReleaseId,
          user_id: user.id,
          decision,
          decided_at: new Date().toISOString(),
        }, { onConflict: 'release_id,user_id' } as any);

      if (error) throw new Error(error.message);
      await supabase.from('activity_events').insert({
        workspace_id: resolvedWorkspaceId,
        release_id: resolvedReleaseId,
        actor_id: user.id,
        event_type: 'vote_submitted',
        payload: { decision, message: `Пользователь проголосовал ${decision === 'approved' ? 'за' : 'против'}` },
      } as any);
      await queryClient.invalidateQueries({ queryKey: ['release_reviewers', resolvedReleaseId] });
      await queryClient.invalidateQueries({ queryKey: ['release_activity', resolvedReleaseId] });
    } catch (err: any) {
      setErrorText(err.message || 'Не удалось сохранить голос');
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId || !orderedChanges.length) return;

    const fromIndex = orderedChanges.findIndex((item) => item.id === draggedId);
    const toIndex = orderedChanges.findIndex((item) => item.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...orderedChanges];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    const reorderedItems = next.map((item, index) => ({ id: item.id, position: index }));

    try {
      await reorderReleaseChanges.mutateAsync(reorderedItems);
    } catch (err) {
      setErrorText('Не удалось сохранить порядок изменений');
    } finally {
      setDraggedId(null);
      setDropTargetId(null);
    }
  };

  const BackHeader = () => (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <button
          onClick={() => navigate(`/workspaces/${resolvedWorkspaceId}`)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 transition"
        >
          ← Назад к пространству
        </button>
      </div>
    </header>
  );

  if (isAuthLoading || !resolvedWorkspaceId || !resolvedReleaseId || isReleaseLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader />
        <div className="p-8 text-center text-gray-500 font-medium">Загрузка релиза...</div>
      </div>
    );
  }

  if (isReleaseError || !release) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1">Ошибка загрузки релиза</h2>
            <p className="text-sm mb-3">Релиз не найден или у вас нет доступа.</p>
            {releaseError && (
              <div className="text-xs bg-red-100/80 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                Детали: {(releaseError as Error).message}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BackHeader />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Release</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{release.title}</h1>
              <p className="text-sm text-gray-500 mt-2">Версия: {release.version}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                <span className="rounded-full bg-gray-100 px-3 py-1">Продукт: {release.products?.name ?? 'Неизвестен'}</span>
                <span className="rounded-full bg-gray-100 px-3 py-1">Планируется: {release.planned_at ? new Date(release.planned_at).toLocaleDateString('ru-RU') : 'Не указана'}</span>
                <span className="rounded-full bg-gray-100 px-3 py-1">Опубликовано: {release.published_at ? new Date(release.published_at).toLocaleDateString('ru-RU') : 'Не опубликовано'}</span>
              </div>
              {release.description && <p className="text-sm text-gray-600 mt-3">{release.description}</p>}
            </div>
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex flex-col gap-2">
              <div>Статус: <span className="font-semibold text-gray-700">{releaseStatus}</span></div>
              <div className="text-xs text-gray-500">Изменения статуса выполняются через кнопки ниже.</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Согласование и голосование</h2>
              <span className="text-sm text-gray-500">{reviewers?.length ? `${reviewers.length} участника` : 'Нет данных'}</span>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => handleVote('approved')} disabled={isVotingClosed} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Проголосовать за</button>
              <button onClick={() => handleVote('rejected')} disabled={isVotingClosed} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Проголосовать против</button>
            </div>
            {isReviewersLoading ? (
              <div className="h-16 bg-gray-200 animate-pulse rounded-xl" />
            ) : reviewers && reviewers.length > 0 ? (
              <div className="space-y-3">
                {reviewers.map((reviewer: any) => (
                  <div key={reviewer.id} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">{reviewer.profiles?.display_name ?? 'Участник'}</div>
                      <span className="px-2 py-1 rounded-full text-[11px] font-semibold uppercase bg-gray-100 text-gray-700">
                        {reviewer.decision ?? 'pending'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {reviewer.decided_at ? `Решение принято: ${new Date(reviewer.decided_at).toLocaleString('ru-RU')}` : 'Ожидает решения'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">К этому релизу пока не назначены ревьюеры.</div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Доступные действия</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleStatusChange('review')} disabled={releaseStatus !== 'draft'} className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-50">Отправить на review</button>
              <button onClick={() => handleStatusChange('approved')} disabled={releaseStatus !== 'review' || hasRejectVote} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Подтвердить</button>
              <button onClick={() => handleStatusChange('published')} disabled={releaseStatus !== 'approved'} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Опубликовать</button>
            </div>
            <p className="text-sm text-gray-500 mt-4">Действия меняют статус релиза и отражаются в карточке сверху.</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Добавить изменение</h2>

          {errorText && (
            <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">{errorText}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                <select
                  {...register('category')}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
                >
                  <option value="feature">Feature</option>
                  <option value="improvement">Improvement</option>
                  <option value="bugfix">Bugfix</option>
                  <option value="security">Security</option>
                  <option value="breaking">Breaking</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                <input
                  type="text"
                  {...register('title')}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
                />
                {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
              <textarea
                {...register('description')}
                disabled={isSubmitting}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
              />
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Сохранение...' : 'Добавить изменение'}
              </button>
            </div>
          </form>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Изменения релиза</h2>
              <p className="text-sm text-gray-500">Если нужно, можно переставить элементы вручную — это влияет только на порядок отображения.</p>
            </div>

          {isChangesLoading ? (
            <div className="h-24 bg-gray-200 animate-pulse rounded-xl" />
          ) : isChangesError ? (
            <div className="text-center py-8 bg-red-50 rounded-xl border border-red-200 text-red-700">
              Ошибка загрузки изменений.
              {changesError && (
                <div className="mt-2 text-xs bg-red-100 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                  {(changesError as Error).message}
                </div>
              )}
            </div>
          ) : orderedChanges.length > 0 ? (
            <div className="space-y-3">
              {orderedChanges.map((change) => {
                const isDragging = draggedId === change.id;
                const isDropTarget = dropTargetId === change.id;

                return (
                  <div
                    key={change.id}
                    draggable
                    onDragStart={() => {
                      setDraggedId(change.id);
                      setDropTargetId(change.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropTargetId(change.id);
                    }}
                    onDragLeave={() => {
                      if (dropTargetId === change.id) {
                        setDropTargetId(null);
                      }
                    }}
                    onDrop={() => handleDrop(change.id)}
                    className={`border rounded-xl p-4 transition-all ${
                      isDragging
                        ? 'border-indigo-500 bg-indigo-50 shadow-md opacity-70'
                        : isDropTarget
                          ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                          : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{change.category}</span>
                          <span className="text-sm font-semibold text-gray-900">{change.title}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">{change.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">#{change.position + 1}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
              Для этого релиза ещё нет изменений
            </div>
          )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Комментарии</h2>
              <form onSubmit={handleCommentSubmit} className="space-y-3">
                <textarea
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  rows={4}
                  placeholder="Добавьте комментарий по релизу"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
                <button type="submit" className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white">
                  Отправить
                </button>
              </form>
              {isCommentsLoading ? (
                <div className="h-16 bg-gray-200 animate-pulse rounded-xl mt-4" />
              ) : comments && comments.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {comments.map((comment: any) => (
                    <div key={comment.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between text-sm text-gray-700">
                        <span className="font-medium">{comment.profiles?.display_name ?? 'Пользователь'}</span>
                        <span>{new Date(comment.created_at).toLocaleString('ru-RU')}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">{comment.content}</p>
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="mt-2 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Удалить комментарий
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-4">Комментариев пока нет.</p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Журнал действий</h2>
              {isActivityLoading ? (
                <div className="h-16 bg-gray-200 animate-pulse rounded-xl" />
              ) : activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.map((item: any) => {
                    const payload = item.payload ?? {};
                    const message = payload.message ?? `${item.event_type}`;
                    return (
                      <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                        <div className="text-sm font-medium text-gray-900">{message}</div>
                        <div className="text-xs text-gray-500 mt-1">{new Date(item.created_at).toLocaleString('ru-RU')}</div>
                        {payload.from && payload.to && (
                          <div className="text-xs text-gray-500 mt-1">{payload.from} → {payload.to}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Событий ещё нет.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
