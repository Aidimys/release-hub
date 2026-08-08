import type { CommentsSectionProps } from '../../../features/workspaces/hooks/useReleaseDetailsPage';

export const CommentsSection = ({ comments, isCommentsLoading, commentText, setCommentText, user, editingCommentId, editingCommentText, setEditingCommentId, setEditingCommentText, handleCommentSubmit, startEditComment, saveEditComment, handleDeleteComment }: CommentsSectionProps) => (
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
        {comments.map((comment) => {
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
);
