import { afterEach, expect, vi } from "vitest";

// Auto-mock audit writer so tests don't hit DB for forensic-only writes.
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

// Per-file mock isolation for tests that rely on `mockResolvedValueOnce` /
// `mockRejectedValueOnce` queues. `vi.clearAllMocks()` only clears call
// history; it does NOT drain queued "once" implementations. Without this
// hook, leftover queued values leak between describe blocks.
//
// We can't enable `mockReset: true` globally — many integration tests rely
// on `vi.fn().mockResolvedValue(...)` declared inside `vi.mock(...)`
// factories, which `mockReset` wipes out. Opt-in per-file via a filename
// suffix marker keeps the workaround surgical.
const RESET_MOCKS_FILES: string[] = [];

afterEach(() => {
  const path = expect.getState().testPath ?? "";
  if (RESET_MOCKS_FILES.some((suffix) => path.endsWith(suffix))) {
    vi.resetAllMocks();
  }
});
