import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { useWorkspace, useProducts, useWorkspaceMembers, useWorkspaceReleases } from '../features/workspaces/api/useWorkspaceDetails';
import { useWorkspaceRealtime } from '../shared/api/useSupabaseRealtime';
import { supabase } from '../shared/api/supabase';


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

interface WorkspaceRelease {
  id: string;
  version: string;
  title: string;
  status: string;
  planned_at?: string | null;
  created_at?: string | null;
  products?: {
    id: string;
    name: string;
    workspace_id: string;
  } | null;
  [key: string]: unknown;
}

export const WorkspaceDetailsPage = () => {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'owner' | 'maintainer' | 'contributor'>('contributor');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  const workspaceId = routeWorkspaceId ?? '';
  useWorkspaceRealtime(workspaceId);
  const { data: workspace, isLoading: isWsLoading, isError: isWsError, error: wsError } =
    useWorkspace(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const {
    data: products,
    isLoading: isProductsLoading,
    isError: isProductsError,
    error: productsError,
  } = useProducts(workspaceId);
  const {
    data: releases,
    isLoading: isReleasesLoading,
    isError: isReleasesError,
    error: releasesError,
  } = useWorkspaceReleases(workspaceId);

  const statusFilter = searchParams.get('status') ?? 'all';
  const searchFilter = searchParams.get('search') ?? '';
  const sortOrder = searchParams.get('sort') ?? 'date-desc';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = 5;

  const filteredReleases = useMemo(() => {
    if (!releases) return [];

    const normalized = releases.filter((release: WorkspaceRelease) => {
      const matchesStatus = statusFilter === 'all' || release.status === statusFilter;
      const haystack = `${release.title} ${release.version}`.toLowerCase();
      const matchesSearch = haystack.includes(searchFilter.toLowerCase());
      return matchesStatus && matchesSearch;
    });

    const sorted = [...normalized].sort((a, b) => {
      const dateA = new Date(a.created_at ?? 0).getTime();
      const dateB = new Date(b.created_at ?? 0).getTime();
      return sortOrder === 'date-asc' ? dateA - dateB : dateB - dateA;
    });

    return sorted;
  }, [releases, searchFilter, sortOrder, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReleases.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedReleases = filteredReleases.slice((safePage - 1) * pageSize, safePage * pageSize);

  const updateParams = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(next).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    if (!params.get('page')) {
      params.set('page', '1');
    }

    setSearchParams(params);
  };

  // 1. Состояние загрузки
  if (isAuthLoading || !workspaceId || isWsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
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

  const handleInviteMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberEmail.trim()) return;

    if (userRole !== 'owner' && userRole !== 'maintainer') {
      setMemberError('Только owner и maintainer могут приглашать участников');
      return;
    }

    setMemberError(null);
    setMemberSuccess(null);

    try {
      const { data: profile, error: profileError } = await supabase.rpc('find_profile_by_email', {
        email_input: memberEmail.trim(),
      });

      if (profileError) throw new Error(profileError.message);
      const profiles = profile as Array<{ id: string }> | null | undefined;
      const invitedUserId = profiles?.[0]?.id;
      if (!invitedUserId) {
        setMemberError('Пользователь не найден по email');
        return;
      }

      if (memberRole === 'owner') {
        setMemberError('Приглашённый пользователь не может быть owner');
        return;
      }

      const { error } = await supabase.from('workspace_members').insert({
        workspace_id: workspaceId,
        user_id: invitedUserId,
        role: memberRole,
      });

      if (error) throw new Error(error.message);
      setMemberEmail('');
      setMemberRole('contributor');
      setMemberSuccess('Участник добавлен');
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось добавить участника');
    }
  };

  const handleMemberRoleChange = async (memberUserId: string | null, nextRole: 'owner' | 'maintainer' | 'contributor') => {
    if (!memberUserId) return;

    const targetMember = members?.find((member: WorkspaceMember) => member.user_id === memberUserId);
    if (userRole !== 'owner' && nextRole === 'owner') {
      setMemberError('Только owner может назначать роль owner');
      return;
    }

    if (userRole !== 'owner' && targetMember?.role === 'owner') {
      setMemberError('Только owner может изменять роль owner');
      return;
    }

    try {
      const { error } = await supabase
        .from('workspace_members')
        .update({ role: nextRole })
        .eq('workspace_id', workspaceId)
        .eq('user_id', memberUserId);

      if (error) throw new Error(error.message);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось обновить роль');
    }
  };

  const handleRemoveMember = async (memberUserId: string | null) => {
    if (!memberUserId) return;

    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', memberUserId);

      if (error) throw new Error(error.message);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось удалить участника');
    }
  };

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
            ) : isProductsError ? (
              <div className="text-center py-8 bg-red-50 rounded-xl border border-red-200 text-red-700">
                Ошибка загрузки продуктов.
                {productsError && (
                  <div className="mt-2 text-xs bg-red-100 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                    {(productsError as Error).message}
                  </div>
                )}
              </div>
            ) : products && products.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product: WorkspaceProduct) => (
                  <Link
                    key={product.id}
                    to={`/workspaces/${workspaceId}/products/${product.id}`}
                    className="block bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition"
                  >
                    <h3 className="font-bold text-gray-900">{product.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">Slug: {product.slug}</p>
                  </Link>
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
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">Список релизов</h2>
            </div>

            {isReleasesLoading ? (
              <div className="h-24 bg-gray-200 animate-pulse rounded-xl" />
            ) : isReleasesError ? (
              <div className="text-center py-8 bg-red-50 rounded-xl border border-red-200 text-red-700">
                Ошибка загрузки релизов.
                {releasesError && (
                  <div className="mt-2 text-xs bg-red-100 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                    {(releasesError as Error).message}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 grid gap-3 md:grid-cols-4">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(event) => updateParams({ search: event.target.value, page: '1' })}
                    placeholder="Поиск по названию или версии"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                  <select
                    value={statusFilter}
                    onChange={(event) => updateParams({ status: event.target.value, page: '1' })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    <option value="all">Все статусы</option>
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="published">Published</option>
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(event) => updateParams({ sort: event.target.value, page: '1' })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    <option value="date-desc">Сначала новые</option>
                    <option value="date-asc">Сначала старые</option>
                  </select>
                  <button
                    onClick={() => updateParams({ search: null, status: 'all', sort: 'date-desc', page: '1' })}
                    className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Сбросить
                  </button>
                </div>

                {filteredReleases.length > 0 ? (
                  <div className="grid gap-4">
                    {pagedReleases.map((release: WorkspaceRelease) => (
                      <Link
                        key={release.id}
                        to={`/workspaces/${workspaceId}/releases/${release.id}`}
                        className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:justify-between md:items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-indigo-600">{release.version}</span>
                              <span className="px-2 py-1 rounded-full text-[11px] font-semibold uppercase bg-gray-100 text-gray-700">
                                {release.status}
                              </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 mt-2">{release.title}</h3>
                            <p className="text-sm text-gray-500 mt-1">
                              Продукт: {release.products?.name ?? 'Неизвестно'}
                            </p>
                          </div>
                          <div className="text-sm text-gray-500">
                            {release.planned_at
                              ? `Планируется: ${new Date(release.planned_at).toLocaleDateString('ru-RU')}`
                              : 'Дата не указана'}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
                    По вашему запросу релизы не найдены
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex justify-between items-center pt-2">
                    <button
                      onClick={() => updateParams({ page: String(Math.max(1, safePage - 1)) })}
                      disabled={safePage === 1}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 disabled:opacity-50"
                    >
                      ← Назад
                    </button>
                    <div className="text-sm text-gray-500">
                      Страница {safePage} из {totalPages}
                    </div>
                    <button
                      onClick={() => updateParams({ page: String(Math.min(totalPages, safePage + 1)) })}
                      disabled={safePage === totalPages}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 disabled:opacity-50"
                    >
                      Вперёд →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            {(userRole === 'owner' || userRole === 'maintainer') ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
                  Пригласить участника
                </div>
                <form onSubmit={handleInviteMember} className="p-4 space-y-3">
                  {memberError && <div className="text-sm text-red-700 bg-red-100 rounded-lg p-3">{memberError}</div>}
                  {memberSuccess && <div className="text-sm text-green-700 bg-green-100 rounded-lg p-3">{memberSuccess}</div>}
                  <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_auto]">
                    <input
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="Email пользователя"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    />
                    <select
                      value={memberRole}
                      onChange={(event) => setMemberRole(event.target.value as 'owner' | 'maintainer' | 'contributor')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                    >
                      <option value="contributor">Contributor</option>
                      <option value="maintainer">Maintainer</option>
                    </select>
                    <button type="submit" className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white">
                      Добавить
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
                У вас нет прав приглашать участников в это пространство.
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
                Участники команды ({members?.length ?? 0})
              </div>
              <div className="divide-y divide-gray-100">
                {(members ?? []).map((member: WorkspaceMember) => (
                  <div key={member.user_id} className="p-4 flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                    <div>
                      <div className="font-medium text-gray-900">
                        {member.profiles?.display_name || 'Пользователь'}
                      </div>
                      <div className="text-xs text-gray-400">{member.user_id}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={member.role}
                        onChange={(event) => handleMemberRoleChange(member.user_id, event.target.value as 'owner' | 'maintainer' | 'contributor')}
                        className="px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-900"
                        disabled={member.role === 'owner' && userRole !== 'owner'}
                      >
                        <option value="contributor">Contributor</option>
                        <option value="maintainer">Maintainer</option>
                        {userRole === 'owner' && <option value="owner">Owner</option>}
                      </select>
                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};