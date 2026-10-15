import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OpenPortalButton } from "@/components/customer/open-portal-button";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const post = vi.fn();
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  useApi: () => ({ post }),
}));

const contact = { id: "k1", name: "Nguyễn Văn A", phone1: "0901234567", email: null };

// Braces matter: a returned function would be run as a teardown hook.
beforeEach(() => {
  post.mockReset();
});

/** The trigger and the modal's confirm share a label; the confirm is last. */
const confirmButton = () => screen.getAllByText("openPortal").at(-1)!;

describe("OpenPortalButton", () => {
  it("asks before opening and says nothing is texted", () => {
    render(<OpenPortalButton customerId="c1" contact={contact} onOpened={vi.fn()} />);
    fireEvent.click(screen.getByText("openPortal"));
    expect(screen.getByText("openPortalConfirm")).toBeInTheDocument();
    expect(screen.getByText("openPortalNoEmail")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("mentions the activation email when the contact has one", () => {
    render(
      <OpenPortalButton
        customerId="c1"
        contact={{ ...contact, email: "a@example.com" }}
        onOpened={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("openPortal"));
    expect(screen.getByText("openPortalEmailNotice")).toBeInTheDocument();
  });

  it("shows the temporary password once and reloads only after closing", async () => {
    post.mockResolvedValue({ success: true, data: { contactId: "k1", tempPassword: "Ab3dEf7hJk" } });
    const onOpened = vi.fn();
    render(<OpenPortalButton customerId="c1" contact={contact} onOpened={onOpened} />);
    fireEvent.click(screen.getByText("openPortal"));
    fireEvent.click(confirmButton());

    await waitFor(() => expect(screen.getByText("Ab3dEf7hJk")).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith("/api/customers/c1/contacts/k1/enable-portal");
    expect(screen.getByText("resetPortalPasswordOnce")).toBeInTheDocument();
    // Reloading now would unmount the card (portalEnabled flips) and lose the password.
    expect(onOpened).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("resetPortalPasswordDone"));
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ab3dEf7hJk")).not.toBeInTheDocument();
  });

  it("surfaces an API error and keeps the dialog open", async () => {
    post.mockRejectedValue(new Error("Portal account already enabled"));
    const onOpened = vi.fn();
    render(<OpenPortalButton customerId="c1" contact={contact} onOpened={onOpened} />);
    fireEvent.click(screen.getByText("openPortal"));
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByText("Portal account already enabled")).toBeInTheDocument(),
    );
    expect(onOpened).not.toHaveBeenCalled();
  });
});
