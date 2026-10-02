/**
 * @arena/ui - Shared UI Design Tokens and Component Primitives
 * Following shadcn/ui and Tailwind CSS conventions for Arena Store
 */

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const UI_COLORS = {
  primary: "indigo",
  success: "emerald",
  warning: "amber",
  danger: "rose",
  darkBg: "#0b1220",
  darkCard: "#0e1726",
} as const;
