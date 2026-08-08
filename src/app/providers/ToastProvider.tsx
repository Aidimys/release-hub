import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastItem } from '../contexts/ToastContext';

export { ToastContext };

let toastCounter = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, variant: ToastItem['variant'] = 'info') => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const toast: ToastItem = { id, message, variant };

    setToasts((current) => [...current, toast]);

    const timer = setTimeout(() => {
      dismissToast(id);
    }, 4000);

    timers.current.set(id, timer);

    return id;
  }, [dismissToast]);

  useEffect(() => {
    const timersCopy = timers.current;
    return () => {
      timersCopy.forEach((timer) => clearTimeout(timer));
      timersCopy.clear();
    };
  }, []);

  const variantStyles: Record<ToastItem['variant'], string> = {
    success: 'border-emerald-400/60 bg-emerald-50 text-emerald-900',
    error: 'border-red-400/60 bg-red-50 text-red-900',
    info: 'border-indigo-400/60 bg-indigo-50 text-indigo-900',
    warning: 'border-amber-400/60 bg-amber-50 text-amber-900',
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md transition-all ${variantStyles[toast.variant]}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="opacity-70 hover:opacity-100 transition"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
