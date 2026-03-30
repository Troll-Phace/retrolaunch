import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: "search" | "form";
  icon?: ReactNode;
}

const sharedClasses =
  "w-full bg-void border border-ghost-lit text-text-primary text-sm placeholder:text-text-dim focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors duration-200";

const variantStyles = {
  search: "rounded-full pl-10 pr-4 py-2",
  form: "rounded-md px-3 py-2",
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ variant = "search", icon, className = "", ...props }, ref) => {
    const inputElement = (
      <input
        ref={ref}
        className={`${sharedClasses} ${variantStyles[variant]} ${icon && variant === "search" ? "" : variant === "search" ? "pl-4" : ""} ${className}`}
        {...props}
      />
    );

    if (icon) {
      return (
        <div className="relative w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none">
            {icon}
          </span>
          {inputElement}
        </div>
      );
    }

    return inputElement;
  }
);

Input.displayName = "Input";
