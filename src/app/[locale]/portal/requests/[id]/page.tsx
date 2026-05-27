import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { PortalRequestDetailClient } from "./detail-client";

interface Props { params: Promise<{ locale: string; id: string }> }

export default async function PortalRequestDetailPage({ params }: Readonly<Props>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <PortalRequestDetailClient id={id} />
    </PortalPage>
  );
}
