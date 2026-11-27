/**
 * Whether this browser already used or dismissed the "1-minute tour" pill (browser-local state). An exported file
 * opened over `file://` has an opaque origin in Chromium, where `localStorage` may throw: then it lives in memory only.
 */
import { useSyncExternalStore } from 'react';

const BRACE = 'rinthel-arch:tour-seen';
const notices = new Set<() => void>();
let inMemory = false;

function read(): boolean {
  try {
    return localStorage.getItem(BRACE) !== null;
  } catch {
    return inMemory;
  }
}

/** The pill never comes back after this. */
export function markTourSeen(): void {
  try {
    localStorage.setItem(BRACE, '1');
  } catch {
    inMemory = true;
  }
  for (const notice of notices) notice();
}

function subscribe(notice: () => void): () => void {
  notices.add(notice);
  return () => notices.delete(notice);
}

export const useTourSeen = (): boolean => useSyncExternalStore(subscribe, read);
