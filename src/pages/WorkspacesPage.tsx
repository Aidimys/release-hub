import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { useWorkspaces } from '../features/workspaces/api/useWorkspaces';
import { CreateWorkspaceModal } from '../features/auth/ui/CreateWorkspaceModal';


export const WorkspacesPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: workspaces, isLoading, isError, error, refetch } = useWorkspaces();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
        {!isLoading && !isError && workspaces?.length === 0 && (
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
        {!isLoading && !isError && workspaces && workspaces.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((ws: any) => {
              const role = ws.workspace_members?.[0]?.role;
              return (
                <div
                  key={ws.id}
                  onClick={() => navigate(`/workspaces/${ws.id}`)}
                  className="bg-white p-6 rounded-xl border border-gray-200 hover:border-indigo-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{ws.name}</h3>
                      <span className="px-2 py-1 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 uppercase">
                        {role}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-4">
                    Создано: {new Date(ws.created_at).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <CreateWorkspaceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};