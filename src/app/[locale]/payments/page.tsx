import { getTranslations, setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { PortalPaymentsClient } from "./client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalPaymentsPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "portalExtra.payments" });

  return (
    <PortalPage>
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <PortalPaymentsClient />
      </div>
    </PortalPage>
  );
}
