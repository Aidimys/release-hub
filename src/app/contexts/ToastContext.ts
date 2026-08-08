import { createContext } from 'react';

export interface ToastItem {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info' | 'warning';
}

export interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, variant?: 'success' | 'error' | 'info' | 'warning') => void;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
