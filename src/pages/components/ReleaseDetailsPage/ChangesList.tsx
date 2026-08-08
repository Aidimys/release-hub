import type { ChangesListProps } from '../../../features/workspaces/hooks/useReleaseDetailsPage';
import type { Database } from '../../../shared/api/database.types';

export const ChangesList = ({ orderedChanges, isChangesLoading, isChangesError, changesError, draggedId, dropTargetId, setDraggedId, setDropTargetId, canReorderChanges, editingChangeId, editingChangeForm, setEditingChangeForm, user, releaseStatus, handleDrop, startEditChange, saveEditChange, handleDeleteChange }: ChangesListProps) => {
  if (isChangesLoading) {
    return <div className="h-24 bg-gray-200 animate-pulse rounded-xl" />;
  }

  if (isChangesError) {
    return (
      <div className="text-center py-8 bg-red-50 rounded-xl border border-red-200 text-red-700">
        Ошибка загрузки изменений.
        {changesError && (
          <div className="mt-2 text-xs bg-red-100 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
            {changesError.message}
          </div>
        )}
      </div>
    );
  }

  if (!orderedChanges.length) {
    return (
      <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
        Для этого релиза ещё нет изменений
      </div>
    );
  }

  return (
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
                      onChange={(event) => setEditingChangeForm((current: { category: Database['public']['Enums']['change_category']; title: string; description: string }) => ({ ...current, category: event.target.value as Database['public']['Enums']['change_category'] }))}
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
                  <button type="button" onClick={() => startEditChange(change)} className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Отмена</button>
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
  );
};
