import { describe, expect, it } from 'vitest';

import { STATES, parseState } from 'theme';

describe('parseState', () => {
  it('recognizes each cascade state', () => {
    for (const state of STATES) expect(parseState(state)).toEqual({ estado: state });
  });

  it('an unknown state gives the code, the message with the available ones and the nearest candidates', () => {
    const r = parseState('hovr');
    expect(r).toMatchObject({ error: { code: 'theme-unknown-state', candidatos: ['hover'] } });
    expect('error' in r && r.error.message).toContain(`available: ${STATES.join(', ')}`);
  });
});
