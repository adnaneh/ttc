import * as React from 'react';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={`w-full rounded-md border p-2 text-sm outline-none ${className ?? ''}`} {...props} />
  )
);
Textarea.displayName = 'Textarea';

