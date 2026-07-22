"use client";

/**
 * BackButton — "go back" navigation that prefers in-app history when
 * one exists, otherwise falls back to a parent route.
 *
 * "In-app history" is tracked by NavigationHistoryProvider (counts soft
 * navigations since mount) rather than `document.referrer`, which is empty
 * after client-side navigation and made this fall back to the parent route
 * even when the user had a real previous screen to return to.
 */

import { useRouter } from "@/i18n/navigation";
import { useNavigationHistory } from "@/lib/nav/navigation-history";
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
  const { canGoBack } = useNavigationHistory();

  function goBack() {
    // Real in-app history → step back to the previous screen; otherwise
    // (cold load / direct link) go to the fallback so we never strand the
    // user on an external tab.
    if (canGoBack) {
      router.back();
      return;
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
