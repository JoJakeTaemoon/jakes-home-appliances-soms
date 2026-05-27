import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { EquipmentDetailClient } from "./equipment-detail-client";

interface Props { params: Promise<{ locale: string; id: string }> }

export default async function PortalEquipmentDetailPage({
  params,
}: Readonly<Props>) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <EquipmentDetailClient id={id} />
    </PortalPage>
  );
}
