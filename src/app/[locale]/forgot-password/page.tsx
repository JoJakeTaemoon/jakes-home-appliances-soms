import { setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "./forgot-form";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function ForgotPasswordPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="min-h-screen bg-[#FAF6EF] px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
