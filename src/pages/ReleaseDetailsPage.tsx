import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { usePermissions } from '../features/workspaces/api/usePermissions';
import { useCancelPublishedRelease, useDeleteRelease, useWorkspaceMembers } from '../features/workspaces/api/useWorkspaceDetails';
import { canTransitionToStatus, validateReleaseForReview } from '../features/workspaces/utils/releaseWorkflow';
import {
  useCreateReleaseChange,
  useCreateReleaseComment,
  useReleaseActivity,
  useReleaseChanges,
  useReleaseComments,
  useReleaseDetails,
  useReleaseReviewers,
  useReorderReleaseChanges,
  useSubmitReleaseForReview,
  useCastReleaseVote,
  usePublishRelease,
  useReturnRejectedReleaseToDraft,
  useUpdateReleaseChange,
  useUpdateReleaseComment,
} from '../features/workspaces/api/useReleaseDetails';
import { supabase } from '../shared/api/supabase';
import { useReleaseRealtime } from '../shared/api/useSupabaseRealtime';
import { realtimeDedup } from '../shared/api/realtimeDedup';

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
  created_by: string | null;
  updated_at?: string | null;
  authorName?: string | null;
}

interface ReleaseReviewerItem {
  id: string;
  user_id?: string | null;
  decision?: string | null;
  decided_at?: string | null;
  profiles?: {
    display_name?: string | null;
  } | null;
}

