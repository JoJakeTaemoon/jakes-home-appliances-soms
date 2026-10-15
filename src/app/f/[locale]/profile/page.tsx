"use client";

import { useTranslations } from "next-intl";
import { useFieldAuth } from "@/providers/field-auth-provider";
import { Button } from "@/components/ui/button";
import { MobileWrapper } from "@/components/mobile/mobile-wrapper";
import { Link } from "@/i18n/navigation";

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
  const tRoles = useTranslations("roles");
  const tPwd = useTranslations("portal.changePassword");
  const { user, logout } = useFieldAuth();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#002A4D]">{t("title")}</h1>
      <dl className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
        <Row label={t("username")} value={user?.username ?? "—"} />
        <Row label={t("phone")} value={user?.phone ?? "—"} />
        <Row label={t("role")} value={user ? tRoles(user.role as "TECHNICIAN") : "—"} />
      </dl>
      <Link
        href="/f/change-password"
        className="flex min-h-[44px] items-center justify-center rounded-lg border border-[var(--brand-blue-200)] bg-white text-sm font-medium text-[var(--brand-blue-700)] hover:bg-[var(--brand-blue-50)]"
      >
        {tPwd("title")}
      </Link>
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
