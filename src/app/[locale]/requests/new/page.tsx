import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { NewRequestClient } from "./new-request-client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalNewRequestPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <NewRequestClient />
    </PortalPage>
  );
}
