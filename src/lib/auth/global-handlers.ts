/**
 * Module-level callback hooks that the API client can fire without
 * importing React contexts. AuthProvider registers its `logout()` here
 * on mount so `useApi()` can trigger a global logout when a 401 hits
 * — without the API client needing to know about which realm (office /
 * field / customer) owns the active session.
 *
 * The Toast system registers its push() here too so the API client can
 * surface ApiClientError messages to the user without dragging the toast
 * provider into the call chain.
 */

type LogoutHandler = () => void | Promise<void>;
type ToastPusher = (message: string, opts?: { tone?: "info" | "success" | "warning" | "error" }) => void;

let officeLogout: LogoutHandler | null = null;
let fieldLogout: LogoutHandler | null = null;
let customerLogout: LogoutHandler | null = null;
let toastPush: ToastPusher | null = null;

export function registerOfficeLogout(fn: LogoutHandler) {
  officeLogout = fn;
  return () => {
    if (officeLogout === fn) officeLogout = null;
  };
}

export function registerFieldLogout(fn: LogoutHandler) {
  fieldLogout = fn;
  return () => {
    if (fieldLogout === fn) fieldLogout = null;
  };
}

export function registerCustomerLogout(fn: LogoutHandler) {
  customerLogout = fn;
  return () => {
    if (customerLogout === fn) customerLogout = null;
  };
}

export function registerToastPusher(fn: ToastPusher) {
  toastPush = fn;
  return () => {
    if (toastPush === fn) toastPush = null;
  };
}

/**
 * Resolve which realm's session is the active one and tear it down.
 * Prefers whichever realm is currently registered. The page-level auth
 * guard takes care of redirecting after the wipe.
 */
export async function fireGlobalLogout(): Promise<void> {
  const fn = officeLogout ?? fieldLogout ?? customerLogout;
  if (!fn) return;
  try {
    await fn();
  } catch {
    // Swallow — the user is being logged out anyway.
  }
}

export function fireToast(
  message: string,
  opts?: { tone?: "info" | "success" | "warning" | "error" },
): void {
  toastPush?.(message, opts);
}
