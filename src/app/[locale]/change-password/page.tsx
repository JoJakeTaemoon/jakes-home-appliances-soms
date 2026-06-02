import { setRequestLocale } from "next-intl/server";
import { ChangePasswordForm } from "./change-password-form";
import { CustomerAuthGuard } from "@/components/portal/customer-auth-guard";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function ChangePasswordPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <CustomerAuthGuard requireChange>
      <div className="min-h-screen bg-[#FAF6EF] px-4 py-12">
        <div className="mx-auto w-full max-w-md">
          <ChangePasswordForm />
        </div>
      </div>
    </CustomerAuthGuard>
  );
}
