import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { useDeleteWorkspace, useUpdateWorkspace, useWorkspaces } from '../features/workspaces/api/useWorkspaces';
import { CreateWorkspaceModal } from '../features/auth/ui/CreateWorkspaceModal';
import { EditWorkspaceModal } from '../features/workspaces/ui/EditWorkspaceModal';

interface WorkspaceListItem {
  id: string;
  name: string;
  created_at: string;
  workspace_members?: Array<{ role?: string; user_id?: string | null; }>;
}

export const WorkspacesPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: workspaces, isLoading, isError, error, refetch } = useWorkspaces();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceListItem | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<WorkspaceListItem | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const normalizedWorkspaces = useMemo(() => {
    return (workspaces ?? []).map((workspace: WorkspaceListItem) => ({
      ...workspace,
      workspace_members: workspace.workspace_members ?? [],
    }));
  }, [workspaces]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Шапка */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">ReleaseHub</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Ваши рабочие пространства</h2>
            <p className="text-sm text-gray-500">Выберите пространство для работы с релизами</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            + Создать пространство
          </button>
        </div>

        {feedback && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {feedback}
          </div>
        )}

        {/* Состояние загрузки (Loading) */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-32 bg-gray-200 animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {/* Состояние ошибки (Error) */}
        {isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex justify-between items-center">
            <p>Ошибка загрузки: {(error as Error).message}</p>
            <button
              onClick={() => refetch()}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
            >
              Повторить
            </button>
          </div>
        )}

        {/* Пустое состояние (Empty) */}
        {!isLoading && !isError && normalizedWorkspaces.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
            <h3 className="text-lg font-medium text-gray-900 mb-1">У вас пока нет пространств</h3>
            <p className="text-sm text-gray-500 mb-4">Создайте первое рабочее пространство, чтобы начать</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
            >
              Создать пространство
            </button>
          </div>
        )}

        {/* Список карточек воркспейсов */}
        {!isLoading && !isError && normalizedWorkspaces.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {normalizedWorkspaces.map((workspace) => {
              const currentUserMember = workspace.workspace_members?.find(
                (member) => member.user_id === user?.id
              );
              const role = currentUserMember?.role ?? workspace.workspace_members?.[0]?.role;
              return (
                <div
                  key={workspace.id}
                  className="bg-white p-6 rounded-xl border border-gray-200 hover:border-indigo-500 hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/workspaces/${workspace.id}`)}
                        className="text-left text-lg font-bold text-gray-900 hover:text-indigo-600"
                      >
                        {workspace.name}
                      </button>
                      <span className="px-2 py-1 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 uppercase">
                        {role}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-400">
                      Создано: {new Date(workspace.created_at).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      {role === 'owner' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingWorkspace(workspace)}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => setWorkspaceToDelete(workspace)}
                            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                          >
                            Удалить
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <CreateWorkspaceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <EditWorkspaceModal
        isOpen={Boolean(editingWorkspace)}
        currentName={editingWorkspace?.name ?? ''}
        onClose={() => setEditingWorkspace(null)}
        onSubmit={async (name) => {
          if (!editingWorkspace) return;
          try {
            await updateWorkspace.mutateAsync({ id: editingWorkspace.id, name });
            setEditingWorkspace(null);
            setFeedback('Рабочее пространство обновлено');
          } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Не удалось обновить пространство');
          }
        }}
      />

      {workspaceToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Удалить пространство?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Это действие удалит пространство и связанные данные. Вы уверены, что хотите продолжить?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setWorkspaceToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteWorkspace.mutateAsync(workspaceToDelete.id);
                    setWorkspaceToDelete(null);
                    setFeedback('Рабочее пространство удалено');
                  } catch (error) {
                    setWorkspaceToDelete(null);
                    setFeedback(error instanceof Error ? error.message : 'Не удалось удалить пространство');
                  }
                }}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                {deleteWorkspace.isPending ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};