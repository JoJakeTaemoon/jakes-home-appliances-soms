import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { PortalRequestsClient } from "./requests-client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalRequestsPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <PortalRequestsClient />
    </PortalPage>
  );
}
