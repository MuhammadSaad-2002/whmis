import { useCallback } from 'react';

/**
 * Shared client-side validation helpers.
 *
 * The server is always the source of truth (every controller validates); these
 * utilities give immediate feedback — a toast alert on Save and inline field
 * errors on blur/save — and map server 422 responses back onto the UI.
 */

export const ALERT_FIX = 'Please fix the highlighted fields.';

/** A validator returns an error message, or null when the value is acceptable. */
export type Validator = (value: unknown, data?: Record<string, unknown>) => string | null;

export type Rules = Record<string, Validator | Validator[]>;

const isBlank = (value: unknown): boolean =>
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

export const required =
    (label: string): Validator =>
    (value) =>
        isBlank(value) ? `${label} is required.` : null;

/** Numeric value must be ≥ `n`. Blank passes (pair with `required` when needed). */
export const min =
    (n: number, label: string): Validator =>
    (value) => {
        if (isBlank(value)) return null;
        const num = Number(value);
        if (Number.isNaN(num)) return `${label} must be a number.`;
        return num < n ? `${label} must be at least ${n}.` : null;
    };

/** Numeric value must fall within [lo, hi]. Blank passes. */
export const between =
    (lo: number, hi: number, label: string): Validator =>
    (value) => {
        if (isBlank(value)) return null;
        const num = Number(value);
        if (Number.isNaN(num)) return `${label} must be a number.`;
        if (num < lo || num > hi) return `${label} must be between ${lo} and ${hi}.`;
        return null;
    };

/** Numeric value must be ≥ 0. Blank passes. */
export const positive =
    (label: string): Validator =>
    (value) => {
        if (isBlank(value)) return null;
        const num = Number(value);
        if (Number.isNaN(num)) return `${label} must be a number.`;
        return num < 0 ? `${label} cannot be negative.` : null;
    };

const runValidators = (validators: Validator | Validator[], value: unknown, data?: Record<string, unknown>): string | null => {
    const list = Array.isArray(validators) ? validators : [validators];
    for (const validate of list) {
        const message = validate(value, data);
        if (message) return message;
    }
    return null;
};

/** Run a full rules map; returns only the fields that failed. */
export function validateAll(data: Record<string, unknown>, rules: Rules): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const key of Object.keys(rules)) {
        const message = runValidators(rules[key], data[key], data);
        if (message) errors[key] = message;
    }
    return errors;
}

/** Validate a single field against its rule; returns the message or null. */
export function validateOne(data: Record<string, unknown>, rules: Rules, key: string): string | null {
    if (!rules[key]) return null;
    return runValidators(rules[key], data[key], data);
}

/**
 * Split Inertia error keys like `items.2.quantity` into grid-friendly buckets:
 * header (plain keys) and rows (indexed by the item position).
 */
export function splitItemErrors(errors: Record<string, string>): {
    header: Record<string, string>;
    rows: Record<number, Record<string, string>>;
} {
    const header: Record<string, string> = {};
    const rows: Record<number, Record<string, string>> = {};
    for (const [key, message] of Object.entries(errors)) {
        const match = /^items\.(\d+)\.(.+)$/.exec(key);
        if (match) {
            const index = Number(match[1]);
            (rows[index] ??= {})[match[2]] = message;
        } else {
            header[key] = message;
        }
    }
    return { header, rows };
}

/** Minimal shape of the pieces of Inertia's `useForm` we rely on. */
interface FormLike<TForm extends Record<string, unknown>> {
    data: TForm;
    setError: (field: keyof TForm & string, message: string) => void;
    clearErrors: (...fields: (keyof TForm & string)[]) => void;
}

/**
 * Client validation bound to an Inertia `useForm`, reusing its own
 * setError/clearErrors so the existing inline error display shows the messages.
 */
export function useClientValidation<TForm extends Record<string, unknown>>(form: FormLike<TForm>, rules: Rules) {
    const validateField = useCallback(
        (key: string): boolean => {
            const message = validateOne(form.data, rules, key);
            if (message) {
                form.setError(key as keyof TForm & string, message);
                return false;
            }
            form.clearErrors(key as keyof TForm & string);
            return true;
        },
        [form, rules],
    );

    const validateForm = useCallback((): boolean => {
        const errors = validateAll(form.data, rules);
        const keys = Object.keys(rules) as (keyof TForm & string)[];
        form.clearErrors(...keys);
        for (const [key, message] of Object.entries(errors)) {
            form.setError(key as keyof TForm & string, message);
        }
        return Object.keys(errors).length === 0;
    }, [form, rules]);

    return { validateField, validateForm };
}
