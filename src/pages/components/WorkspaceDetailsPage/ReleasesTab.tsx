import type { ReleasesTabProps } from '../../../features/workspaces/hooks/useWorkspaceDetailsPage';

export const ReleasesTab = ({ filteredReleases, pagedReleases, totalPages, safePage, statusFilter, searchFilter, sortOrder, updateParams, permissions, workspaceId, handleDeleteRelease, handleCancelPublishedRelease, deleteRelease, cancelPublishedRelease }: ReleasesTabProps) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-gray-900">Список релизов</h2>
      </div>

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
            {pagedReleases.map((release) => (
              <div key={release.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
                <a href={`/workspaces/${workspaceId}/releases/${release.id}`}>
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
                </a>
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
                      onClick={() => handleCancelPublishedRelease(release.id, release.updated_at)}
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
    </div>
  );
};
