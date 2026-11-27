import { describe, expect, it } from 'vitest';

import { refTarget } from 'canonical';

const view = (id: string, type: string, interaction?: string) => ({ id, type, ...(interaction !== undefined && { interaction }) }) as Parameters<typeof refTarget>[0][number];

describe('refTarget', () => {
  it('is the first declared sequence View that projects the Interaction', () => {
    const views = [view('arq', 'architecture'), view('b', 'sequence', 'login'), view('a', 'sequence', 'login'), view('c', 'sequence', 'otra')];
    expect(refTarget(views, 'login')).toBe('b');
  });

  it('is undefined when no sequence View projects it', () => {
    expect(refTarget([view('arq', 'architecture'), view('c', 'sequence', 'otra')], 'login')).toBeUndefined();
  });
});
