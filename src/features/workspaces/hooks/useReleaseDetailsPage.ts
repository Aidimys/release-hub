import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../../app/providers/AuthProvider';
import { usePermissions } from '../../../features/workspaces/api/usePermissions';
import { useCancelPublishedRelease, useDeleteRelease, useWorkspaceMembers } from '../../../features/workspaces/api/useWorkspaceDetails';
import type { ReleaseStatus } from '../../../features/workspaces/utils/releaseWorkflow';
import { canTransitionToStatus, validateReleaseForReview } from '../../../features/workspaces/utils/releaseWorkflow';
import {
  useCreateActivityEvent,
  useCreateReleaseChange,
  useCreateReleaseComment,
  useDeleteReleaseChange,
  useDeleteReleaseComment,
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
} from '../../../features/workspaces/api/useReleaseDetails';
import { releaseKeys, workspaceKeys, productKeys } from '../../../shared/api/queryKeys';
import { useReleaseRealtime } from '../../../shared/api/useSupabaseRealtime';
import { realtimeDedup } from '../../../shared/api/realtimeDedup';
import { useToast } from '../../../app/hooks/useToast';

const createReleaseChangeSchema = z.object({
  category: z.enum(['feature', 'improvement', 'bugfix', 'security', 'breaking']),
  title: z.string().min(2, 'Название должно быть не менее 2 символов'),
  description: z.string().min(2, 'Описание должно быть не менее 2 символов'),
});

type FormData = z.infer<typeof createReleaseChangeSchema>;

interface ReleaseListItem {
  id?: string;
  status?: ReleaseStatus | null;
  published_at?: string | null;
  [key: string]: unknown;
}

interface ReleaseRecord {
  id?: string;
  status?: ReleaseStatus | null;
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
  updated_at?: string | null;
  [key: string]: unknown;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Неизвестная ошибка';
};

export interface ReleaseHeaderProps {
  release: ReleaseRecord;
  releaseStatus: ReleaseStatus;
  permissions: {
    canDeleteRelease: boolean;
    canCancelPublishedRelease: boolean;
  };
  deleteRelease: { isPending: boolean };
  cancelPublishedRelease: { isPending: boolean };
  setIsDeleteModalOpen: (open: boolean) => void;
  setIsCancelModalOpen: (open: boolean) => void;
}

export interface ReviewersSectionProps {
  reviewers: Array<{
    id: string;
    user_id?: string | null;
    decision?: string | null;
    decided_at?: string | null;
    profiles?: {
      display_name?: string | null;
    } | null;
  }> | undefined;
  isReviewersLoading: boolean;
  pendingReviewerIds: string[];
  setPendingReviewerIds: (ids: string[] | ((current: string[]) => string[])) => void;
  permissions: {
    canApproveRelease: boolean;
  };
  isPublished: boolean;
  workspaceMembers: Array<{
    user_id?: string | null;
    profiles?: {
      display_name?: string | null;
    } | null;
    role?: string | null;
  }> | undefined;
  user: { id?: string } | null | undefined;
  handleVote: (decision: 'approved' | 'rejected') => void;
  isVotingClosed: boolean;
}

export interface ReleaseActionsSectionProps {
  permissions: {
    canSendForReview: boolean;
    canPublishRelease: boolean;
  };
  releaseStatus: ReleaseStatus;
  handleStatusChange: (status: ReleaseStatus) => void;
}

export interface AddChangeFormProps {
  register: ReturnType<typeof useForm<FormData>>['register'];
  handleSubmit: ReturnType<typeof useForm<FormData>>['handleSubmit'];
  errors: ReturnType<typeof useForm<FormData>>['formState']['errors'];
  isSubmitting: boolean;
  isPublished: boolean;
  onSubmit: (data: FormData) => Promise<void>;
}

