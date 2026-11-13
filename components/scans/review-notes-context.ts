"use client";

import { createContext, useContext } from "react";

/**
 * Lets the review save the examiner's unsaved notes before it finalises (the notes form is a server-rendered slot of
 * ScanReview, so it reaches the review through context). The form registers a function that saves the notes when they
 * changed and resolves to false when that failed; registering returns the function that removes it again.
 */
export type RegisterNotesFlush = (flush: () => Promise<boolean>) => () => void;

export const ReviewNotesContext = createContext<RegisterNotesFlush | null>(null);

export function useRegisterNotesFlush(): RegisterNotesFlush | null {
  return useContext(ReviewNotesContext);
}
