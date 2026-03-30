import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "icon";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const sizeClasses = {
  primary: {
    sm: "h-8 px-4 text-sm",
    md: "h-[42px] min-w-[130px] px-6 text-sm",
    lg: "h-[50px] min-w-[160px] px-8 text-base",
  },
  secondary: {
    sm: "h-8 px-4 text-sm",
    md: "h-[42px] min-w-[130px] px-6 text-sm",
    lg: "h-[50px] min-w-[160px] px-8 text-base",
  },
  ghost: {
    sm: "h-8 px-4 text-sm",
    md: "h-[42px] px-6 text-sm",
    lg: "h-[50px] px-8 text-base",
  },
  icon: {
    sm: "size-9",
    md: "size-10",
    lg: "size-11",
  },
} as const;

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    "bg-gradient-to-r from-accent to-accent-light",
    "text-white font-bold",
    "rounded-full",
    "hover:shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_40%,transparent)]",
    "active:scale-[0.97]",
  ].join(" "),
  secondary: [
    "bg-transparent",
    "text-accent font-medium",
    "border-[1.5px] border-accent/50",
    "rounded-full",
    "hover:border-accent hover:bg-accent/10",
  ].join(" "),
  ghost: [
    "bg-transparent",
    "text-text-secondary font-medium",
    "rounded-full",
    "hover:bg-elevated",
  ].join(" "),
  icon: [
    "bg-transparent",
    "text-text-secondary",
    "border-[1.5px] border-ghost-lit",
    "rounded-full",
    "flex items-center justify-center",
    "hover:border-accent/50 hover:text-text-primary",
  ].join(" "),
};

const focusClasses =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void";

const baseClasses =
  "inline-flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${baseClasses} ${focusClasses} ${variantClasses[variant]} ${sizeClasses[variant][size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
