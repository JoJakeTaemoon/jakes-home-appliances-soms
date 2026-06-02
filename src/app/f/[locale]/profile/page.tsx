"use client";

import { useTranslations } from "next-intl";
import { useFieldAuth } from "@/providers/field-auth-provider";
import { Button } from "@/components/ui/button";
import { MobileWrapper } from "@/components/mobile/mobile-wrapper";

export default function MobileProfilePage() {
  return (
    <MobileWrapper>
      <MobileProfileContent />
    </MobileWrapper>
  );
}

function MobileProfileContent() {
  const t = useTranslations("mobile.profile");
  const tm = useTranslations("mobile");
  const { user, logout } = useFieldAuth();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#002A4D]">{t("title")}</h1>
      <dl className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
        <Row label={t("username")} value={user?.username ?? "—"} />
        <Row label={t("phone")} value={user?.phone ?? "—"} />
        <Row label={t("role")} value={user?.role ?? "—"} />
      </dl>
      <Button variant="danger" onClick={() => logout().catch(() => undefined)} fullWidth>
        {tm("logout")}
      </Button>
    </div>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between border-b border-[#eee] px-4 py-3 last:border-b-0">
      <dt className="text-sm text-[#737373]">{label}</dt>
      <dd className="text-sm font-medium text-[#111]">{value}</dd>
    </div>
  );
}
