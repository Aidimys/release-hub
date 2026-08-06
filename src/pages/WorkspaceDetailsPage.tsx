import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { useWorkspace, useProducts, useWorkspaceMembers, useWorkspaceReleases, useWorkspaceActivity, useWorkspaceInvites, useCreateInvite, useRevokeInvite, useResendInvite, useDeleteProduct, useDeleteRelease, useCancelPublishedRelease, type WorkspaceMember, type WorkspaceInvite } from '../features/workspaces/api/useWorkspaceDetails';
import { usePermissions } from '../features/workspaces/api/usePermissions';
import { useWorkspaceRealtime } from '../shared/api/useSupabaseRealtime';
import { supabase } from '../shared/api/supabase';


type Tab = 'products' | 'releases' | 'members' | 'activity';

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
  published_at?: string | null;
  products?: {
    id: string;
    name: string;
    workspace_id: string;
  } | null;
  [key: string]: unknown;
}

interface WorkspaceActivityItem {
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
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const workspaceId = routeWorkspaceId ?? '';
  useWorkspaceRealtime(workspaceId);
  const { data: workspace, isLoading: isWsLoading, isError: isWsError, error: wsError } =
    useWorkspace(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: invites } = useWorkspaceInvites(workspaceId);
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
  const {
    data: activity,
    isLoading: isActivityLoading,
  } = useWorkspaceActivity(workspaceId);

  const deleteProduct = useDeleteProduct(workspaceId);
  const deleteRelease = useDeleteRelease(workspaceId);
  const cancelPublishedRelease = useCancelPublishedRelease(workspaceId);
  const createInvite = useCreateInvite(workspaceId);
  const revokeInvite = useRevokeInvite(workspaceId);
  const resendInvite = useResendInvite(workspaceId);

  const permissions = usePermissions(members);

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
  const safePage = Math.min(Number.isFinite(page) ? page : 1, totalPages);
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

  const ownerCount = useMemo(() => {
    return members?.filter((m) => m.role === 'owner').length ?? 0;
  }, [members]);

  const isLastOwner = useMemo(() => {
    if (!user?.id) return false;
    const currentMember = members?.find((m) => m.user_id === user.id);
    return currentMember?.role === 'owner' && ownerCount <= 1;
  }, [user, members, ownerCount]);

