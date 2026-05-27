"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";

type Tone = "success" | "neutral" | "warning" | "danger" | "info" | "muted";
type StateValue =
  | "DRAFT"
  | "PENDING_SIGNATURE"
  | "ACTIVE"
  | "AMENDED"
  | "COMPLETED"
  | "TERMINATED"
  | "CANCELLED";
type TypeValue = "SALE" | "RENTAL" | "MAINTENANCE";

function contractStateTone(state: string): Tone {
  if (state === "DRAFT") return "muted";
  if (state === "PENDING_SIGNATURE") return "warning";
  if (state === "ACTIVE") return "success";
  if (state === "AMENDED") return "info";
  if (state === "COMPLETED") return "info";
  if (state === "TERMINATED") return "danger";
  if (state === "CANCELLED") return "danger";
  return "neutral";
}

function contractTypeTone(type: string): Tone {
  if (type === "RENTAL") return "info";
  if (type === "MAINTENANCE") return "warning";
  return "neutral";
}

export function ContractStateBadge({ state }: { state: string }) {
  const t = useTranslations("contracts.states");
  return <StatusBadge tone={contractStateTone(state)}>{t(state as StateValue)}</StatusBadge>;
}

export function ContractTypeBadge({ type }: { type: string }) {
  const t = useTranslations("contracts.types");
  return <StatusBadge tone={contractTypeTone(type)}>{t(type as TypeValue)}</StatusBadge>;
}
