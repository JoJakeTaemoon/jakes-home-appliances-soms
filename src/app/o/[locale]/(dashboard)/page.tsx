import { redirect } from "@/i18n/navigation";

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * Index of the dashboard group — there's no view at the bare locale root.
 * Send the user straight to the dashboard page.
 */
export default async function DashboardIndex({ params }: Props) {
  const { locale } = await params;
  redirect({ href: "/dashboard", locale: locale as "vi" | "ko" | "en" });
}
