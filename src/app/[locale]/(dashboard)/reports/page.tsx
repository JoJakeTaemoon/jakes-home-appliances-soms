"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  CalendarCheck,
  TrendingUp,
  Users,
  Wallet,
  UserX,
  FileSearch,
} from "lucide-react";

type CardKey =
  | "daily-visits"
  | "revenue"
  | "technician-productivity"
  | "aging"
  | "churn"
  | "audit";

interface ReportCard {
  key: CardKey;
  href: string;
  Icon: typeof CalendarCheck;
}

const CARDS: ReportCard[] = [
  { key: "daily-visits", href: "/reports/daily-visits", Icon: CalendarCheck },
  { key: "revenue", href: "/reports/revenue", Icon: TrendingUp },
  {
    key: "technician-productivity",
    href: "/reports/technician-productivity",
    Icon: Users,
  },
  { key: "aging", href: "/reports/aging", Icon: Wallet },
  { key: "churn", href: "/reports/churn", Icon: UserX },
  { key: "audit", href: "/reports/audit", Icon: FileSearch },
];

export default function ReportsIndexPage() {
  const t = useTranslations("reports");
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
      </header>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => {
          const Icon = c.Icon;
          return (
            <Link
              key={c.key}
              href={c.href}
              className="flex flex-col gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-4 transition-colors hover:bg-[#FAFAFA]"
            >
              <Icon className="size-6 text-[var(--brand-blue-500)]" strokeWidth={1.5} />
              <div>
                <div className="font-semibold text-[#002A4D]">
                  {t(`cards.${c.key}.title`)}
                </div>
                <p className="mt-0.5 text-xs text-[#737373]">
                  {t(`cards.${c.key}.description`)}
                </p>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
