import { useEffect, useState } from 'react';

const OFFLINE_STORAGE_KEY = 'release-hub-offline-acknowledged-at';

const writeAcknowledgedAt = (timestamp: number) => {
  try {
    localStorage.setItem(OFFLINE_STORAGE_KEY, String(timestamp));
  } catch {
    // ignore storage errors
  }
};

interface UseOfflineStatusResult {
  isOnline: boolean;
  showOfflineBanner: boolean;
  acknowledgeOffline: () => void;
}

export const useOfflineStatus = (): UseOfflineStatusResult => {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineBanner(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const acknowledgeOffline = () => {
    setShowOfflineBanner(false);
    writeAcknowledgedAt(Date.now());
  };

  return {
    isOnline,
    showOfflineBanner,
    acknowledgeOffline,
  };
};
