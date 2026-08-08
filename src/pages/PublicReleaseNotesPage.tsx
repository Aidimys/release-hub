import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicReleaseNotes, usePublicReleaseChanges } from '../features/workspaces/api/usePublicReleaseNotes';
import { groupReleaseChangesByCategory, type ReleaseChangeCategory } from '../features/workspaces/utils/publicReleaseNotes';

interface PublicReleaseChangeRow {
  id: string;
  release_id: string;
  category: ReleaseChangeCategory;
  title: string;
  description: string;
  position: number;
}

export const PublicReleaseNotesPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const resolvedProductId = productId ?? '';

  const { data: releases = [], isLoading, isError } = usePublicReleaseNotes(resolvedProductId);

  const releaseIds = useMemo(() => releases.map((release) => release.id), [releases]);

  const { data: changes = [] } = usePublicReleaseChanges(releaseIds);

  const changesByReleaseId = useMemo(() => {
    const result = new Map<string, PublicReleaseChangeRow[]>();

    changes.forEach((change) => {
      const existing = result.get(change.release_id) ?? [];
      existing.push(change);
      result.set(change.release_id, existing);
    });

    return result;
  }, [changes]);

  useEffect(() => {
    document.title = releases.length > 0 ? `Release Notes · ${releases[0].products?.name ?? 'Product'}` : 'Release Notes';
  }, [releases]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Release Notes</p>
          <div className="mt-4 h-6 w-48 animate-pulse rounded bg-gray-200" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (isError || releases.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
          <h1 className="text-xl font-semibold">Публичные release notes недоступны</h1>
          <p className="mt-2 text-sm">Для этого продукта пока нет опубликованных релизов.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Release Notes</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">{releases[0].products?.name ?? 'Продукт'}</h1>
          <p className="mt-3 text-sm text-gray-600">Ниже показаны все опубликованные релизы для этого продукта.</p>
        </section>

        {releases.map((release) => {
          const groupedChanges = groupReleaseChangesByCategory(changesByReleaseId.get(release.id) ?? []);

          return (
            <section key={release.id} className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-start">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Release</p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">{release.title}</h2>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                    <span className="rounded-full bg-gray-100 px-3 py-1">Версия: {release.version}</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1">Дата: {release.published_at ? new Date(release.published_at).toLocaleDateString('ru-RU') : 'Не указана'}</span>
                  </div>
                </div>
              </div>

              {release.description && <p className="mt-5 text-base leading-7 text-gray-700">{release.description}</p>}

              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900">Что изменилось</h3>
                {groupedChanges.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">Для этого релиза пока нет опубликованных изменений.</p>
                ) : (
                  <div className="mt-6 space-y-6">
                    {groupedChanges.map((group) => (
                      <div key={group.category}>
                        <h3 className="text-lg font-semibold text-gray-900">{group.label}</h3>
                        <ul className="mt-3 space-y-3">
                          {group.changes.map((change) => (
                            <li key={change.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                              <div className="font-medium text-gray-900">{change.title}</div>
                              {change.description && <p className="mt-1 text-sm leading-6 text-gray-600">{change.description}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};