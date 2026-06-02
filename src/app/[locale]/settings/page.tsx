import { setRequestLocale } from "next-intl/server";
import { PortalPage } from "@/components/portal/portal-page";
import { SettingsClient } from "./settings-client";

interface Props { params: Promise<{ locale: string }> }

export default async function PortalSettingsPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PortalPage>
      <SettingsClient />
    </PortalPage>
  );
}
