import { useCallback, useRef } from 'react';

function canFocusCell(cell: HTMLElement | undefined): cell is HTMLElement {
    return !!cell?.isConnected && !cell.matches(':disabled') && cell.getClientRects().length > 0
        && !cell.closest('details:not([open])');
}

function focusGridElement(cell: HTMLElement) {
    cell.focus();
    if (cell instanceof HTMLInputElement) cell.select();
}

/**
 * Roving focus for spreadsheet-style invoice entry.
 *
 * Enter  -> next cell in `enterOrder` (or next editable cell when no order is
 *           given); past the last ordered cell it jumps to the next row's
 *           first ordered cell, appending a row at the end of the grid.
 * ArrowUp/Down -> previous/next row, same column when editable
 * F2     -> onProductSearch(row)
 * F4     -> onRulePicker(row) (reserved for the incentive engine)
 * Ctrl/Cmd+D -> onDeleteRow(row) then focus the previous row (same column)
 * Ctrl/Cmd+I -> onInsertRow(row) then focus the new row's first cell
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
    onDeleteRow?: (row: number) => void;
    onInsertRow?: (row: number) => void;
    enterOrder?: number[];
    appendOnArrowDown?: boolean;
}) {
    const { rowCount, colCount, onAppendRow, onProductSearch, onRulePicker, onDeleteRow, onInsertRow, enterOrder, appendOnArrowDown = true } = options;
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
                focusGridElement(el);
            }
        });
    }, []);

    const handleVerticalKeyDown = useCallback((e: React.KeyboardEvent, row: number, col: number): boolean => {
        const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        if (!step || e.defaultPrevented || e.nativeEvent.isComposing) return false;

        // Always consume the key, even at an edge, so number inputs never step.
        e.preventDefault();
        for (let next = row + step; next >= 0 && next < rowCount; next += step) {
            const sameColumn = cellRefs.current.get(`${next}:${col}`);
            if (canFocusCell(sameColumn)) {
                focusGridElement(sameColumn);
                return true;
            }
            // An empty invoice row may not have a batch or editable quantity yet.
            for (let candidate = 0; candidate < colCount; candidate++) {
                const cell = cellRefs.current.get(`${next}:${candidate}`);
                if (canFocusCell(cell)) {
                    focusGridElement(cell);
                    return true;
                }
            }
        }
        if (step === 1 && row === rowCount - 1 && appendOnArrowDown) {
            onAppendRow();
            focusCell(rowCount, col);
        }
        return true;
    }, [rowCount, colCount, appendOnArrowDown, onAppendRow, focusCell]);

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
            if (e.defaultPrevented || e.nativeEvent.isComposing || handleVerticalKeyDown(e, row, col)) return;

            if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
                // Delete this row, cursor to the previous row (same column).
                e.preventDefault();
                if (onDeleteRow) {
                    onDeleteRow(row);
                    focusCell(Math.max(0, row - 1), col);
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
                // Insert a fresh row after this one, cursor into its first cell.
                e.preventDefault();
                if (onInsertRow) {
                    onInsertRow(row);
                    focusCell(row + 1, enterOrder?.[0] ?? 0);
                }
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const next = enterTarget(row, col);
                if (next === 'append') {
                    onAppendRow();
                    focusCell(rowCount, enterOrder?.[0] ?? 0);
                } else {
                    focusCell(next[0], next[1]);
                }
            } else if (e.key === 'F2') {
                e.preventDefault();
                onProductSearch?.(row);
            } else if (e.key === 'F4') {
                e.preventDefault();
                onRulePicker?.(row);
            }
        },
        [handleVerticalKeyDown, enterTarget, focusCell, rowCount, enterOrder, onAppendRow, onProductSearch, onRulePicker, onDeleteRow, onInsertRow],
    );

    return { registerCell, focusCell, handleKeyDown, handleVerticalKeyDown };
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
