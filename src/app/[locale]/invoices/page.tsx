import { getTranslations, setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { PortalInvoicesClient } from "./client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalInvoicesPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "portalExtra.invoices" });

  return (
    <PortalPage>
      <div className="space-y-3">
        <h1 className="text-xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <PortalInvoicesClient />
      </div>
    </PortalPage>
  );
}
