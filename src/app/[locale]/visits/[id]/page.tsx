import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { PortalVisitDetailClient } from "./client";

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export default async function PortalVisitDetailPage({
  params,
}: Readonly<Props>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <PortalVisitDetailClient id={id} />
    </PortalPage>
  );
}
