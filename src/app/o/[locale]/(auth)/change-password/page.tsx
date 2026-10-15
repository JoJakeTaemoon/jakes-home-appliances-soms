"use client";

import { AuthGuard } from "@/components/layout/auth-guard";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "@/i18n/navigation";

/**
 * Office change-password. Reached from the user menu, or forced by AuthGuard
 * while the user still holds an admin-issued temp password. Lives in the
 * full-screen (auth) group so a forced user never sees the dashboard chrome.
 */
export default function OfficeChangePasswordPage() {
  return (
    <AuthGuard requireChange>
      <div className="min-h-screen bg-[#FAF6EF] px-4 py-12">
        <div className="mx-auto w-full max-w-md">
          <OfficeChangePassword />
        </div>
      </div>
    </AuthGuard>
  );
}

function OfficeChangePassword() {
  const { user, accessToken, refresh } = useAuth();
  const router = useRouter();
  return (
    <ChangePasswordForm
      endpoint="/api/auth/change-password"
      accessToken={accessToken}
      forced={!!user?.mustChangePassword}
      onDone={async () => {
        // Re-read the session so mustChangePassword clears before navigating.
        await refresh();
        router.replace("/o/dashboard");
      }}
      onCancel={() => router.replace("/o/dashboard")}
    />
  );
}
