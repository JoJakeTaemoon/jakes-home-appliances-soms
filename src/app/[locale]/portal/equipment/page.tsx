import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { EquipmentListClient } from "./equipment-list-client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalEquipmentPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <EquipmentListClient />
    </PortalPage>
  );
}
