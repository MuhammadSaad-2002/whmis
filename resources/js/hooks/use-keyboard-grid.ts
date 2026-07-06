import { useCallback, useRef } from 'react';

/**
 * Roving focus for spreadsheet-style invoice entry.
 *
 * Enter  -> next cell in `enterOrder` (or next editable cell when no order is
 *           given); past the last ordered cell it jumps to the next row's
 *           first ordered cell, appending a row at the end of the grid.
 * ArrowUp/Down -> same column, previous/next row
 * F2     -> onProductSearch(row)
 * F4     -> onRulePicker(row) (reserved for the incentive engine)
 * F8/F9/Esc are page-level and handled by useInvoiceHotkeys.
 *
 * Columns left out of `enterOrder` (e.g. line GST %, remarks) stay reachable
 * via Tab, arrows, and mouse.
 */
export function useKeyboardGrid(options: {
    rowCount: number;
    colCount: number;
    onAppendRow: () => void;
    onProductSearch?: (row: number) => void;
    onRulePicker?: (row: number) => void;
    enterOrder?: number[];
}) {
    const { rowCount, colCount, onAppendRow, onProductSearch, onRulePicker, enterOrder } = options;
    const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

    const registerCell = useCallback((row: number, col: number) => {
        return (el: HTMLElement | null) => {
            const key = `${row}:${col}`;
            if (el) cellRefs.current.set(key, el);
            else cellRefs.current.delete(key);
        };
    }, []);

    const focusCell = useCallback((row: number, col: number) => {
        // Defer so newly appended rows have rendered.
        requestAnimationFrame(() => {
            const el = cellRefs.current.get(`${row}:${col}`);
            if (el) {
                el.focus();
                if (el instanceof HTMLInputElement) el.select();
            }
        });
    }, []);

    const nextEditable = useCallback(
        (row: number, col: number): [number, number] | 'append' => {
            let r = row;
            let c = col;
            for (let i = 0; i < rowCount * colCount; i++) {
                c += 1;
                if (c >= colCount) {
                    c = 0;
                    r += 1;
                }
                if (r >= rowCount) return 'append';
                if (cellRefs.current.has(`${r}:${c}`)) return [r, c];
            }
            return 'append';
        },
        [rowCount, colCount],
    );

    const enterTarget = useCallback(
        (row: number, col: number): [number, number] | 'append' => {
            if (!enterOrder || enterOrder.length === 0) {
                return nextEditable(row, col);
            }

            // Next ordered column after the current one (works even when the
            // current column isn't part of the order, e.g. reached via Tab).
            const next = enterOrder.find((candidate) => candidate > col);
            if (next !== undefined) {
                return [row, next];
            }

            // End of the row's circuit: next row's first ordered cell.
            return row + 1 < rowCount ? [row + 1, enterOrder[0]] : 'append';
        },
        [enterOrder, nextEditable, rowCount],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent, row: number, col: number) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const next = enterTarget(row, col);
                if (next === 'append') {
                    onAppendRow();
                    focusCell(rowCount, enterOrder?.[0] ?? 0);
                } else {
                    focusCell(next[0], next[1]);
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (row + 1 < rowCount) focusCell(row + 1, col);
                else {
                    onAppendRow();
                    focusCell(rowCount, col);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (row > 0) focusCell(row - 1, col);
            } else if (e.key === 'F2') {
                e.preventDefault();
                onProductSearch?.(row);
            } else if (e.key === 'F4') {
                e.preventDefault();
                onRulePicker?.(row);
            }
        },
        [enterTarget, focusCell, rowCount, enterOrder, onAppendRow, onProductSearch, onRulePicker],
    );

    return { registerCell, focusCell, handleKeyDown };
}

/**
 * Page-level hotkeys for invoice forms: F8 save draft, F9 post, Esc cancel.
 */
export function useInvoiceHotkeys(handlers: { onSave?: () => void; onPost?: () => void; onEscape?: () => void }) {
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent | KeyboardEvent) => {
            if (e.key === 'F8') {
                e.preventDefault();
                handlers.onSave?.();
            } else if (e.key === 'F9') {
                e.preventDefault();
                handlers.onPost?.();
            } else if (e.key === 'Escape') {
                handlers.onEscape?.();
            }
        },
        [handlers],
    );

    return { handleKeyDown };
}
