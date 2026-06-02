import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { routing, type Locale } from "@/i18n/routing";
import { CustomerAuthProvider } from "@/providers/customer-auth-provider";
import { QueryProvider } from "@/providers/query-provider";
import { LangSyncer } from "@/components/layout/lang-syncer";
import { MockSmsLogger } from "@/components/dev/mock-sms-logger";

/**
 * Customer realm root layout (URL `/[locale?]/...`).
 *
 * Per docs/URL_SCHEME.md, the customer realm owns the bare host —
 * everything that does not start with `/o/` (office) or `/f/` (field)
 * lands here. Only `CustomerAuthProvider` is mounted; office and field
 * have their own layouts under `src/app/o/[locale]` and `src/app/f/[locale]`.
 */

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function CustomerLocaleLayout({
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
        <CustomerAuthProvider>
          <LangSyncer />
          {process.env.NODE_ENV !== "production" && <MockSmsLogger />}
          {children}
        </CustomerAuthProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
