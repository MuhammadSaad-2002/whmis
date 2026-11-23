import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

type SearchFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'> & { 'aria-label': string };

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({ className, ...props }, ref) {
    return (
        <label className={cn('app-search-field', className)}>
            <Search size={18} aria-hidden="true" />
            <input ref={ref} type="search" {...props} />
        </label>
    );
});
