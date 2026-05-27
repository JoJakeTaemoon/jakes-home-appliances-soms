"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Optional footer slot — rendered at the bottom of the modal. */
  footer?: React.ReactNode;
  /** Sizes — default `md` (~520px). */
  size?: "sm" | "md" | "lg" | "xl";
  /** Block closing when clicking the backdrop. Default false. */
  disableBackdropClose?: boolean;
}

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/**
 * Custom modal — no native <dialog>, no shadcn. Renders into document.body
 * via portal, locks body scroll, traps focus to the modal container, and
 * closes on Escape + backdrop click (unless disabled).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  disableBackdropClose,
}: Readonly<Props>) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus the modal container on open (basic focus management; not a true
  // a11y focus trap but better than nothing — Phase 2 baseline).
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (el) {
      const focusable = el.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? el).focus();
    }
  }, [open]);

  const onBackdrop = useCallback(() => {
    if (!disableBackdropClose) onClose();
  }, [disableBackdropClose, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 sm:items-center sm:pt-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBackdrop();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-2xl bg-white shadow-xl ring-1 ring-[#e5e5e5] outline-none",
          SIZES[size],
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[#e5e5e5] px-5 py-4">
            <h2 className="text-base font-semibold text-[#111111]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-[#737373] hover:bg-[#f5f5f5] hover:text-[#111111]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[#e5e5e5] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
