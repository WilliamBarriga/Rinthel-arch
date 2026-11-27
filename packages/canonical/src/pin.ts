/**
 * Edit Intents (`POST /api/edit`, ADR 0005 and 0007) and rejection reasons of `sesion`.
 * Single declaration: the `reason` enum of `editOutputSchema` derives from `REJECTION_REASONS`.
 */
import { z } from 'zod';

/** The server computes the DSL text; the caller does not know the syntax. */
export const pinIntentSchema = z.object({
  view: z.string(),
  /** Qualified id of the Node. */
  node: z.string(),
  /** Relative to the parent Group, like `pin x,y` in the DSL. */
  x: z.number().finite(),
  y: z.number().finite(),
});

export type PinIntent = z.infer<typeof pinIntentSchema>;

/** Same order as the `reason` enum of the contract. */
export const REJECTION_REASONS = [
  'stale-hash',
  'unknown-file',
  'invalid-range',
  'overlapping-edits',
  'unknown-view',
  'invalid',
  'nothing-to-undo',
  'nothing-to-redo',
  'unknown-theme',
  'unknown-entry',
  'invalid-rename',
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * `order`: ids of all the visible Lifelines, from left to right. The hidden entries of the View's `order`
 * keep their relative position.
 */
export const orderIntentSchema = z.object({
  view: z.string(),
  order: z.array(z.string()).min(1),
});

export type OrderIntent = z.infer<typeof orderIntentSchema>;

/**
 * Sets the Theme of a View (`theme <theme>` keeping the patch); without `theme` it unsets it. An undeclared Theme
 * rejects with `unknown-theme`.
 */
export const themeIntentSchema = z.object({
  view: z.string(),
  theme: z.string().min(1).optional(),
});

export type ThemeIntent = z.infer<typeof themeIntentSchema>;

/** Body of `POST /api/edit`, discriminated by `type`. */
export const intentSchema = z.discriminatedUnion('type', [
  pinIntentSchema.extend({ type: z.literal('move-pin') }),
  orderIntentSchema.extend({ type: z.literal('reorder-lifelines') }),
  themeIntentSchema.extend({ type: z.literal('set-theme') }),
]);

export type Intent = z.infer<typeof intentSchema>;
