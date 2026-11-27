import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

const base = 'specification { node servicio { color blue } }  model { servicio a }';
const withFonts = (fonts: string) => compile({ 'main.dg': `${base}\ntheme t { palette { ink "#111111" }\n  ${fonts} }` });

describe('compile: fallback of the Theme fonts', () => {
  it('a non-generic family without a fallback is an error with the code and position of the entry', () => {
    const { issues } = withFonts('fonts { body "Inter"  mono "monospace" }');

    expect(issues.map((i) => i.code)).toEqual(['theme-font-no-fallback']);
    expect(issues[0]).toMatchObject({ file: 'main.dg', line: 3, message: expect.stringContaining('fonts.body'), hint: expect.stringContaining('fallback') });
  });

  it('a `fallback` or a generic family in the same list is valid', () => {
    expect(withFonts('fonts { body "Inter"  mono "JetBrains Mono"  fallback "sans-serif" }').issues).toEqual([]);
    expect(withFonts('fonts { body "Inter, sans-serif" }').issues).toEqual([]);
  });

  it('a child Theme inherits the fallback of its parent', () => {
    const result = compile({ 'main.dg': `${base}\ntheme p { palette { ink "#111111" } fonts { body "Inter" fallback "sans-serif" } }\ntheme h extends p { fonts { mono "JetBrains Mono" } }` });

    expect(result.issues).toEqual([]);
  });
});
