import type { ReactNode } from "react";
import { FormField } from "@/components/ui/form-field";
import type { RecordMode } from "@/lib/hooks/use-record-mode";

/**
 * A form field that flips with the record mode: in **조회(view)** it shows the
 * value as clean read-only text; in **수정/신규(edit/create)** it renders the
 * editable control (`children`). Keeps the label consistent across modes so a
 * record reads the same whether you're viewing or editing it.
 *
 *   <ModeField label={t("colBrand")} mode={mode} value={brandName}>
 *     <Combobox value={brandId} onChange={setBrandId} ... />
 *   </ModeField>
 */
export function ModeField({
  label,
  mode,
  value,
  placeholder = "—",
  required,
  className,
  children,
}: Readonly<{
  label: ReactNode;
  mode: RecordMode;
  /** Display value for 조회 mode (pre-formatted by the caller). */
  value?: ReactNode;
  placeholder?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}>) {
  const isView = mode === "view";
  const empty = value == null || value === "";
  return (
    <FormField label={label} required={required} className={className}>
      {isView ? (
        // role="text" (not a disabled input) so AT reads it as read-only, not "dimmed".
        <div
          role="text"
          aria-label={typeof label === "string" ? label : undefined}
          className="flex min-h-9 items-center rounded-lg bg-[#fafafa] px-3 py-1.5 text-sm text-[#111] ring-1 ring-inset ring-[#f0f0f0]"
        >
          {empty ? <span className="text-[#a3a3a3]">{placeholder}</span> : value}
        </div>
      ) : (
        children
      )}
    </FormField>
  );
}
