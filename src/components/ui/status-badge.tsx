import { cn } from "@/lib/cn";

type Tone =
  | "success"
  | "neutral"
  | "warning"
  | "danger"
  | "info"
  | "muted";

interface Props {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  /** Small (default) or medium. */
  size?: "sm" | "md";
}

const TONE: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  neutral: "bg-gray-50 text-gray-700 ring-gray-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)] ring-[var(--brand-blue-200)]",
  muted: "bg-gray-100 text-gray-500 ring-gray-200",
};

export function StatusBadge({ tone = "neutral", children, className, size = "sm" }: Readonly<Props>) {
  const sizing = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium ring-1",
        sizing,
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map a CustomerStatus enum value to a tone + label key. */
export function customerStatusTone(status: string): Tone {
  if (status === "ACTIVE") return "success";
  if (status === "INACTIVE") return "muted";
  if (status === "PROSPECT") return "info";
  return "neutral";
}

export function customerTypeTone(type: string): Tone {
  if (type === "B2B") return "info";
  return "neutral";
}

export function equipmentStatusTone(status: string): Tone {
  if (status === "ACTIVE") return "success";
  if (status === "REPLACED") return "muted";
  if (status === "RELOCATED") return "info";
  if (status === "DEACTIVATED") return "danger";
  if (status === "TERMINATED") return "danger";
  return "neutral";
}

export function equipmentOwnershipTone(o: string): Tone {
  if (o === "CUSTOMER") return "warning";
  return "info";
}
