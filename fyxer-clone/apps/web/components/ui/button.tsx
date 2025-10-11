import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const button = cva("inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none", {
  variants: { variant: { default: "border", ghost: "" }, size: { sm: "h-8", md: "h-9", lg: "h-10" } },
  defaultVariants: { variant: "default", size: "md" }
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) =>
  <button ref={ref} className={cn(button({ variant, size, className }))} {...props} />
);
Button.displayName = 'Button';

export function cn(...cls: Array<string | undefined>) { return cls.filter(Boolean).join(' '); }

