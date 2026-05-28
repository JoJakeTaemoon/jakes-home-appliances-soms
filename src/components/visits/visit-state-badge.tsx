"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";

const STATE_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger" | "muted"> = {
  SUGGESTED: "neutral",
  SCHEDULED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  FAILED_NO_SHOW: "danger",
  RESCHEDULED: "warning",
  CANCELLED: "muted",
};

export function VisitStateBadge({ state }: Readonly<{ state: string }>) {
  const t = useTranslations("visits.states");
  return (
    <StatusBadge tone={STATE_TONES[state] ?? "neutral"}>
      {t(state as never)}
    </StatusBadge>
  );
}

export function VisitTypeBadge({ type }: Readonly<{ type: string }>) {
  const t = useTranslations("visits.types");
  return (
    <StatusBadge tone="info">
      {t(type as never)}
    </StatusBadge>
  );
}
