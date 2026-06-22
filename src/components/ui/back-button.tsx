"use client";

/**
 * BackButton — "go back" navigation that prefers in-app history when
 * one exists, otherwise falls back to a parent route.
 *
 * Heuristic for "in-app history":
 *   - `document.referrer` is set AND its origin matches the current
 *     origin → the user navigated into this page from somewhere inside
 *     our app, so `router.back()` will land them on a meaningful page.
 *   - Otherwise (direct link / new tab / external referrer) → push the
 *     `fallback` route so we never strand the user on the previous
 *     external tab.
 *
 * The check runs at click time (not on render) so the value is read
 * after hydration without an SSR/CSR mismatch.
 */

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof Button>;

interface BackButtonProps {
  /** Path to navigate to when there's no usable in-app history. */
  fallback: string;
  children: React.ReactNode;
  /** Inherits the same visual variants as the underlying Button. */
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
}

export function BackButton({
  fallback,
  children,
  variant = "ghost",
  size,
  className,
  disabled,
}: Readonly<BackButtonProps>) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin) {
          router.back();
          return;
        }
      } catch {
        // Malformed referrer — fall through.
      }
    }
    router.push(fallback);
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled}
      onClick={goBack}
    >
      {children}
    </Button>
  );
}
