import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

const base = 'specification { node servicio { color blue } }  model { servicio a }';
const conFonts = (fonts: string) => compile({ 'main.dg': `${base}\ntheme t { palette { ink "#111111" }\n  ${fonts} }` });

describe('compile: reserva de las fuentes del Tema', () => {
  it('una familia no generica sin reserva es error con codigo y posicion de la entrada', () => {
    const { issues } = conFonts('fonts { body "Inter"  mono "monospace" }');

    expect(issues.map((i) => i.code)).toEqual(['E_THEME_FONT_NO_FALLBACK']);
    expect(issues[0]).toMatchObject({ file: 'main.dg', line: 3, message: expect.stringContaining('fonts.body'), hint: expect.stringContaining('fallback') });
  });

  it('vale una reserva `fallback` o una generica en la misma lista', () => {
    expect(conFonts('fonts { body "Inter"  mono "JetBrains Mono"  fallback "sans-serif" }').issues).toEqual([]);
    expect(conFonts('fonts { body "Inter, sans-serif" }').issues).toEqual([]);
  });

  it('un Tema hijo hereda la reserva de su padre', () => {
    const resultado = compile({ 'main.dg': `${base}\ntheme p { palette { ink "#111111" } fonts { body "Inter" fallback "sans-serif" } }\ntheme h extends p { fonts { mono "JetBrains Mono" } }` });

    expect(resultado.issues).toEqual([]);
  });
});
