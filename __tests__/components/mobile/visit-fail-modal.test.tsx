import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VisitFailModal } from "@/components/mobile/visit-fail-modal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockPost = vi.fn();
vi.mock("@/lib/api/client", () => ({
  useApi: () => ({ post: mockPost, get: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }),
}));

function renderModal() {
  const onClose = vi.fn();
  const onFailed = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VisitFailModal visitId="v1" open onClose={onClose} onFailed={onFailed} />
    </QueryClientProvider>,
  );
  return { onClose, onFailed };
}

describe("VisitFailModal", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ success: true, data: { id: "v1", state: "FAILED_NO_SHOW" } });
  });

  it("keeps submit disabled until a reason is picked", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "submit" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "reasons.NO_SHOW" }));
    expect(screen.getByRole("button", { name: "submit" })).toBeEnabled();
  });

  it("posts the reason + note to the fail endpoint and reports success", async () => {
    const { onFailed } = renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "reasons.NO_SHOW" }));
    fireEvent.change(screen.getByLabelText("note"), { target: { value: "  door locked " } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    await waitFor(() => expect(onFailed).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith("/api/mobile/visits/v1/fail", {
      reason: "reasons.NO_SHOW — door locked",
    });
  });

  it("sends the reason alone when there is no note", async () => {
    const { onFailed } = renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "reasons.UNREACHABLE" }));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    await waitFor(() => expect(onFailed).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith("/api/mobile/visits/v1/fail", {
      reason: "reasons.UNREACHABLE",
    });
  });

  it("requires a note when the reason is OTHER", () => {
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "reasons.OTHER" }));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(screen.getByText("noteRequired")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows the server error and stays open on failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("Cannot mark this visit as failed"));
    const { onFailed } = renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "reasons.NO_SHOW" }));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(await screen.findByText("Cannot mark this visit as failed")).toBeInTheDocument();
    expect(onFailed).not.toHaveBeenCalled();
  });
});
