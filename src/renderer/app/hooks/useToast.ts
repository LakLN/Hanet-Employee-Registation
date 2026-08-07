import { useEffect, useRef, useState } from 'react';

export type ToastType = 'success' | 'error';
export type ToastMessage = { type: ToastType; message: string };

export function useToast(durationMs = 4000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setToast(null), durationMs);
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [toast, durationMs]);

  const notify = (type: ToastType, message: string) => setToast({ type, message });

  return { toast, notify };
}
