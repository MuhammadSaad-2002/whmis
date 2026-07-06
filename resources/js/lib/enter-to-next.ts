/**
 * Desktop-accounting-style Enter navigation for every form.
 *
 * Enter in a text/number/date input or native select moves focus to the next
 * field instead of submitting. On the last field, Enter falls through to the
 * default behavior (submit inside a <form>).
 *
 * Scope: the closest <form>, dialog, or [data-enter-nav] container — inputs
 * outside these (e.g. debounced search boxes on list pages) are untouched.
 * The invoice grids call preventDefault() in their own Enter handlers first,
 * so this listener (bubble phase, defaultPrevented check) never fights them.
 */

const SOURCE_TYPES_EXCLUDED = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden'];

const FOCUSABLE_SELECTOR = [
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]):not([readonly])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button[role=combobox]:not([disabled])', // shadcn/Radix Select triggers
    'button[type=submit]:not([disabled])',
].join(', ');

function isVisible(el: HTMLElement): boolean {
    return el.tabIndex !== -1 && el.getClientRects().length > 0;
}

function handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target instanceof HTMLInputElement && SOURCE_TYPES_EXCLUDED.includes(target.type)) return;

    const scope = target.closest<HTMLElement>('form, [role=dialog], [data-enter-nav]');
    if (!scope) return;

    const focusables = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
    const index = focusables.indexOf(target);
    if (index === -1) return;

    const next = focusables[index + 1];
    if (!next) return; // last field: let Enter submit the form as usual

    e.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
}

export function installEnterToNext(): void {
    document.addEventListener('keydown', handleKeyDown);
}
