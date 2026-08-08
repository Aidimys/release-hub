import type { ActivitySectionProps } from '../../../features/workspaces/hooks/useReleaseDetailsPage';

export const ActivitySection = ({ activity, isActivityLoading, isActivityCollapsed, setIsActivityCollapsed }: ActivitySectionProps) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold text-gray-900">Журнал действий</h2>
        <button
          type="button"
          onClick={() => setIsActivityCollapsed((value: boolean) => !value)}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
        {isActivityCollapsed ? 'Развернуть' : 'Свернуть'}
      </button>
    </div>
    {isActivityLoading ? (
      <div className="h-16 bg-gray-200 animate-pulse rounded-xl" />
    ) : activity && activity.length > 0 && !isActivityCollapsed ? (
      <div className="space-y-3">
        {activity.map((item) => {
          const payload = (item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
            ? item.payload as Record<string, unknown>
            : {}) as Record<string, unknown>;
          const actorName = item.profiles?.display_name || 'Пользователь';
          const fromValue = typeof payload.from === 'string' ? payload.from : null;
          const toValue = typeof payload.to === 'string' ? payload.to : null;
          const message = item.event_type === 'status_changed'
            ? fromValue && toValue
              ? `${actorName}: ${fromValue} → ${toValue}`
              : `${actorName}: статус изменён`
            : item.event_type === 'vote_submitted'
              ? `${actorName}: голос ${payload.decision === 'approved' ? 'за' : 'против'}`
              : `${actorName}: добавлено изменение`;
          return (
            <div key={item.id} className="rounded-xl border border-gray-200 p-3">
              <div className="text-sm font-medium text-gray-900">{message}</div>
              <div className="text-xs text-gray-500 mt-1">{item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : '—'}</div>
            </div>
          );
        })}
      </div>
    ) : (
      <p className="text-sm text-gray-500">
        {isActivityCollapsed ? 'Список логов скрыт' : 'Событий ещё нет.'}
      </p>
    )}
  </div>
);
