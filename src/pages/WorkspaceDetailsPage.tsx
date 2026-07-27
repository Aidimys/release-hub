import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { useWorkspace, useProducts, useWorkspaceMembers } from '../features/workspaces/api/useWorkspaceDetails';


type Tab = 'products' | 'releases' | 'members';

interface WorkspaceMember {
  user_id: string | null;
  role: string;
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  };
}

interface WorkspaceProduct {
  id: string;
  name: string;
  slug: string;
}

export const WorkspaceDetailsPage = () => {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('products');

  const workspaceId = routeWorkspaceId ?? '';
  const { data: workspace, isLoading: isWsLoading, isError: isWsError, error: wsError } =
    useWorkspace(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: products, isLoading: isProductsLoading } = useProducts(workspaceId);

  // Шапка с кнопкой «Назад» (используется для загрузки и ошибок)
  const BackHeader = () => (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <button
          onClick={() => navigate('/workspaces')}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 transition"
        >
          ← Назад к пространствам
        </button>
      </div>
    </header>
  );

  // 1. Состояние загрузки
  if (isAuthLoading || !workspaceId || isWsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader />
        <div className="p-8 text-center text-gray-500 font-medium">
          Загрузка рабочего пространства...
        </div>
      </div>
    );
  }

  // 2. Состояние ошибки (С шапкой и кнопкой назад)
  if (isWsError || !workspace) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1">Ошибка загрузки пространства</h2>
            <p className="text-sm mb-3">
              Рабочее пространство не найдено или у вас нет к нему доступа.
            </p>
            {wsError && (
              <div className="text-xs bg-red-100/80 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                Детали: {(wsError as Error).message}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Определяем роль текущего пользователя
  const currentUserMember = members?.find(
    (member: WorkspaceMember) => member.user_id === user?.id
  );
  const userRole = currentUserMember?.role || 'contributor';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Шапка пространства */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate('/workspaces')}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium mb-2 inline-flex items-center gap-1"
          >
            ← Назад к пространствам
          </button>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{workspace.name}</h1>
              <p className="text-xs text-gray-500">ID: {workspace.id}</p>
            </div>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 font-semibold text-xs rounded-full uppercase">
              Ваша роль: {userRole}
            </span>
          </div>
        </div>
      </header>

      {/* Переключатель вкладок */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-8">
          {(['products', 'releases', 'members'] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = {
              products: 'Продукты',
              releases: 'Релизы',
              members: 'Участники',
            };

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 text-sm font-medium border-b-2 transition ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Содержимое вкладок */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'products' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">Список продуктов</h2>
              {(userRole === 'owner' || userRole === 'maintainer') && (
                <button className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 text-sm">
                  + Добавить продукт
                </button>
              )}
            </div>

            {isProductsLoading ? (
              <div className="h-24 bg-gray-200 animate-pulse rounded-xl" />
            ) : products && products.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product: WorkspaceProduct) => (
                  <div key={product.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-900">{product.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">Slug: {product.slug}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
                В этом пространстве пока нет продуктов
              </div>
            )}
          </div>
        )}

        {activeTab === 'releases' && (
          <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Управление релизами</h3>
            <p className="text-sm text-gray-500">Здесь будет отображаться список релизов.</p>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
              Участники команды ({members?.length ?? 0})
            </div>
            <div className="divide-y divide-gray-100">
              {(members ?? []).map((member: WorkspaceMember) => (
                <div key={member.user_id} className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-900">
                      {member.profiles?.display_name || 'Пользователь'}
                    </div>
                    <div className="text-xs text-gray-400">{member.user_id}</div>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-700 rounded uppercase">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};