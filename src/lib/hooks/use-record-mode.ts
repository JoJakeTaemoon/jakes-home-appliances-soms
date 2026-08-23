"use client";

import { useCallback, useState } from "react";

/**
 * View / create / edit state machine for master-detail management screens.
 *
 * Selecting a list row shows the record **read-only** (조회). An explicit
 * `startEdit()` enters 수정, `startCreate()` enters 신규 등록. `cancel()` and
 * `saved()` both return to 조회. `formKey` bumps on every transition so the
 * detail form remounts and discards unsaved edits.
 *
 * Shared across the product-catalog tabs so all six behave identically.
 */
export type RecordMode = "view" | "edit" | "create";

export interface RecordModeApi<T> {
  mode: RecordMode;
  selected: T | null;
  /** edit || create — i.e. the form is currently editable. */
  isEditing: boolean;
  /** Remount key for the detail form; bumps on every transition. */
  formKey: number;
  /** Select a row (or clear) → 조회 mode. */
  select: (row: T | null) => void;
  /** 조회 → 수정 (no-op when nothing is selected). */
  startEdit: () => void;
  /** → 신규 등록 (clears the selection). */
  startCreate: () => void;
  /** 수정/신규 → 조회, discarding unsaved edits. */
  cancel: () => void;
  /** After a successful save → 조회; pass the saved row to keep it selected. */
  saved: (row?: T | null) => void;
}

export function useRecordMode<T>(): RecordModeApi<T> {
  const [mode, setMode] = useState<RecordMode>("view");
  const [selected, setSelected] = useState<T | null>(null);
  const [formKey, setFormKey] = useState(0);
  const bump = useCallback(() => setFormKey((k) => k + 1), []);

  const select = useCallback((row: T | null) => {
    setSelected(row);
    setMode("view");
    bump();
  }, [bump]);

  const startEdit = useCallback(() => {
    // Guard on the latest selection via the functional updater's sibling state.
    setMode((m) => (selected ? "edit" : m));
  }, [selected]);

  const startCreate = useCallback(() => {
    setSelected(null);
    setMode("create");
    bump();
  }, [bump]);

  const cancel = useCallback(() => {
    setMode("view");
    bump(); // remount form → discard edits
  }, [bump]);

  const saved = useCallback((row: T | null = null) => {
    if (row !== null) setSelected(row);
    setMode("view");
    bump();
  }, [bump]);

  return {
    mode,
    selected,
    isEditing: mode !== "view",
    formKey,
    select,
    startEdit,
    startCreate,
    cancel,
    saved,
  };
}
