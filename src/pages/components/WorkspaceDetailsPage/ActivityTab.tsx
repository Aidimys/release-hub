import type { ActivityTabProps } from '../../../features/workspaces/hooks/useWorkspaceDetailsPage';

export const ActivityTab = ({ activity, isActivityLoading }: ActivityTabProps) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-gray-900">Журнал активности</h2>
      </div>

      {isActivityLoading ? (
        <div className="h-24 bg-gray-200 animate-pulse rounded-xl" />
      ) : activity && activity.length > 0 ? (
        <div className="space-y-3">
          {activity.map((item) => {
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
  );
};
