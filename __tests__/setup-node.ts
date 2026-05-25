import { afterEach, expect, vi } from "vitest";

// Auto-mock action-log for all integration/unit tests so logAction calls don't hit DB
vi.mock("@/lib/action-log", () => ({
  logAction: vi.fn(),
  // Helpers used by routes to construct activity-log `detail` payloads. The
  // call-site doesn't care about the shape returned in tests — we just need
  // them to be present + non-throwing.
  buildUpdateDetail: vi.fn(() => ({})),
  buildDeleteDetail: vi.fn(() => ({})),
}));

// Per-file mock isolation for tests that rely on `mockResolvedValueOnce` /
// `mockRejectedValueOnce` queues. `vi.clearAllMocks()` only clears call
// history; it does NOT drain queued "once" implementations. Without this hook,
// leftover queued values leak between describe blocks (cf.
// `purchase-order/shared.test.ts`).
//
// We can't enable `mockReset: true` globally — many integration tests rely on
// `vi.fn().mockResolvedValue(...)` declared inside `vi.mock(...)` factories,
// which `mockReset` wipes out. Opt-in per-file via a `RESET_MOCKS_PER_TEST`
// comment marker keeps the workaround surgical.
const RESET_MOCKS_FILES = ["purchase-order/shared.test.ts"];

afterEach(() => {
  const path = expect.getState().testPath ?? "";
  if (RESET_MOCKS_FILES.some((suffix) => path.endsWith(suffix))) {
    vi.resetAllMocks();
  }
});
