import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContractActions } from "@/components/contracts/contract-actions";

// next-intl — return the raw key so assertions can match on it directly.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Locale-aware Link/useRouter needs an App Router context we don't have in
// jsdom — stub with plain equivalents (mirrors other component tests).
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockPost = vi.fn();
vi.mock("@/lib/api/client", () => ({
  useApi: () => ({ post: mockPost, get: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }),
  ApiClientError: class MockApiClientError extends Error {
    code = "UNKNOWN";
    status = 0;
  },
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ accessToken: "test-token" }),
}));

const baseProps = {
  id: "contract-1",
  state: "ACTIVE",
  type: "RENTAL",
  contractNumber: "HD-20260526/SA-KH0001",
  hasContractPartyEmail: true,
  onChanged: vi.fn(),
};

function makePdfFile(name: string, sizeBytes: number, type = "application/pdf") {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("ContractActions — upload PDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: "contract-1" } }),
    }) as unknown as typeof fetch;
  });

  it("shows the upload button for MANAGER but not for STAFF", () => {
    const { rerender } = render(<ContractActions {...baseProps} role="MANAGER" />);
    expect(screen.getByText("actions.uploadPdf")).toBeInTheDocument();

    rerender(<ContractActions {...baseProps} role="STAFF" />);
    expect(screen.queryByText("actions.uploadPdf")).not.toBeInTheDocument();
  });

  it("uploads a valid PDF via multipart POST and calls onChanged", async () => {
    const onChanged = vi.fn();
    render(<ContractActions {...baseProps} role="MANAGER" onChanged={onChanged} />);

    fireEvent.click(screen.getByText("actions.uploadPdf"));

    const input = screen.getByLabelText("uploadPdfModal.pickFile") as HTMLInputElement;
    const file = makePdfFile("signed.pdf", 1024);
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByText("uploadPdfModal.submit"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/contracts/contract-1/pdf/upload");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("rejects a non-PDF file client-side without calling fetch", async () => {
    render(<ContractActions {...baseProps} role="MANAGER" />);

    fireEvent.click(screen.getByText("actions.uploadPdf"));

    const input = screen.getByLabelText("uploadPdfModal.pickFile") as HTMLInputElement;
    const file = makePdfFile("photo.png", 1024, "image/png");
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByText("uploadPdfModal.submit"));

    expect(await screen.findByText("uploadPdfModal.errorNotPdf")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized PDF file client-side without calling fetch", async () => {
    render(<ContractActions {...baseProps} role="MANAGER" />);

    fireEvent.click(screen.getByText("actions.uploadPdf"));

    const input = screen.getByLabelText("uploadPdfModal.pickFile") as HTMLInputElement;
    const file = makePdfFile("huge.pdf", 11 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByText("uploadPdfModal.submit"));

    expect(await screen.findByText("uploadPdfModal.errorTooLarge")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("labels the button as re-upload and shows an uploaded badge once pdfUploadedAt is set", () => {
    render(
      <ContractActions
        {...baseProps}
        role="MANAGER"
        pdfUploadedAt="2026-06-01T00:00:00.000Z"
      />,
    );
    expect(screen.getByText("actions.reuploadPdf")).toBeInTheDocument();
    expect(screen.getByText("uploadedBadge")).toBeInTheDocument();
  });
});
