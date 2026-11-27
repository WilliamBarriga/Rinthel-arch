/**
 * Apply `fix` against `dev`: shared by the button of an issue, "Apply N fixes" of the Issues panel and the inline
 * action of the editor when the `fix` falls in another file. Each `fix` travels as its `IssueFix` through writing
 * (`writing/writing.ts`); several go in a single request (all or nothing, one File history entry). It is the only
 * request that retries: on a 409 it chooses the `fix`es again over the reloaded state and retries once. On any other
 * rejection (`overlapping-edits`, `invalid`...) nothing was written and the notice gives the reason and the file.
 */
import type { DevState, DevIssue } from '../../src/protocol';
import type { SendResult } from '../client';
import type { IssueFix } from '../editor/diagnostics';
import type { DevUiContext } from '../frame/context';

/** Which `fix`es to apply over a state (the one seen or the one reloaded after a 409); `description` names the File history entry. */
export type FixChoice = (state: DevState) => { fixes: IssueFix[]; description?: string };

/** Identity of an issue that survives a change of positions: the 409 relocates the same issue in the new state. */
export const issueKey = (issue: DevIssue): string => `${issue.file}\u0000${issue.code}\u0000${issue.message}`;

/** Chooses the `fix` of the issue with the same identity (to retry after a 409). */
export const issueFix =
  (issue: DevIssue): FixChoice =>
  (state) => ({ fixes: state.issues.flatMap((i) => (i.fix !== undefined && issueKey(i) === issueKey(issue) ? [i.fix] : [])) });

export function applyFixes({ write }: Pick<DevUiContext, 'write'>, choose: FixChoice): Promise<SendResult> {
  return write({
    edits: (state) => {
      const { fixes, description } = choose(state);
      return fixes.length === 0 ? undefined : { ediciones: fixes, ...(description !== undefined && { descripcion: description }) };
    },
    failure: 'No fix was applied',
    retry: true,
  });
}
