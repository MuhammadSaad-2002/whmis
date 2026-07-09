import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, onChange, ...props }, ref) => {
    // Single-line text fields are uppercased by default (stored value, not just
    // display) — see plan. Numeric/date/email/password and textareas are excluded.
    const upper = type === undefined || type === 'text' || type === 'search';
    const handleChange = upper
        ? (e: React.ChangeEvent<HTMLInputElement>) => {
              const el = e.target;
              const { selectionStart: start, selectionEnd: end } = el;
              el.value = el.value.toUpperCase();
              if (start !== null) el.setSelectionRange(start, end); // keep caret mid-string
              onChange?.(e);
          }
        : onChange;
    return (
        <input
            type={type}
            className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                upper && 'uppercase placeholder:normal-case',
                className,
            )}
            onChange={handleChange}
            ref={ref}
            {...props}
        />
    );
});

Input.displayName = 'Input';

export { Input };
