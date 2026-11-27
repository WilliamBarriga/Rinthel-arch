/**
 * `edit` rejection (exit code 1 for every reason). The HTTP status of the `dev` write routes is
 * `rejectionHttpStatus` from `canonical`, the same one `inMemoryDev` uses.
 */
import type { RejectionReason } from 'canonical';

export interface EditRejection {
  ok: false;
  reason: RejectionReason;
  message: string;
  file?: string;
}

export const REJECTION_CODE = 1;
