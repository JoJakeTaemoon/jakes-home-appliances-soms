/**
 * Field completion wizard — no raw enum values, English literals or native
 * file-input chrome reach the technician.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Namespace-aware stub so `payments.methods.CASH` is distinguishable from
// the raw `CASH` enum value.
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "ko",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "v1" }) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/mobile/mobile-wrapper", () => ({
  MobileWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/providers/field-auth-provider", () => ({ useFieldAuth: () => ({ accessToken: "t" }) }));
vi.mock("@/lib/api/client", () => ({ useApi: () => ({ post: vi.fn() }) }));
vi.mock("@/lib/offline/queue", () => ({ enqueue: vi.fn(), useOnlineStatus: () => true }));
vi.mock("@/lib/upload/compress", () => ({ compressImage: (f: File) => Promise.resolve(f) }));
vi.mock("@/lib/api/hooks", () => ({
  useApiQuery: (url: string | null) => ({
    data: url === "/api/mobile/visits/v1" ? { expectedAmount: "100000", equipmentId: null } : undefined,
    isLoading: false,
  }),
}));

import MobileCompletePage from "@/app/f/[locale]/visits/[id]/complete/page";

const next = () => fireEvent.click(screen.getByRole("button", { name: "mobile.complete.next" }));

describe("completion wizard", () => {
  it("signature step uses a custom camera button, not the native file input", () => {
    render(<MobileCompletePage />);
    next();
    next();
    const button = screen.getByRole("button", { name: "mobile.complete.signatureTake" });
    expect(button).toBeInTheDocument();
    const input = document.querySelector<HTMLInputElement>('input[type="file"][capture]');
    expect(input).not.toBeNull();
    expect(input!.getAttribute("capture")).toBe("environment");
    expect(input!.className).toContain("hidden");
  });

  it("payment method and review step are translated", () => {
    render(<MobileCompletePage />);
    next();
    next();
    next();
    expect(screen.getByText("payments.methods.CASH")).toBeInTheDocument();
    expect(screen.queryByText("CASH")).toBeNull();
    next();
    expect(screen.getByText("mobile.complete.signatureMissing")).toBeInTheDocument();
    expect(screen.queryByText("Missing")).toBeNull();
    expect(screen.queryByText(/photo\(s\)/)).toBeNull();
    expect(screen.queryByText(/\(CASH\)/)).toBeNull();
  });
});
