"use client";

/**
 * Toast notification system. The `ToastProvider` mounts a portal-style
 * stack of dismissible cards in the bottom-right corner and registers
 * its push() callback with `src/lib/auth/global-handlers.ts` so non-React
 * code (the API client) can surface user-visible errors.
 *
 * Components inside the tree consume `useToast()`. Anything else (the API
 * client's fetch wrapper, the module-level error handlers) calls
 * `fireToast()` from global-handlers.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { registerToastPusher } from "@/lib/auth/global-handlers";

type Tone = "info" | "success" | "warning" | "error";

interface Toast {
  id: string;
  message: string;
  tone: Tone;
  expiresAt: number;
}

interface ToastContextValue {
  push: (message: string, opts?: { tone?: Tone; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 5000;

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, opts?: { tone?: Tone; durationMs?: number }) => {
      const id = `t-${++idCounter.current}`;
      const tone = opts?.tone ?? "info";
      const duration = opts?.durationMs ?? DEFAULT_DURATION;
      const expiresAt = Date.now() + duration;
      setToasts((prev) => {
        // Dedup identical message+tone fired within the same tick (e.g. two
        // queries 401 back-to-back) so the user doesn't see a stack of
        // identical cards.
        if (prev.some((t) => t.message === message && t.tone === tone)) {
          return prev;
        }
        return [...prev, { id, message, tone, expiresAt }];
      });
    },
    [],
  );

  // Sweep expired toasts every 250ms.
  useEffect(() => {
    if (toasts.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.expiresAt > now));
    }, 250);
    return () => clearInterval(interval);
  }, [toasts.length]);

  // Register with global-handlers so non-React callers can push toasts.
  useEffect(() => {
    return registerToastPusher((message, opts) => push(message, opts));
  }, [push]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<Tone, { bg: string; border: string; fg: string; icon: string }> = {
  info: { bg: "bg-white", border: "border-blue-300", fg: "text-blue-900", icon: "ℹ" },
  success: { bg: "bg-white", border: "border-green-300", fg: "text-green-900", icon: "✓" },
  warning: { bg: "bg-white", border: "border-orange-300", fg: "text-orange-900", icon: "⚠" },
  error: { bg: "bg-white", border: "border-red-300", fg: "text-red-900", icon: "✕" },
};

function ToastCard({ toast, onDismiss }: Readonly<{ toast: Toast; onDismiss: () => void }>) {
  const style = TONE_STYLES[toast.tone];
  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border-2 ${style.border} ${style.bg} px-3 py-2 shadow-lg`}
    >
      <span className={`text-base font-bold ${style.fg}`}>{style.icon}</span>
      <p className={`flex-1 text-sm ${style.fg}`}>{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-gray-400 hover:text-gray-700"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Don't throw — pages outside the provider (e.g. SSR) just no-op.
    return { push: () => undefined };
  }
  return ctx;
}
