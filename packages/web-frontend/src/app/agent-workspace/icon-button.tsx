import { ButtonHTMLAttributes } from "react";
import { cn } from "./classnames";

export function IconButton({
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-[9px] border transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary"
          ? "border-[var(--accent)] bg-[var(--accent)] text-white hover:border-[var(--accent-strong)] hover:bg-[var(--accent-strong)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]",
        className,
      )}
      {...props}
    />
  );
}
