import { Suspense } from "react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { LoginForm } from "./login-form";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function LoginPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth.login" });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF6EF] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
            <Image
              src="/logo/jakes-home-appliances-logo.jpg"
              alt="Jake's Home Appliances"
              width={64}
              height={64}
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#525252]">{t("subtitle")}</p>
        </div>

        <Suspense fallback={<div className="h-[320px] rounded-2xl border border-[#e5e5e5] bg-white" />}>
          <LoginForm />
        </Suspense>
      </div>

      <div className="mt-8 flex justify-center">
        <LocaleSwitcher />
      </div>
    </div>
  );
}
