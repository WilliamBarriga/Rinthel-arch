import { describe, expect, it } from 'vitest';

import { devStateSchema } from '../src/protocol';
import type { DevState, DevIssue } from '../src/protocol';

describe('devStateSchema (dev estado event)', () => {
  it('validates a state without Source (Workspace with errors from the start)', () => {
    const issue: DevIssue = { file: 'main.dg', line: 1, column: 1, severity: 'error', code: 'E_X', message: 'm', href: 'vscode://file/x' };
    const state: DevState = { version: 1, iconos: {}, vistas: [], cambio: 'estructura', issues: [issue] };
    expect(devStateSchema.parse(state)).toMatchObject({ version: 1, cambio: 'estructura' });
  });

  it('rejects a state without version or with an unknown change', () => {
    expect(devStateSchema.safeParse({ iconos: {}, vistas: [], issues: [] }).success).toBe(false);
    expect(devStateSchema.safeParse({ version: 1, cambio: 'otro', iconos: {}, vistas: [], issues: [] }).success).toBe(false);
  });

  it('rejects an issue without a link to the editor', () => {
    const withoutHref = { file: 'main.dg', line: 1, column: 1, severity: 'error', code: 'E_X', message: 'm' };
    expect(devStateSchema.safeParse({ version: 1, iconos: {}, vistas: [], issues: [withoutHref] }).success).toBe(false);
  });
});