interface ReleaseCommentItem {
  id: string;
  content?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user_id?: string | null;
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface ReleaseActivityItem {
  id: string;
  event_type?: string | null;
  created_at?: string | null;
  payload?: unknown;
  profiles?: {
    display_name?: string | null;
  } | null;
  releases?: {
    title?: string | null;
    version?: string | null;
    products?: {
      name?: string | null;
    } | null;
  } | null;
}

interface ReleaseRecord {
  id?: string;
  status?: string | null;
  published_at?: string | null;
  products?: {
    id?: string;
    name?: string | null;
    slug?: string | null;
  } | null;
  title?: string | null;
  version?: string | null;
  description?: string | null;
  planned_at?: string | null;
  [key: string]: unknown;
}

interface ReleaseListItem {
  id?: string;
  status?: string | null;
  published_at?: string | null;
  [key: string]: unknown;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Неизвестная ошибка';
};

const BackHeader = ({ onBack, label }: { onBack: () => void; label: string }) => (
  <header className="bg-white border-b border-gray-200">
    <div className="max-w-6xl mx-auto px-4 py-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 transition"
      >
        ← {label}
      </button>
    </div>
  </header>
);

export const ReleaseDetailsPage = () => {
  const { workspaceId, releaseId } = useParams<{ workspaceId: string; releaseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isActivityCollapsed, setIsActivityCollapsed] = useState(false);
  const [pendingReviewerIds, setPendingReviewerIds] = useState<string[]>([]);
  const [editingChangeId, setEditingChangeId] = useState<string | null>(null);
  const [editingChangeForm, setEditingChangeForm] = useState<{ category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking'; title: string; description: string }>({ category: 'feature', title: '', description: '' });
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [optimisticReleaseStatus, setOptimisticReleaseStatus] = useState<'draft' | 'review' | 'approved' | 'rejected' | 'published' | null>(null);

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
  const submitForReview = useSubmitReleaseForReview();
  const castVote = useCastReleaseVote();
  const publishRelease = usePublishRelease();
  const returnToDraft = useReturnRejectedReleaseToDraft();
  const updateReleaseChange = useUpdateReleaseChange(resolvedReleaseId);
  const updateReleaseComment = useUpdateReleaseComment(resolvedReleaseId);

  const { data: workspaceMembers } = useWorkspaceMembers(resolvedWorkspaceId);
  const permissions = usePermissions(workspaceMembers);
  const deleteRelease = useDeleteRelease(resolvedWorkspaceId);
  const cancelPublishedRelease = useCancelPublishedRelease(resolvedWorkspaceId);

  const releaseStatus = optimisticReleaseStatus ?? release?.status ?? 'draft';
  const isReleaseDeleted = Boolean(queryClient.getQueryData(['release_deleted', resolvedReleaseId]));
  const isVotingClosed = releaseStatus !== 'review';
  const canReorderChanges = releaseStatus === 'draft' && permissions.canEditChange;
  const isPublished = releaseStatus === 'published';

  const updateReleaseListCache = (queryKey: readonly unknown[], nextStatus: string, nextPublishedAt: string | null) => {
    queryClient.setQueryData(queryKey, (current: ReleaseListItem[] | undefined) => {
      if (!current) return current;

      return current.map((item) => {
        if (item.id !== resolvedReleaseId) return item;
        return {
          ...item,
          status: nextStatus,
          published_at: nextPublishedAt,
        };
      });
    });
  };

  const resetReviewersState = async () => {
    queryClient.setQueryData(['release_reviewers', resolvedReleaseId], (current: ReleaseReviewerItem[] | undefined) => {
      if (!current) return current;
      return current.map((reviewer) => ({
        ...reviewer,
        decision: null,
        decided_at: null,
      }));
    });

    await queryClient.invalidateQueries({ queryKey: ['release_reviewers', resolvedReleaseId] });
    await queryClient.refetchQueries({ queryKey: ['release_reviewers', resolvedReleaseId] });
  };

  useReleaseRealtime(resolvedReleaseId, resolvedWorkspaceId);

  useEffect(() => {
    if (release?.id) {
      queryClient.setQueryData(['release_deleted', resolvedReleaseId], false);
    }
  }, [queryClient, release?.id, resolvedReleaseId]);

  const orderedChanges = useMemo(() => {
    if (!changes) return [] as ReleaseChangeItem[];
    return [...changes].sort((a, b) => a.position - b.position);
  }, [changes]);
  
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

  const onSubmit = async (data: FormData) => {
    setErrorText(null);

    if (!permissions.canAddChange) {
      setErrorText('У вас нет прав добавлять изменения');
      return;
    }

    try {
      await createReleaseChange.mutateAsync({
        releaseId: resolvedReleaseId,
        category: data.category,
        title: data.title.trim(),
        description: data.description.trim(),
        position: orderedChanges.length,
        createdBy: user?.id ?? null,
      });

      if (user?.id) {
        await supabase.from('activity_events').insert({
          workspace_id: resolvedWorkspaceId,
          release_id: resolvedReleaseId,
          actor_id: user.id,
          event_type: 'change_added',
          payload: { message: 'Добавлено изменение' },
        });
      }

      if (releaseStatus === 'rejected') {
        await handleStatusChange('draft', { skipPermissionCheck: true });
      }

      reset();
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось создать изменение');
    }
  };

  const handleStatusChange = async (
    nextStatus: 'draft' | 'review' | 'approved' | 'rejected' | 'published',
    options?: { skipPermissionCheck?: boolean }
  ) => {
    setErrorText(null);

    if (!options?.skipPermissionCheck) {
      await queryClient.refetchQueries({ queryKey: ['workspace_members', resolvedWorkspaceId] });
      const freshMembers = queryClient.getQueryData<Array<{ user_id: string | null; role: string }>>(['workspace_members', resolvedWorkspaceId]);
      const myRole = freshMembers?.find((m) => m.user_id === user?.id)?.role ?? 'contributor';
      if (myRole !== 'owner' && myRole !== 'maintainer') {
        setErrorText('У вас нет прав изменять статус релиза');
        return;
      }
    }

    if (!canTransitionToStatus(releaseStatus as 'draft' | 'review' | 'approved' | 'rejected' | 'published', nextStatus)) {
      setErrorText('Статус можно менять только по цепочке draft → review → approved → published');
      return;
    }

    if (!user?.id) {
      setErrorText('Сначала нужно авторизоваться');
      return;
    }

    if (nextStatus === 'review') {
      const existingIds = (reviewers ?? []).map((r) => r.user_id).filter((id): id is string => !!id);
      const combinedReviewerIds = [...new Set([...existingIds, ...pendingReviewerIds])];
      const validation = validateReleaseForReview({
        title: release?.title,
        version: release?.version,
        changes,
        reviewers: combinedReviewerIds.map((id) => ({ user_id: id })),
      });

      if (!validation.isValid) {
        setErrorText(validation.errors.join(' • '));
        return;
      }
    }

    const previousStatus = release?.status ?? 'draft';
    const previousPublishedAt = release?.published_at ?? null;
    const publishedAt = nextStatus === 'published' ? new Date().toISOString() : null;
    const productId = typeof release?.products?.id === 'string' ? release.products.id : undefined;
    const updatedAt = release?.updated_at ?? null;

    const rollbackOptimistic = () => {
      queryClient.setQueryData(['release', resolvedReleaseId], (current: ReleaseRecord | undefined) => {
        if (!current) return current;
        return {
          ...current,
          status: previousStatus,
          published_at: previousPublishedAt,
        };
      });
      if (resolvedWorkspaceId) {
        updateReleaseListCache(['workspace_releases', resolvedWorkspaceId], previousStatus, previousPublishedAt);
      }
      if (productId) {
        updateReleaseListCache(['product_releases', productId], previousStatus, previousPublishedAt);
      }
      setOptimisticReleaseStatus(null);
    };

    queryClient.setQueryData(['release', resolvedReleaseId], (current: ReleaseRecord | undefined) => {
      if (!current) return current;
      return {
        ...current,
        status: nextStatus,
        published_at: publishedAt,
      };
    });
    setOptimisticReleaseStatus(nextStatus);
    realtimeDedup.markOwn('releases', resolvedReleaseId, nextStatus);

    if (resolvedWorkspaceId) {
      updateReleaseListCache(['workspace_releases', resolvedWorkspaceId], nextStatus, publishedAt);
    }
    if (productId) {
      updateReleaseListCache(['product_releases', productId], nextStatus, publishedAt);
    }

    try {
      switch (nextStatus) {
        case 'review': {
          const existingIds = (reviewers ?? []).map((r) => r.user_id).filter((id): id is string => !!id);
          const reviewerIds = [...new Set([...existingIds, ...pendingReviewerIds])];
          await submitForReview.mutateAsync({ releaseId: resolvedReleaseId, reviewerIds, expectedUpdatedAt: updatedAt });
          setPendingReviewerIds([]);
          break;
        }
        case 'approved': {
          const result = await castVote.mutateAsync({ releaseId: resolvedReleaseId, decision: 'approved', expectedUpdatedAt: updatedAt });
          if (result) {
            setOptimisticReleaseStatus(result as 'draft' | 'review' | 'approved' | 'rejected' | 'published');
          }
          break;
        }
        case 'published': {
          await publishRelease.mutateAsync({ releaseId: resolvedReleaseId, expectedUpdatedAt: updatedAt });
          break;
        }
        case 'draft': {
          if (previousStatus === 'rejected') {
            await returnToDraft.mutateAsync({ releaseId: resolvedReleaseId, expectedUpdatedAt: updatedAt });
          }
          break;
        }
        default:
          break;
      }

      if (nextStatus === 'draft') {
        await resetReviewersState();
      }

      setErrorText(null);
      await queryClient.invalidateQueries({ queryKey: ['release', resolvedReleaseId] });
      await queryClient.refetchQueries({ queryKey: ['release', resolvedReleaseId] });
      if (resolvedWorkspaceId) {
        await queryClient.invalidateQueries({ queryKey: ['workspace_releases', resolvedWorkspaceId] });
        await queryClient.refetchQueries({ queryKey: ['workspace_releases', resolvedWorkspaceId] });
      }
      if (productId) {
        await queryClient.invalidateQueries({ queryKey: ['product_releases', productId] });
        await queryClient.refetchQueries({ queryKey: ['product_releases', productId] });
      }
      setOptimisticReleaseStatus(null);
    } catch (error: unknown) {
      rollbackOptimistic();
      setErrorText(getErrorMessage(error) || 'Не удалось сменить статус релиза');
    }
  };

  const handleDeleteRelease = async () => {
    if (!window.confirm('Удалить релиз?')) return;

    try {
      await deleteRelease.mutateAsync(resolvedReleaseId);
      navigate(backTarget);
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось удалить релиз');
    }
  };

  const handleCancelPublishedRelease = async () => {
    if (!window.confirm('Отменить публикацию релиза?')) return;

    try {
      await cancelPublishedRelease.mutateAsync({
        releaseId: resolvedReleaseId,
        expectedUpdatedAt: release?.updated_at ?? null,
        productId: release?.products?.id ?? undefined,
      });
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось отменить публикацию релиза');
    }
  };

  const handleCommentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commentText.trim()) return;

    if (!permissions.canAddComment) {
      setErrorText('У вас нет прав добавлять комментарии');
      return;
    }

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
        actor_id: user?.id ?? '',
        event_type: 'comment_added',
        payload: { message: 'Добавлен комментарий' },
      });
      setCommentText('');
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось отправить комментарий');
    }
  };

  const handleDeleteComment = async (commentId: string, commentUserId: string) => {
    setErrorText(null);

    if (commentUserId !== user?.id && !permissions.canDeleteOwnComment) {
      setErrorText('У вас нет прав удалять чужие комментарии');
      return;
    }

    if (commentUserId !== user?.id) {
      setErrorText('Вы можете удалять только свои комментарии');
      return;
    }

    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: ['release_comments', resolvedReleaseId] });
      await queryClient.invalidateQueries({ queryKey: ['release_activity', resolvedReleaseId] });
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось удалить комментарий');
    }
  };

  const startEditComment = (comment: { id: string; content?: string | null }) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.content ?? '');
  };

  const saveEditComment = async () => {
    if (!editingCommentId) return;
    setErrorText(null);

    try {
      const comment = comments?.find((c) => c.id === editingCommentId);
      await updateReleaseComment.mutateAsync({
        commentId: editingCommentId,
        content: editingCommentText.trim(),
        expectedUpdatedAt: comment?.updated_at ?? null,
      });
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось сохранить комментарий');
    }
  };

  const handleVote = async (decision: 'approved' | 'rejected') => {
    if (!user?.id) return;
    if (releaseStatus !== 'review') {
      setErrorText('Голосование доступно только в статусе review');
      return;
    }

    const currentReviewer = reviewers?.find((reviewer) => reviewer.user_id === user.id);
    if (!currentReviewer) {
      setErrorText('Вы должны быть назначены согласующим, чтобы голосовать');
      return;
    }

    setErrorText(null);

    try {
      const newStatus = await castVote.mutateAsync({
        releaseId: resolvedReleaseId,
        decision,
        expectedUpdatedAt: release?.updated_at ?? null,
      });

      if (newStatus) {
        setOptimisticReleaseStatus(newStatus as 'draft' | 'review' | 'approved' | 'rejected' | 'published');
      }

      await queryClient.invalidateQueries({ queryKey: ['release', resolvedReleaseId] });
      await queryClient.refetchQueries({ queryKey: ['release', resolvedReleaseId] });
      setOptimisticReleaseStatus(null);

      await queryClient.invalidateQueries({ queryKey: ['release_reviewers', resolvedReleaseId] });
      await queryClient.refetchQueries({ queryKey: ['release_reviewers', resolvedReleaseId] });
      await queryClient.invalidateQueries({ queryKey: ['release_activity', resolvedReleaseId] });
      await queryClient.refetchQueries({ queryKey: ['release_activity', resolvedReleaseId] });
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось сохранить голос');
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId || !orderedChanges.length) return;

    if (!canReorderChanges) {
      setErrorText('Порядок изменений можно менять только в статусе draft');
      return;
    }

    const fromIndex = orderedChanges.findIndex((item) => item.id === draggedId);
    const toIndex = orderedChanges.findIndex((item) => item.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...orderedChanges];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    const reorderedItems = next.map((item, index) => ({ id: item.id, position: index }));

    try {
      await reorderReleaseChanges.mutateAsync({ items: reorderedItems, expectedUpdatedAt: release?.updated_at ?? null });
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось сохранить порядок изменений');
    } finally {
      setDraggedId(null);
      setDropTargetId(null);
    }
  };

  const handleDeleteChange = async (changeId: string, changeCreatedBy: string | null) => {
    setErrorText(null);

    if (changeCreatedBy !== user?.id && !permissions.canDeleteOwnChange) {
      setErrorText('У вас нет прав удалять чужие изменения');
      return;
    }

    if (changeCreatedBy !== user?.id) {
      setErrorText('Вы можете удалять только свои изменения');
      return;
    }

    if (releaseStatus === 'published') {
      setErrorText('Нельзя удалить изменения из опубликованного релиза');
      return;
    }

    try {
      const { error } = await supabase
        .from('release_changes')
        .delete()
        .eq('id', changeId);

      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: ['release_changes', resolvedReleaseId] });
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось удалить изменение');
    }
  };

  const startEditChange = (change: { id: string; category: string; title: string; description: string; updated_at?: string | null }) => {
    setEditingChangeId(change.id);
    setEditingChangeForm({ category: change.category as 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking', title: change.title, description: change.description });
  };

  const saveEditChange = async () => {
    if (!editingChangeId) return;
    setErrorText(null);

    try {
      const change = changes?.find((c) => c.id === editingChangeId);
      await updateReleaseChange.mutateAsync({
        changeId: editingChangeId,
        category: editingChangeForm.category,
        title: editingChangeForm.title.trim(),
        description: editingChangeForm.description.trim(),
        expectedUpdatedAt: change?.updated_at ?? null,
      });
      setEditingChangeId(null);
    } catch (error: unknown) {
      setErrorText(getErrorMessage(error) || 'Не удалось сохранить изменение');
    }
  };

  const backTarget = release?.products?.id
    ? `/workspaces/${resolvedWorkspaceId}/products/${release.products.id}`
    : `/workspaces/${resolvedWorkspaceId}`;


  if (isAuthLoading || !resolvedWorkspaceId || !resolvedReleaseId || isReleaseLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => navigate(backTarget)} label={release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />
        <div className="p-8 text-center text-gray-500 font-medium">Загрузка релиза...</div>
      </div>
    );
  }

  if (isReleaseDeleted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => navigate(backTarget)} label={release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1">Релиз удалён</h2>
            <p className="text-sm mb-4">Этот релиз был удалён другим пользователем. Вернитесь к списку релизов.</p>
            <button
              onClick={() => navigate(backTarget)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
            >
              Вернуться назад
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (isReleaseError || !release) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => navigate(backTarget)} label={release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />
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
      <BackHeader onBack={() => navigate(backTarget)} label={release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />

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
              <div className="text-xs text-gray-500">Действия доступны согласно вашей роли.</div>
              <div className="flex flex-wrap gap-2 pt-1">
                {permissions.canDeleteRelease && (
                  <button
                    onClick={() => void handleDeleteRelease()}
                    disabled={deleteRelease.isPending}
                    className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Удалить релиз
                  </button>
                )}
                {permissions.canCancelPublishedRelease && releaseStatus === 'published' && (
                  <button
                    onClick={() => void handleCancelPublishedRelease()}
                    disabled={cancelPublishedRelease.isPending}
                    className="px-3 py-2 text-sm font-medium rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    Отменить публикацию
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Согласование и голосование</h2>
              <span className="text-sm text-gray-500">{reviewers?.length ? `${reviewers.length} участника` : 'Нет данных'}</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => handleVote('approved')} disabled={isVotingClosed || !reviewers?.some((reviewer) => reviewer.user_id === user?.id)} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Проголосовать за</button>
              <button onClick={() => handleVote('rejected')} disabled={isVotingClosed || !reviewers?.some((reviewer) => reviewer.user_id === user?.id)} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Проголосовать против</button>
            </div>
            {isReviewersLoading ? (
              <div className="h-16 bg-gray-200 animate-pulse rounded-xl" />
            ) : (
              <div className="space-y-3">
                {(reviewers ?? []).length > 0 && (
                  <div className="space-y-2">
                    {(reviewers ?? []).map((reviewer: ReleaseReviewerItem) => (
                      <div key={reviewer.id} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{reviewer.profiles?.display_name ?? 'Участник'}</div>
                            <span className="px-2 py-1 rounded-full text-[11px] font-semibold uppercase bg-gray-100 text-gray-700">
                              {reviewer.decision ?? 'pending'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {reviewer.decided_at ? `Решение принято: ${new Date(reviewer.decided_at).toLocaleString('ru-RU')}` : 'Ожидает решения'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {pendingReviewerIds.length > 0 && (
                  <div className="space-y-2">
                    {pendingReviewerIds.map((userId) => {
                      const member = (workspaceMembers ?? []).find((m) => m.user_id === userId);
                      return (
                        <div key={userId} className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{member?.profiles?.display_name ?? 'Участник'}</div>
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold uppercase bg-indigo-100 text-indigo-700">
                                pending
                              </span>
                            </div>
                            {permissions.canApproveRelease && !isPublished && (
                              <button
                                onClick={() => setPendingReviewerIds((current) => current.filter((id) => id !== userId))}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                              >
                                Убрать
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {((reviewers ?? []).length === 0 && pendingReviewerIds.length === 0) && (
                  <div className="text-sm text-gray-500">К этому релизу пока не назначены ревьюеры.</div>
                )}
                {permissions.canApproveRelease && !isPublished && (
                  <div className="flex items-center gap-2 pt-2">
                    <select
                      value=""
                      onChange={(event) => {
                        const userId = event.target.value;
                        const existingIds = new Set((reviewers ?? []).map((r) => r.user_id).filter((id): id is string => !!id));
                        if (userId && !pendingReviewerIds.includes(userId) && !existingIds.has(userId)) {
                          setPendingReviewerIds((current) => [...current, userId]);
                        }
                        event.target.value = '';
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    >
                      <option value="" disabled>Добавить согласующего...</option>
                      {(workspaceMembers ?? [])
                        .filter((m) => {
                          const uid = m.user_id ?? '';
                          return uid && !pendingReviewerIds.includes(uid) && !(reviewers ?? []).some((r) => r.user_id === uid);
                        })
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id ?? ''}>
                            {m.profiles?.display_name ?? 'Участник'} ({m.role})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Доступные действия</h2>
            <div className="flex flex-wrap gap-2">
              {permissions.canSendForReview && (
                <button onClick={() => handleStatusChange('review')} disabled={releaseStatus !== 'draft'} className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-50">Отправить на review</button>
              )}
              {permissions.canPublishRelease && (
                <button onClick={() => handleStatusChange('published')} disabled={releaseStatus !== 'approved'} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Опубликовать</button>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-4">Статус approved устанавливается автоматически, когда все согласующие проголосуют за релиз.</p>
          </div>
        </div>

        {errorText && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {errorText}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Добавить изменение</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                <select
                  {...register('category')}
                  disabled={isSubmitting || isPublished}
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
                  disabled={isSubmitting || isPublished}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
                />
                {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
              <textarea
                {...register('description')}
                disabled={isSubmitting || isPublished}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
              />
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || isPublished}
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
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {canReorderChanges
                ? 'Перетаскивайте элементы, чтобы задать новый порядок отображения.'
                : 'Порядок изменений можно менять только в статусе draft.'}
            </p>

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
                const isOwner = change.created_by === user?.id;
                const canEdit = isOwner && releaseStatus !== 'published';
                const isEditing = editingChangeId === change.id;

                return (
                  <div
                    key={change.id}
                    draggable={canReorderChanges && !isEditing}
                    onDragStart={() => {
                      if (!canReorderChanges || isEditing) return;
                      setDraggedId(change.id);
                      setDropTargetId(change.id);
                    }}
                    onDragOver={(event) => {
                      if (!canReorderChanges || isEditing) return;
                      event.preventDefault();
                      setDropTargetId(change.id);
                    }}
                    onDragLeave={() => {
                      if (!canReorderChanges || isEditing) return;
                      if (dropTargetId === change.id) {
                        setDropTargetId(null);
                      }
                    }}
                    onDrop={() => {
                      if (isEditing) return;
                      handleDrop(change.id);
                    }}
                    className={`border rounded-xl p-4 transition-all ${
                      isDragging
                        ? 'border-indigo-500 bg-indigo-50 shadow-md opacity-70'
                        : isDropTarget
                          ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                          : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:shadow-sm'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                            <select
                              value={editingChangeForm.category}
                              onChange={(event) => setEditingChangeForm((current) => ({ ...current, category: event.target.value as 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking' }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
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
                              value={editingChangeForm.title}
                              onChange={(event) => setEditingChangeForm((current) => ({ ...current, title: event.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                          <textarea
                            value={editingChangeForm.description}
                            onChange={(event) => setEditingChangeForm((current) => ({ ...current, description: event.target.value }))}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingChangeId(null)} className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Отмена</button>
                          <button type="button" onClick={saveEditChange} className="px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Сохранить</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{change.category}</span>
                            <span className="text-sm font-semibold text-gray-900">{change.title}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-2">{change.description}</p>
                          <p className="text-xs text-gray-500 mt-2">Автор: {change.authorName || 'Не указан'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">#{change.position + 1}</span>
                          {canEdit && (
                            <button onClick={() => startEditChange(change)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Редактировать</button>
                          )}
                          {canEdit && (
                            <button onClick={() => handleDeleteChange(change.id, change.created_by)} className="text-xs font-medium text-red-600 hover:text-red-700">Удалить</button>
                          )}
                        </div>
                      </div>
                    )}
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
                  {comments.map((comment: ReleaseCommentItem) => {
                    const isEditing = editingCommentId === comment.id;
                    const canEdit = comment.user_id === user?.id;

                    return (
                      <div key={comment.id} className="rounded-xl border border-gray-200 p-3">
                        {isEditing ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingCommentText}
                              onChange={(event) => setEditingCommentText(event.target.value)}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                            />
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setEditingCommentId(null)} className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Отмена</button>
                              <button type="button" onClick={saveEditComment} className="px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Сохранить</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-sm text-gray-700">
                              <div className="flex items-center gap-3">
                                {comment.profiles?.avatar_url ? (
                                  <img
                                    src={comment.profiles.avatar_url}
                                    alt={`${comment.profiles?.display_name ?? 'Пользователь'} avatar`}
                                    className="h-8 w-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-gray-200" />
                                )}
                                <span className="font-medium">{comment.profiles?.display_name ?? 'Пользователь'}</span>
                              </div>
                              <span>{comment.created_at ? new Date(comment.created_at).toLocaleString('ru-RU') : '—'}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-2">{comment.content}</p>
                            <div className="flex gap-3 mt-2">
                              {canEdit && (
                                <button onClick={() => startEditComment(comment)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Редактировать</button>
                              )}
                              {canEdit && (
                                <button onClick={() => handleDeleteComment(comment.id, comment.user_id ?? '')} className="text-xs font-medium text-red-600 hover:text-red-700">Удалить</button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-4">Комментариев пока нет.</p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Журнал действий</h2>
                <button
                  type="button"
                  onClick={() => setIsActivityCollapsed((value) => !value)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {isActivityCollapsed ? 'Развернуть' : 'Свернуть'}
                </button>
              </div>
              {isActivityLoading ? (
                <div className="h-16 bg-gray-200 animate-pulse rounded-xl" />
              ) : activity && activity.length > 0 && !isActivityCollapsed ? (
                <div className="space-y-3">
                  {activity.map((item: ReleaseActivityItem) => {
                    const payload = (item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
                      ? item.payload as Record<string, unknown>
                      : {}) as Record<string, unknown>;
                    const actorName = item.profiles?.display_name || 'Пользователь';
                    const fromValue = typeof payload.from === 'string' ? payload.from : null;
                    const toValue = typeof payload.to === 'string' ? payload.to : null;
                    const message = item.event_type === 'status_changed'
                      ? fromValue && toValue
                        ? `${actorName}: ${fromValue} → ${toValue}`
                        : `${actorName}: статус изменён`
                      : item.event_type === 'vote_submitted'
                        ? `${actorName}: голос ${payload.decision === 'approved' ? 'за' : 'против'}`
                        : `${actorName}: добавлено изменение`;
                    return (
                      <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                        <div className="text-sm font-medium text-gray-900">{message}</div>
                        <div className="text-xs text-gray-500 mt-1">{item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : '—'}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {isActivityCollapsed ? 'Список логов скрыт' : 'Событий ещё нет.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};