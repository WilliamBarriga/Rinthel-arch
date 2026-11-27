import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

describe('dsl', () => {
  it('is imported by package name and compiles a minimal Workspace', () => {
    const { canonical, issues } = compile({
      'a.dg': 'specification { node servicio }\nmodel { servicio a "A" }\n',
    });
    expect(issues).toEqual([]);
    expect(canonical?.model.nodes.map((node) => node.id)).toEqual(['a']);
  });
});
