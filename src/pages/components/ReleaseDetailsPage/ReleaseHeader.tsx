import type { ReleaseHeaderProps } from '../../../features/workspaces/hooks/useReleaseDetailsPage';

export const ReleaseHeader = ({ release, releaseStatus, permissions, deleteRelease, cancelPublishedRelease, setIsDeleteModalOpen, setIsCancelModalOpen }: ReleaseHeaderProps) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
    <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-start">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Release</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{release.title}</h1>
        <p className="text-sm text-gray-500 mt-2">Версия: {release.version}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
          <span className="rounded-full bg-gray-100 px-3 py-1">Продукт: {release.products?.name ?? 'Неизвестен'}</span>
          <span className="rounded-full bg-gray-100 px-3 py-1">Планируется: {release.planned_at ? new Date(release.planned_at).toLocaleDateString('ru-RU') : 'Не указана'}</span>
          <span className="rounded-full bg-gray-100 px-3 py-1">Опубликовано: {release.published_at ? new Date(release.published_at).toLocaleDateString('ru-RU') : 'Не опубликовано'}</span>
        </div>
        {release.description && <p className="text-sm text-gray-600 mt-3">{release.description}</p>}
      </div>
      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex flex-col gap-2">
        <div>Статус: <span className="font-semibold text-gray-700">{releaseStatus}</span></div>
        <div className="text-xs text-gray-500">Действия доступны согласно вашей роли.</div>
        <div className="flex flex-wrap gap-2 pt-1">
          {permissions.canDeleteRelease && (
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              disabled={deleteRelease.isPending}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Удалить релиз
            </button>
          )}
          {permissions.canCancelPublishedRelease && releaseStatus === 'published' && (
            <button
              onClick={() => setIsCancelModalOpen(true)}
              disabled={cancelPublishedRelease.isPending}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            >
              Отменить публикацию
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
);
