interface AvatarProps {
  name?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

/**
 * Initials avatar with optional image. Falls back to brand-blue + the first
 * 1-2 letters when no image is provided. Used in the customer list 담당자
 * column and the customer-detail header.
 */
export function Avatar({ name, imageUrl, size = "md", className = "" }: AvatarProps) {
  const initials = computeInitials(name);
  const dim = SIZE_MAP[size];
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? ""}
        className={`${dim} flex-shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`${dim} flex flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700 ${className}`}
      aria-label={name ?? ""}
    >
      {initials}
    </div>
  );
}

function computeInitials(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return trimmed.charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
