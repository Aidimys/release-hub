import { useOfflineStatus } from '../../shared/hooks/useOfflineStatus';

export const OfflineBanner = () => {
  const { isOnline, showOfflineBanner, acknowledgeOffline } = useOfflineStatus();

  if (isOnline || !showOfflineBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 text-sm font-medium shadow-md flex items-center justify-between">
      <span>Нет соединения с интернетом. Некоторые функции могут быть недоступны.</span>
      <button
        type="button"
        onClick={acknowledgeOffline}
        className="ml-4 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 transition"
      >
        Скрыть
      </button>
    </div>
  );
};
