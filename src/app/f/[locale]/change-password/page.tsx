"use client";

import { TechnicianAuthGuard } from "@/components/mobile/technician-guard";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { useFieldAuth } from "@/providers/field-auth-provider";
import { useRouter } from "@/i18n/navigation";

/**
 * Field change-password. Reached from 내 정보, or forced by
 * TechnicianAuthGuard while the technician still holds a temp password.
 * Full-screen (no MobileShell) so a forced user can't tab away.
 */
export default function FieldChangePasswordPage() {
  return (
    <TechnicianAuthGuard requireChange>
      <div className="min-h-screen bg-[#FAF6EF] px-4 py-8">
        <div className="mx-auto w-full max-w-md">
          <FieldChangePassword />
        </div>
      </div>
    </TechnicianAuthGuard>
  );
}

function FieldChangePassword() {
  const { user, accessToken, refresh } = useFieldAuth();
  const router = useRouter();
  return (
    <ChangePasswordForm
      endpoint="/api/auth/field/change-password"
      accessToken={accessToken}
      forced={!!user?.mustChangePassword}
      onDone={async () => {
        await refresh();
        router.replace("/f/today");
      }}
      onCancel={() => router.replace("/f/profile")}
    />
  );
}
