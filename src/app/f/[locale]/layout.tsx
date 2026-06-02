import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { routing, type Locale } from "@/i18n/routing";
import { FieldAuthProvider } from "@/providers/field-auth-provider";
import { QueryProvider } from "@/providers/query-provider";
import { LangSyncer } from "@/components/layout/lang-syncer";
import { MockSmsLogger } from "@/components/dev/mock-sms-logger";

/**
 * Field realm root layout (URL `/f/[locale?]/...`).
 *
 * See docs/URL_SCHEME.md. Field is TECHNICIAN — the mobile PWA. Login at
 * `/f/login` renders full-screen; every other `/f/*` page wraps in
 * `<TechnicianAuthGuard>` + `<MobileShell>` via inner client components.
 */

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function FieldLocaleLayout({
  children,
  params,
}: Readonly<LayoutProps>) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }
  setRequestLocale(locale as Locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryProvider>
        <FieldAuthProvider>
          <LangSyncer />
          {process.env.NODE_ENV !== "production" && <MockSmsLogger />}
          {children}
        </FieldAuthProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
