import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { routing, type Locale } from "@/i18n/routing";
import { AuthProvider } from "@/providers/auth-provider";
import { QueryProvider } from "@/providers/query-provider";
import { LangSyncer } from "@/components/layout/lang-syncer";
import { MockSmsLogger } from "@/components/dev/mock-sms-logger";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }
  setRequestLocale(locale as Locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryProvider>
        <AuthProvider>
          <LangSyncer />
          {process.env.NODE_ENV !== "production" && <MockSmsLogger />}
          {children}
        </AuthProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
