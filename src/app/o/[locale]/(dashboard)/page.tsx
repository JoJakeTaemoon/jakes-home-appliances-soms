import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Index of the office (dashboard) group — there's no view at the bare
 * locale root. Send the user straight to the office dashboard.
 */
export default async function DashboardIndex({ params }: Readonly<Props>) {
  const { locale } = await params;
  redirect({ href: "/o/dashboard", locale: locale as Locale });
}
