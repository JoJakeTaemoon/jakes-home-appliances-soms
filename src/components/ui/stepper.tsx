"use client";

export interface StepperStep {
  key: string;
  label: string;
}

/** Ordered step indicator — active step emphasized, completed steps muted-done, future steps muted gray. */
export function Stepper({
  steps,
  current,
}: Readonly<{ steps: StepperStep[]; current: string }>) {
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <ol className="flex gap-2 rounded-lg border-2 border-gray-200 bg-white p-3 text-sm">
      {steps.map((s, i) => {
        const active = s.key === current;
        const done = currentIndex > i;
        const tone = active
          ? "bg-[var(--brand-blue-100)] text-[var(--brand-blue-700)]"
          : done
            ? "bg-green-100 text-green-700"
            : "bg-gray-100 text-gray-500";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${tone}`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={
                active
                  ? "font-semibold text-[var(--brand-blue-700)]"
                  : "text-gray-700"
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-gray-300">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
