"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";

type SrStateKey =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

const STATE_TONES: Record<
  SrStateKey,
  "neutral" | "info" | "warning" | "success" | "danger" | "muted"
> = {
  PENDING_REVIEW: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  SCHEDULED: "info",
  COMPLETED: "success",
  CANCELLED: "muted",
};

interface Props {
  state: string;
  /** Use the portal-namespaced translations rather than office side. */
  portal?: boolean;
}

export function SrStateBadge({ state, portal }: Readonly<Props>) {
  const t = useTranslations(
    portal ? "portal.requests.states" : "serviceRequests.states",
  );
  const tone = STATE_TONES[state as SrStateKey] ?? "neutral";
  return <StatusBadge tone={tone}>{t(state as SrStateKey)}</StatusBadge>;
}

type SrTypeKey =
  | "INSPECTION"
  | "REPAIR"
  | "PART_REPLACEMENT"
  | "RELOCATION"
  | "OTHER";

export function SrTypeBadge({
  type,
  portal,
}: Readonly<{ type: string; portal?: boolean }>) {
  const t = useTranslations(
    portal ? "portal.requests.types" : "serviceRequests.types",
  );
  return (
    <StatusBadge tone="info">{t(type as SrTypeKey)}</StatusBadge>
  );
}