export interface ChangesListProps {
  orderedChanges: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    position: number;
    created_by: string | null;
    authorName?: string | null;
  }>;
  isChangesLoading: boolean;
  isChangesError: boolean;
  changesError: Error | null;
  draggedId: string | null;
  dropTargetId: string | null;
  setDraggedId: (id: string | null) => void;
  setDropTargetId: (id: string | null) => void;
  canReorderChanges: boolean;
  editingChangeId: string | null;
  editingChangeForm: {
    category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking';
    title: string;
    description: string;
  };
  setEditingChangeForm: (form: { category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking'; title: string; description: string } | ((current: { category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking'; title: string; description: string }) => { category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking'; title: string; description: string })) => void;
  user: { id?: string } | null | undefined;
  releaseStatus: ReleaseStatus;
  handleDrop: (targetId: string) => void;
  startEditChange: (change: { id: string; category: string; title: string; description: string; updated_at?: string | null }) => void;
  saveEditChange: () => void;
  handleDeleteChange: (changeId: string, changeCreatedBy: string | null) => void;
}

export interface CommentsSectionProps {
  comments: Array<{
    id: string;
    content?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    user_id?: string | null;
    profiles?: {
      display_name?: string | null;
      avatar_url?: string | null;
    } | null;
  }> | undefined;
  isCommentsLoading: boolean;
  commentText: string;
  setCommentText: (text: string) => void;
  user: { id?: string } | null | undefined;
  editingCommentId: string | null;
  editingCommentText: string;
  setEditingCommentId: (id: string | null) => void;
  setEditingCommentText: (text: string) => void;
  handleCommentSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  startEditComment: (comment: { id: string; content?: string | null }) => void;
  saveEditComment: () => void;
  handleDeleteComment: (commentId: string, commentUserId: string) => void;
}

export interface ActivitySectionProps {
  activity: Array<{
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
  }> | undefined;
  isActivityLoading: boolean;
  isActivityCollapsed: boolean;
  setIsActivityCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export const useReleaseDetailsPage = (workspaceId: string, releaseId: string) => {
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const resolvedWorkspaceId = workspaceId ?? '';
  const resolvedReleaseId = releaseId ?? '';

  const { data: release, isLoading: isReleaseLoading, isError: isReleaseError, error: releaseError } = useReleaseDetails(resolvedReleaseId);
  const { data: changes, isLoading: isChangesLoading, isError: isChangesError, error: changesError } = useReleaseChanges(resolvedReleaseId);
  const { data: reviewers, isLoading: isReviewersLoading } = useReleaseReviewers(resolvedReleaseId);
  const { data: comments, isLoading: isCommentsLoading } = useReleaseComments(resolvedReleaseId);
  const { data: activity, isLoading: isActivityLoading } = useReleaseActivity(resolvedReleaseId);
  const createReleaseChange = useCreateReleaseChange(resolvedReleaseId);
  const createReleaseComment = useCreateReleaseComment(resolvedReleaseId);
  const deleteReleaseChange = useDeleteReleaseChange(resolvedReleaseId);
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
  const createActivityEvent = useCreateActivityEvent(resolvedWorkspaceId, resolvedReleaseId);
  const deleteReleaseComment = useDeleteReleaseComment(resolvedReleaseId);

  const releaseStatus = optimisticReleaseStatus ?? release?.status ?? 'draft';
  const isReleaseDeleted = Boolean(queryClient.getQueryData(releaseKeys.deleted(resolvedReleaseId)));
  const isVotingClosed = releaseStatus !== 'review';
  const canReorderChanges = releaseStatus === 'draft' && permissions.canEditChange;
  const isPublished = releaseStatus === 'published';

  const backTarget = release?.products?.id
    ? `/workspaces/${resolvedWorkspaceId}/products/${release.products.id}`
    : `/workspaces/${resolvedWorkspaceId}`;

  const updateReleaseListCache = (queryKey: readonly unknown[], nextStatus: ReleaseStatus, nextPublishedAt: string | null) => {
    queryClient.setQueryData(queryKey, (current: ReleaseListItem[] | undefined) => {
      if (!current) return current;
      return current.map((item) => {
        if (item.id !== resolvedReleaseId) return item;
        return { ...item, status: nextStatus, published_at: nextPublishedAt };
      });
    });
  };

  const resetReviewersState = async () => {
    queryClient.setQueryData(releaseKeys.reviewers(resolvedReleaseId), (current: Array<{ decision?: string | null; decided_at?: string | null }> | undefined) => {
      if (!current) return current;
      return current.map((reviewer) => ({ ...reviewer, decision: null, decided_at: null }));
    });
    await queryClient.invalidateQueries({ queryKey: releaseKeys.reviewers(resolvedReleaseId) });
    await queryClient.refetchQueries({ queryKey: releaseKeys.reviewers(resolvedReleaseId) });
  };

  useReleaseRealtime(resolvedReleaseId, resolvedWorkspaceId);

  useEffect(() => {
    if (release?.id) {
      queryClient.setQueryData(releaseKeys.deleted(resolvedReleaseId), false);
    }
  }, [queryClient, release?.id, resolvedReleaseId]);

  const orderedChanges = useMemo(() => {
    if (!changes) return [] as Array<{ id: string; position: number; category: string; title: string; description: string; created_by: string | null; authorName?: string | null; updated_at?: string | null }>;
    return [...changes].sort((a, b) => a.position - b.position);
  }, [changes]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(createReleaseChangeSchema),
    defaultValues: { category: 'feature' },
  });

