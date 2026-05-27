import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { DashboardClient } from "./dashboard-client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalDashboardPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <DashboardClient />
    </PortalPage>
  );
}