  const handleInviteMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberEmail.trim()) return;

    setMemberError(null);
    setMemberSuccess(null);
    setInviteToken(null);

    try {
      const token = await createInvite.mutateAsync({
        email: memberEmail.trim(),
        role: memberRole,
      });

      setMemberEmail('');
      setMemberRole('contributor');
      setMemberSuccess(`Приглашение отправлено на ${memberEmail.trim()}. Поделитесь этим токеном с пользователем.`);
      setInviteToken(token);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось пригласить участника');
    }
  };

  const handleMemberRoleChange = async (memberUserId: string | null, nextRole: 'owner' | 'maintainer' | 'contributor') => {
    if (!memberUserId) return;

    const targetMember = members?.find((member) => member.user_id === memberUserId);
    if (targetMember?.role === 'owner' && nextRole !== 'owner' && isLastOwner) {
      setMemberError('Нельзя понизить роль последнего owner');
      return;
    }

    try {
      const { error } = await supabase.rpc('change_member_role', {
        p_workspace_id: workspaceId,
        p_target_user_id: memberUserId,
        p_new_role: nextRole,
      });

      if (error) throw new Error(error.message);
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось обновить роль');
    }
  };

  const handleRemoveMember = async (memberUserId: string | null) => {
    if (!memberUserId) return;

    const targetMember = members?.find((member) => member.user_id === memberUserId);
    if (targetMember?.role === 'owner' && isLastOwner) {
      setMemberError('Нельзя удалить последнего owner');
      return;
    }

    try {
      const { error } = await supabase.rpc('remove_member', {
        p_workspace_id: workspaceId,
        p_target_user_id: memberUserId,
      });

      if (error) throw new Error(error.message);
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось удалить участника');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvite.mutateAsync(inviteId);
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось отозвать приглашение');
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      const newToken = await resendInvite.mutateAsync(inviteId);
      setMemberError(null);
      setInviteToken(newToken);
      setMemberSuccess('Приглашение повторно отправлено. Новый токен создан.');
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось повторно отправить приглашение');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteProduct.mutateAsync(productId);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось удалить продукт');
    }
  };

  const handleDeleteRelease = async (releaseId: string) => {
    try {
      await deleteRelease.mutateAsync(releaseId);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось удалить релиз');
    }
  };

  const handleCancelPublishedRelease = async (releaseId: string) => {
    try {
      await cancelPublishedRelease.mutateAsync({ releaseId });
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось отменить релиз');
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
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
              Ваша роль: {permissions.role}
            </span>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-8">
          {(['products', 'releases', 'members', 'activity'] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = {
              products: 'Продукты',
              releases: 'Релизы',
              members: 'Участники',
              activity: 'Журнал активности',
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

      <main className="max-w-6xl mx-auto px-4 py-8">
        {memberError && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">{memberError}</div>
        )}
        {memberSuccess && (
          <div className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-lg">{memberSuccess}</div>
        )}

        {activeTab === 'products' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">Список продуктов</h2>
              {permissions.canCreateProduct && (
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
                  <div key={product.id} className="block bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
                    <Link to={`/workspaces/${workspaceId}/products/${product.id}`}>
                      <h3 className="font-bold text-gray-900">{product.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">Slug: {product.slug}</p>
                    </Link>
                    {permissions.canDeleteProduct && (
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        disabled={deleteProduct.isPending}
                        className="mt-3 px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    )}
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
                <div className="bg-white rounded-xl border border-gray-200 p-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
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
                      <div key={release.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
                        <Link to={`/workspaces/${workspaceId}/releases/${release.id}`}>
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
                            <div className="text-sm text-gray-500 text-left md:text-right">
                              <div>
                                {release.planned_at
                                  ? `Планируется: ${new Date(release.planned_at).toLocaleDateString('ru-RU')}`
                                  : 'Дата не указана'}
                              </div>
                              <div className="mt-1">
                                {release.published_at
                                  ? `Опубликовано: ${new Date(release.published_at).toLocaleDateString('ru-RU')}`
                                  : 'Не опубликовано'}
                              </div>
                            </div>
                          </div>
                        </Link>
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                          {permissions.canDeleteRelease && (
                            <button
                              onClick={() => handleDeleteRelease(release.id)}
                              disabled={deleteRelease.isPending}
                              className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                            >
                              Удалить
                            </button>
                          )}
                          {permissions.canCancelPublishedRelease && release.status === 'published' && (
                            <button
                              onClick={() => handleCancelPublishedRelease(release.id)}
                              disabled={cancelPublishedRelease.isPending}
                              className="px-3 py-1 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50"
                            >
                              Отменить публикацию
                            </button>
                          )}
                        </div>
                      </div>
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

        {activeTab === 'activity' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">Журнал активности</h2>
            </div>

            {isActivityLoading ? (
              <div className="h-24 bg-gray-200 animate-pulse rounded-xl" />
            ) : activity && activity.length > 0 ? (
              <div className="space-y-3">
                {activity.map((item: WorkspaceActivityItem) => {
                  const payload = (item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
                    ? item.payload as Record<string, unknown>
                    : {}) as Record<string, unknown>;
                  const actorName = item.profiles?.display_name || 'Пользователь';
                  const releaseTitle = item.releases?.title || 'релиз';
                  const releaseVersion = item.releases?.version ? ` ${item.releases.version}` : '';
                  const productName = item.releases?.products?.name ? ` (${item.releases.products.name})` : '';
                  const fromValue = typeof payload.from === 'string' ? payload.from : null;
                  const toValue = typeof payload.to === 'string' ? payload.to : null;
                  const message = fromValue && toValue
                    ? `${actorName}: ${releaseTitle}${releaseVersion}${productName} → ${toValue}`
                    : `${actorName}: ${releaseTitle}${releaseVersion}${productName}`;

                  return (
                    <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="text-sm font-medium text-gray-900">{message}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
                В этом пространстве пока нет событий журнала
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            {permissions.canManageMembers ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
                  Пригласить участника
                </div>
                <form onSubmit={handleInviteMember} className="p-4 space-y-3">
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
                      Пригласить
                    </button>
                  </div>
                  {createInvite.isPending && (
                    <div className="text-xs text-gray-500">Создание приглашения...</div>
                  )}
                </form>
                {inviteToken && (
                  <div className="p-3 bg-indigo-50 border-t border-indigo-200">
                    <div className="text-xs text-indigo-700 font-medium mb-2">
                      Приглашение создано. Поделитесь этой ссылкой с пользователем:
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono break-all text-indigo-800 bg-white p-2 rounded border border-indigo-200">
                        {`${window.location.origin}/accept-invite?token=${inviteToken}`}
                      </code>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(
                            `${window.location.origin}/accept-invite?token=${inviteToken}`
                          );
                          setMemberSuccess('Ссылка скопирована в буфер обмена');
                        }}
                        className="px-3 py-1 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-100 shrink-0"
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
                У вас нет прав приглашать участников в это пространство.
              </div>
             )}

            {invites && invites.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
                  Ожидающие приглашения
                </div>
                <div className="divide-y divide-gray-100">
                  {invites.map((invite: WorkspaceInvite) => {
                    const isPending = invite.status === 'pending';
                    const isExpired = invite.status === 'expired' || (new Date(invite.expires_at) < new Date());
                    const isAccepted = invite.status === 'accepted';
                    const isRevoked = invite.status === 'revoked';
                    const canAct = permissions.role === 'owner' && isPending;

                    let statusLabel = '';
                    if (isPending) statusLabel = 'Ожидает подтверждения';
                    else if (isExpired) statusLabel = 'Просрочено';
                    else if (isAccepted) statusLabel = 'Принято';
                    else if (isRevoked) statusLabel = 'Отозвано';

                    return (
                      <div key={invite.id} className="p-4 flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                        <div>
                          <div className="font-medium text-gray-900">{invite.email}</div>
                          <div className="text-xs text-gray-400">Роль: {invite.role}</div>
                          <div className="text-xs text-gray-400">Статус: {statusLabel}</div>
                          <div className="text-xs text-gray-400">
                            Истекает: {new Date(invite.expires_at).toLocaleString('ru-RU')}
                          </div>
                        </div>
                        {canAct && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResendInvite(invite.id)}
                              disabled={resendInvite.isPending}
                              className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Повторить
                            </button>
                            <button
                              onClick={() => handleRevokeInvite(invite.id)}
                              disabled={revokeInvite.isPending}
                              className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              Отозвать
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                      {member.invited_email && (
                        <div className="text-xs text-gray-400">Приглашён: {member.invited_email}</div>
                      )}
                      {member.status && member.status !== 'active' && (
                        <div className="text-xs text-gray-400">Статус: {member.status}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {member.user_id !== user?.id && permissions.role === 'owner' && (
                        <select
                          value={member.role}
                          onChange={(event) => handleMemberRoleChange(member.user_id, event.target.value as 'owner' | 'maintainer' | 'contributor')}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-900"
                          disabled={member.role === 'owner' && permissions.role !== 'owner'}
                        >
                          <option value="contributor">Contributor</option>
                          <option value="maintainer">Maintainer</option>
                          <option value="owner">Owner</option>
                        </select>
                      )}
                      {member.user_id !== user?.id && permissions.role !== 'owner' && (
                        <span className="text-sm text-gray-500 px-2 py-1">{member.role}</span>
                      )}
                      {member.user_id === user?.id && (
                        <span className="text-sm text-gray-500 px-2 py-1">{member.role}</span>
                      )}
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