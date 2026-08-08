import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAppRealtime } from '../../shared/api/useSupabaseRealtime';

const RealtimeProvider = ({ children, onRealtimeUpdate }: { children: ReactNode; onRealtimeUpdate: (message: string) => void }) => {
  useAppRealtime(onRealtimeUpdate);
  return <>{children}</>;
};

export const QueryProvider = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            onError: (error: unknown) => {
              const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
              console.error('[Mutation]', message);
            },
          },
        },
      })
  );

  const [realtimeMessage, setRealtimeMessage] = useState<string | null>(null);

  const onRealtimeUpdate = useCallback((message: string) => {
    setRealtimeMessage(message);
  }, []);

  useEffect(() => {
    if (!realtimeMessage) return;
    const timeout = window.setTimeout(() => setRealtimeMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [realtimeMessage]);

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider onRealtimeUpdate={onRealtimeUpdate}>{children}</RealtimeProvider>
      {realtimeMessage && (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl bg-slate-900/95 text-white shadow-xl ring-1 ring-white/20 px-4 py-3 text-sm font-medium backdrop-blur-md">
          {realtimeMessage}
        </div>
      )}
    </QueryClientProvider>
  );
};