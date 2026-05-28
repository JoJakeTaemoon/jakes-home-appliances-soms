import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation helpers. These wrap Next.js primitives so links
 * automatically prepend the current locale.
 *
 *   import { Link, useRouter, usePathname } from "@/i18n/navigation";
 *
 * Always import from here instead of `next/link` / `next/navigation`
 * inside pages under `app/[locale]/`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
