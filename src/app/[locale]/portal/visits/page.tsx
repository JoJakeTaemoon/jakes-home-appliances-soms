import { getTranslations, setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { PortalVisitsClient } from "./client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalVisitsPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "portal.tabs" });

  return (
    <PortalPage>
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-[#002A4D]">{t("visits")}</h1>
        <PortalVisitsClient />
      </div>
    </PortalPage>
  );
}
