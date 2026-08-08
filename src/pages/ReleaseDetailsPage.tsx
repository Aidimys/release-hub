import { useParams, useNavigate } from 'react-router-dom';
import { useReleaseDetailsPage, type ReleaseHeaderProps, type ReviewersSectionProps, type ReleaseActionsSectionProps, type AddChangeFormProps, type ChangesListProps, type CommentsSectionProps, type ActivitySectionProps } from '../features/workspaces/hooks/useReleaseDetailsPage';
import { DeleteConfirmModal } from '../features/workspaces/ui/DeleteConfirmModal';
import { ReleaseHeader } from './components/ReleaseDetailsPage/ReleaseHeader';
import { ReviewersSection } from './components/ReleaseDetailsPage/ReviewersSection';
import { ReleaseActionsSection } from './components/ReleaseDetailsPage/ReleaseActionsSection';
import { AddChangeForm } from './components/ReleaseDetailsPage/AddChangeForm';
import { ChangesList } from './components/ReleaseDetailsPage/ChangesList';
import { CommentsSection } from './components/ReleaseDetailsPage/CommentsSection';
import { ActivitySection } from './components/ReleaseDetailsPage/ActivitySection';

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
  const page = useReleaseDetailsPage(workspaceId ?? '', releaseId ?? '');

  if (page.isAuthLoading || !workspaceId || !releaseId || page.isReleaseLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => navigate(page.backTarget)} label={page.release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />
        <div className="p-8 text-center text-gray-500 font-medium">Загрузка релиза...</div>
      </div>
    );
  }

  if (page.isReleaseDeleted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => navigate(page.backTarget)} label={page.release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1">Релиз удалён</h2>
            <p className="text-sm mb-4">Этот релиз был удалён другим пользователем. Вернитесь к списку релизов.</p>
            <button
              onClick={() => navigate(page.backTarget)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
            >
              Вернуться назад
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (page.isReleaseError || !page.release) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => navigate(page.backTarget)} label={page.release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1">Ошибка загрузки релиза</h2>
            <p className="text-sm mb-3">Релиз не найден или у вас нет доступа.</p>
            {page.releaseError && (
              <div className="text-xs bg-red-100/80 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                Детали: {(page.releaseError as Error).message}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  const releaseHeaderProps: ReleaseHeaderProps = {
    release: page.release,
    releaseStatus: page.releaseStatus,
    permissions: page.permissions,
    deleteRelease: page.deleteRelease,
    cancelPublishedRelease: page.cancelPublishedRelease,
    setIsDeleteModalOpen: page.setIsDeleteModalOpen,
    setIsCancelModalOpen: page.setIsCancelModalOpen,
  };

  const reviewersSectionProps: ReviewersSectionProps = {
    reviewers: page.reviewers,
    isReviewersLoading: page.isReviewersLoading,
    pendingReviewerIds: page.pendingReviewerIds,
    setPendingReviewerIds: page.setPendingReviewerIds,
    permissions: page.permissions,
    isPublished: page.isPublished,
    workspaceMembers: page.workspaceMembers,
    user: page.user,
    handleVote: page.handleVote,
    isVotingClosed: page.isVotingClosed,
  };

  const releaseActionsSectionProps: ReleaseActionsSectionProps = {
    permissions: page.permissions,
    releaseStatus: page.releaseStatus,
    handleStatusChange: page.handleStatusChange,
  };

  const addChangeFormProps: AddChangeFormProps = {
    register: page.register,
    handleSubmit: page.handleSubmit,
    errors: page.errors,
    isSubmitting: page.isSubmitting,
    isPublished: page.isPublished,
    onSubmit: page.onSubmit,
  };

  const changesListProps: ChangesListProps = {
    orderedChanges: page.orderedChanges,
    isChangesLoading: page.isChangesLoading,
    isChangesError: page.isChangesError,
    changesError: page.changesError,
    draggedId: page.draggedId,
    dropTargetId: page.dropTargetId,
    setDraggedId: page.setDraggedId,
    setDropTargetId: page.setDropTargetId,
    canReorderChanges: page.canReorderChanges,
    editingChangeId: page.editingChangeId,
    editingChangeForm: page.editingChangeForm,
    setEditingChangeForm: page.setEditingChangeForm,
    user: page.user,
    releaseStatus: page.releaseStatus,
    handleDrop: page.handleDrop,
    startEditChange: page.startEditChange,
    saveEditChange: page.saveEditChange,
    handleDeleteChange: page.handleDeleteChange,
  };

  const commentsSectionProps: CommentsSectionProps = {
    comments: page.comments,
    isCommentsLoading: page.isCommentsLoading,
    commentText: page.commentText,
    setCommentText: page.setCommentText,
    user: page.user,
    editingCommentId: page.editingCommentId,
    editingCommentText: page.editingCommentText,
    setEditingCommentId: page.setEditingCommentId,
    setEditingCommentText: page.setEditingCommentText,
    handleCommentSubmit: page.handleCommentSubmit,
    startEditComment: page.startEditComment,
    saveEditComment: page.saveEditComment,
    handleDeleteComment: page.handleDeleteComment,
  };

  const activitySectionProps: ActivitySectionProps = {
    activity: page.activity,
    isActivityLoading: page.isActivityLoading,
    isActivityCollapsed: page.isActivityCollapsed,
    setIsActivityCollapsed: page.setIsActivityCollapsed,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <BackHeader onBack={() => navigate(page.backTarget)} label={page.release?.products?.id ? 'Назад к продукту' : 'Назад к пространству'} />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <ReleaseHeader {...releaseHeaderProps} />

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <ReviewersSection {...reviewersSectionProps} />
          <ReleaseActionsSection {...releaseActionsSectionProps} />
        </div>

        {page.errorText && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {page.errorText}
          </div>
        )}

        <AddChangeForm {...addChangeFormProps} />

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Изменения релиза</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {page.canReorderChanges
                ? 'Перетаскивайте элементы, чтобы задать новый порядок отображения.'
                : 'Порядок изменений можно менять только в статусе draft.'}
            </p>
            <ChangesList {...changesListProps} />
          </div>

          <div className="space-y-6">
            <CommentsSection {...commentsSectionProps} />
            <ActivitySection {...activitySectionProps} />
          </div>
        </div>
      </main>

      <DeleteConfirmModal
        isOpen={page.isDeleteModalOpen}
        title="Удалить релиз?"
        message="Вы уверены, что хотите удалить этот релиз? Это действие необратимо."
        confirmLabel="Удалить"
        danger
        onConfirm={page.handleDeleteRelease}
        onClose={() => page.setIsDeleteModalOpen(false)}
      />

      <DeleteConfirmModal
        isOpen={page.isCancelModalOpen}
        title="Отменить публикацию релиза?"
        message="Вы уверены, что хотите отменить публикацию этого релиза? Статус будет возвращён в approved."
        confirmLabel="Отменить публикацию"
        danger={false}
        onConfirm={page.handleCancelPublishedRelease}
        onClose={() => page.setIsCancelModalOpen(false)}
      />
    </div>
  );
};
