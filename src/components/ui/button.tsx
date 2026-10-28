import type { ComponentPropsWithoutRef, Ref } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
  /** Shows an inline spinner and disables the button without changing its label. */
  isLoading?: boolean;
  /**
   * React 19 accepts `ref` as a plain prop on function components (no
   * `forwardRef` needed) — declared explicitly here so a caller can
   * restore focus to a specific button (e.g. after dismissing a
   * confirmation panel it opened) without reaching past this component.
   */
  ref?: Ref<HTMLButtonElement>;
}

// control-height 50px, radius-control, and a 2px focus outline with a 2px
// offset on every state — the system's floor for an interactive element.
const baseClasses =
  "inline-flex min-h-control-height min-w-target-min items-center justify-center gap-2 rounded-control px-5 " +
  "text-body font-medium outline-none transition-colors duration-150 ease-out " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const variantClasses: Record<ButtonVariant, string> = {
  // Inverted: ink fill, paper text (the Stash button's treatment).
  primary: "bg-ink text-paper",
  // A control's only edge is the border-strong token, never border-control (<3:1).
  secondary: "border border-border-strong bg-surface text-ink shadow-control",
  // Destructive: signal as text and edge on a surface fill — never a large
  // signal fill (brand book).
  danger: "border border-signal bg-surface text-signal shadow-control",
};

/**
 * The Button look as a class string, for the places a link has to look like
 * a button (the Stash link on the Stuff screen). A link is the right element
 * there — it navigates — but it should wear exactly the same shape, height
 * and focus ring.
 */
export function buttonClassName(variant: ButtonVariant = "primary", className?: string): string {
  return cn(baseClasses, variantClasses[variant], className);
}

export function Button({
  variant = "primary",
  isLoading = false,
  disabled,
  className,
  children,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName(variant, className)}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
