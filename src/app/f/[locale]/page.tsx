import { redirect } from "@/i18n/redirect";
import type { Locale } from "@/i18n/routing";

/**
 * Index of the field (mobile) group — send the technician straight to
 * the "today" queue.
 */
export default async function FieldIndexPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  redirect({ href: "/f/today", locale: locale as Locale });
}
