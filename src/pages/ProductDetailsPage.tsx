import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { useCancelPublishedRelease, useDeleteProduct, useDeleteRelease } from '../features/workspaces/api/useWorkspaceDetails';
import { usePermissions } from '../features/workspaces/api/usePermissions';
import { CreateReleaseModal } from '../features/auth/ui/CreateReleaseModal';
import { useProductDetails, useProductReleases, useWorkspaceMembers } from '../features/workspaces/api/useWorkspaceDetails';
import { useProductReleasesRealtime } from '../shared/api/useSupabaseRealtime';

interface ProductRelease {
  id: string;
  version: string;
  title: string;
  status: string;
  planned_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
}

export const ProductDetailsPage = () => {
  const { workspaceId, productId } = useParams<{ workspaceId: string; productId: string }>();
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const resolvedWorkspaceId = workspaceId ?? '';
  const resolvedProductId = productId ?? '';

  const {
    data: product,
    isLoading: isProductLoading,
    isError: isProductError,
    error: productError,
  } = useProductDetails(resolvedProductId);

  const { data: members } = useWorkspaceMembers(resolvedWorkspaceId);
  const permissions = usePermissions(members);

  const deleteProduct = useDeleteProduct(resolvedWorkspaceId);
  const deleteRelease = useDeleteRelease(resolvedWorkspaceId);
  const cancelPublishedRelease = useCancelPublishedRelease(resolvedWorkspaceId);

  const {
    data: releases,
    isLoading: isReleasesLoading,
    isError: isReleasesError,
    error: releasesError,
  } = useProductReleases(resolvedProductId);

  useProductReleasesRealtime(resolvedProductId);

  const handleDeleteRelease = async (releaseId: string) => {
    if (!window.confirm('Удалить релиз?')) return;

    try {
      await deleteRelease.mutateAsync(releaseId);
    } catch (error) {
      window.alert((error as Error)?.message || 'Не удалось удалить релиз');
    }
  };

  const handleCancelPublishedRelease = async (releaseId: string) => {
    if (!window.confirm('Отменить публикацию релиза?')) return;

    try {
      await cancelPublishedRelease.mutateAsync(releaseId);
    } catch (error) {
      window.alert((error as Error)?.message || 'Не удалось отменить публикацию релиза');
    }
  };

  const BackHeader = () => (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <button
          onClick={() => navigate(`/workspaces/${resolvedWorkspaceId}`)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 transition"
        >
          ← Назад к пространству
        </button>
      </div>
    </header>
  );

  if (isAuthLoading || !resolvedWorkspaceId || !resolvedProductId || isProductLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader />
        <div className="p-8 text-center text-gray-500 font-medium">Загрузка продукта...</div>
      </div>
    );
  }

  if (isProductError || !product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1">Ошибка загрузки продукта</h2>
            <p className="text-sm mb-3">Продукт не найден или у вас нет к нему доступа.</p>
            {productError && (
              <div className="text-xs bg-red-100/80 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                Детали: {(productError as Error).message}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BackHeader />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Продукт</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{product.name}</h1>
              <p className="text-sm text-gray-500 mt-2">Slug: {product.slug}</p>
              {product.description && (
                <p className="text-sm text-gray-600 mt-3">{product.description}</p>
              )}
            </div>
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex flex-col gap-2">
              <div>Пользователь: {user?.email ?? 'неизвестно'}</div>
              <div>Ваша роль: {permissions.role}</div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-gray-900">Релизы продукта</h2>
          <div className="flex gap-2">
            {permissions.canCreateRelease && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 text-sm"
              >
                + Создать релиз
              </button>
            )}
            {permissions.canDeleteProduct && (
              <button
                onClick={() => {
                  if (window.confirm('Удалить продукт? Все связанные релизы и изменения тоже будут удалены.')) {
                    deleteProduct.mutate(resolvedProductId);
                  }
                }}
                disabled={deleteProduct.isPending}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                Удалить продукт
              </button>
            )}
          </div>
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
        ) : releases && releases.length > 0 ? (
          <div className="grid gap-4">
            {releases.map((release: ProductRelease) => (
              <div key={release.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition">
                <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-start">
                  <Link
                    to={`/workspaces/${resolvedWorkspaceId}/releases/${release.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-indigo-600">{release.version}</span>
                        <span className="px-2 py-1 rounded-full text-[11px] font-semibold uppercase bg-gray-100 text-gray-700">
                          {release.status}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 mt-2 truncate">{release.title}</h3>
                    </div>
                  </Link>
                  <div className="flex flex-col gap-2 md:items-end md:min-w-55">
                    <div className="text-sm text-gray-500 text-left md:text-right">
                      <div>
                        {release.planned_at ? `Планируется: ${new Date(release.planned_at).toLocaleDateString('ru-RU')}` : 'Дата не указана'}
                      </div>
                      <div className="mt-1">
                        {release.published_at
                          ? `Опубликовано: ${new Date(release.published_at).toLocaleDateString('ru-RU')}`
                          : 'Не опубликовано'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {permissions.canCancelPublishedRelease && release.status === 'published' && (
                        <button
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleCancelPublishedRelease(release.id);
                          }}
                          disabled={cancelPublishedRelease.isPending}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
                        >
                          Отменить публикацию
                        </button>
                      )}
                      {permissions.canDeleteRelease && (
                        <button
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteRelease(release.id);
                          }}
                          disabled={deleteRelease.isPending}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
            Для этого продукта ещё нет релизов
          </div>
        )}
      </main>

      <CreateReleaseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        productId={resolvedProductId}
      />
    </div>
  );
};
