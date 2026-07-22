"use client";

/**
 * In-app navigation history tracker.
 *
 * The "뒤로" buttons (components/ui/back-button + nav/office-breadcrumb) need
 * to know whether `router.back()` will land the user on a real previous page
 * inside our app. `document.referrer` can't answer that: after client-side
 * (soft) navigations it still reflects the last *full document load* (often
 * empty), so the referrer heuristic wrongly falls back to the route-map parent
 * — which is why a detail page's "back" jumped to the list menu instead of the
 * screen the user actually came from.
 *
 * This provider counts soft navigations since the app mounted. Once at least
 * one has happened, there IS an in-app entry to go back to, so `router.back()`
 * is safe. On a cold load / direct link (count 0) the buttons fall back to
 * their parent route so the user is never stranded on an external tab.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "@/i18n/navigation";

const NavigationHistoryContext = createContext<{ canGoBack: boolean }>({
  canGoBack: false,
});

export function NavigationHistoryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const [navCount, setNavCount] = useState(0);

  useEffect(() => {
    if (lastPath.current === null) {
      // First render — this is where the user landed, not a navigation.
      lastPath.current = pathname;
      return;
    }
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setNavCount((c) => c + 1);
    }
  }, [pathname]);

  const value = useMemo(() => ({ canGoBack: navCount > 0 }), [navCount]);
  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

/**
 * `canGoBack` is true once the user has made at least one in-app navigation,
 * meaning `router.back()` will return to a real previous screen. Defaults to
 * false when no provider is mounted (→ callers use their fallback route).
 */
export function useNavigationHistory(): { canGoBack: boolean } {
  return useContext(NavigationHistoryContext);
}