  const handleStatusChange = async (
    nextStatus: ReleaseStatus,
    options?: { skipPermissionCheck?: boolean }
  ) => {
    setErrorText(null);

    if (!options?.skipPermissionCheck) {
      await queryClient.refetchQueries({ queryKey: workspaceKeys.members(resolvedWorkspaceId) });
      const freshMembers = queryClient.getQueryData<Array<{ user_id: string | null; role: string }>>(workspaceKeys.members(resolvedWorkspaceId));
      const myRole = freshMembers?.find((m) => m.user_id === user?.id)?.role ?? 'contributor';
      if (myRole !== 'owner' && myRole !== 'maintainer') {
        setErrorText('У вас нет прав изменять статус релиза');
        return;
      }
    }

    if (!canTransitionToStatus(releaseStatus, nextStatus)) {
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
      queryClient.setQueryData(releaseKeys.detail(resolvedReleaseId), (current: ReleaseRecord | undefined) => {
        if (!current) return current;
        return {
          ...current,
          status: previousStatus,
          published_at: previousPublishedAt,
        };
      });
      if (resolvedWorkspaceId) {
        updateReleaseListCache(workspaceKeys.releases(resolvedWorkspaceId), previousStatus, previousPublishedAt);
      }
      if (productId) {
        updateReleaseListCache(productKeys.releases(productId), previousStatus, previousPublishedAt);
      }
      setOptimisticReleaseStatus(null);
    };

    queryClient.setQueryData(releaseKeys.detail(resolvedReleaseId), (current: ReleaseRecord | undefined) => {
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
      updateReleaseListCache(workspaceKeys.releases(resolvedWorkspaceId), nextStatus, publishedAt);
    }
    if (productId) {
      updateReleaseListCache(productKeys.releases(productId), nextStatus, publishedAt);
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
            setOptimisticReleaseStatus(result as ReleaseStatus);
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
      await queryClient.invalidateQueries({ queryKey: releaseKeys.detail(resolvedReleaseId) });
      await queryClient.refetchQueries({ queryKey: releaseKeys.detail(resolvedReleaseId) });
      if (resolvedWorkspaceId) {
        await queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(resolvedWorkspaceId) });
        await queryClient.refetchQueries({ queryKey: workspaceKeys.releases(resolvedWorkspaceId) });
      }
      if (productId) {
        await queryClient.invalidateQueries({ queryKey: productKeys.releases(productId) });
        await queryClient.refetchQueries({ queryKey: productKeys.releases(productId) });
      }
      setOptimisticReleaseStatus(null);
    } catch (error: unknown) {
      rollbackOptimistic();
      setErrorText(getErrorMessage(error) || 'Не удалось сменить статус релиза');
    }
  };

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
        await createActivityEvent.mutateAsync({
          eventType: 'change_added',
          payload: { message: 'Добавлено изменение' },
          actorId: user.id,
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

  const handleDeleteRelease = async () => {
    try {
      await deleteRelease.mutateAsync(resolvedReleaseId);
      showToast('Релиз удалён', 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error) || 'Не удалось удалить релиз', 'error');
    } finally {
      setIsDeleteModalOpen(false);
    }
  };

  const handleCancelPublishedRelease = async () => {
    try {
      await cancelPublishedRelease.mutateAsync({
        releaseId: resolvedReleaseId,
        expectedUpdatedAt: release?.updated_at ?? null,
        productId: release?.products?.id ?? undefined,
      });
      showToast('Публикация отменена', 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error) || 'Не удалось отменить публикацию релиза', 'error');
    } finally {
      setIsCancelModalOpen(false);
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
      if (user?.id) {
        await createActivityEvent.mutateAsync({
          eventType: 'comment_added',
          payload: { message: 'Добавлен комментарий' },
          actorId: user.id,
        });
      }
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
      await deleteReleaseComment.mutateAsync(commentId);
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
        setOptimisticReleaseStatus(newStatus as ReleaseStatus);
      }

      await queryClient.invalidateQueries({ queryKey: releaseKeys.detail(resolvedReleaseId) });
      await queryClient.refetchQueries({ queryKey: releaseKeys.detail(resolvedReleaseId) });
      setOptimisticReleaseStatus(null);

      await queryClient.invalidateQueries({ queryKey: releaseKeys.reviewers(resolvedReleaseId) });
      await queryClient.refetchQueries({ queryKey: releaseKeys.reviewers(resolvedReleaseId) });
      await queryClient.invalidateQueries({ queryKey: releaseKeys.activity(resolvedReleaseId) });
      await queryClient.refetchQueries({ queryKey: releaseKeys.activity(resolvedReleaseId) });
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
      await deleteReleaseChange.mutateAsync(changeId);
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

  return {
    user,
    isAuthLoading,
    draggedId,
    dropTargetId,
    setDraggedId,
    setDropTargetId,
    errorText,
    setErrorText,
    commentText,
    setCommentText,
    isActivityCollapsed,
    setIsActivityCollapsed,
    pendingReviewerIds,
    setPendingReviewerIds,
    editingChangeId,
    setEditingChangeId,
    editingChangeForm,
    setEditingChangeForm,
    editingCommentId,
    setEditingCommentId,
    editingCommentText,
    setEditingCommentText,
    optimisticReleaseStatus,
    setOptimisticReleaseStatus,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    isCancelModalOpen,
    setIsCancelModalOpen,
    resolvedWorkspaceId,
    resolvedReleaseId,
    release,
    isReleaseLoading,
    isReleaseError,
    releaseError,
    changes,
    isChangesLoading,
    isChangesError,
    changesError,
    reviewers,
    isReviewersLoading,
    comments,
    isCommentsLoading,
    activity,
    isActivityLoading,
    createReleaseChange,
    createReleaseComment,
    reorderReleaseChanges,
    submitForReview,
    castVote,
    publishRelease,
    returnToDraft,
    updateReleaseChange,
    updateReleaseComment,
    workspaceMembers,
    permissions,
    deleteRelease,
    cancelPublishedRelease,
    releaseStatus,
    isReleaseDeleted,
    isVotingClosed,
    canReorderChanges,
    isPublished,
    backTarget,
    orderedChanges,
    register,
    handleSubmit,
    reset,
    errors,
    isSubmitting,
    onSubmit,
    handleStatusChange,
    handleDeleteRelease,
    handleCancelPublishedRelease,
    handleCommentSubmit,
    handleDeleteComment,
    startEditComment,
    saveEditComment,
    handleVote,
    handleDrop,
    handleDeleteChange,
    startEditChange,
    saveEditChange,
    getErrorMessage,
  };
};
