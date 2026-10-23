import { describe, expect, it } from 'vitest';

import { CATALOGO, TEMA_NEUTRO, construirPrimitiva, crearPrng, estiloResuelto, fnv1a, giroDeCapa, semillaDeCapa, temaResueltoSchema } from 'tema';

describe('semilla determinista', () => {
  it('FNV-1a de 32 bits coincide con los vectores conocidos', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('depende del id y del nombre de Capa, y de nada mas', () => {
    expect(semillaDeCapa('api', 'sketch')).toBe(semillaDeCapa('api', 'sketch'));
    expect(semillaDeCapa('api', 'sketch')).not.toBe(semillaDeCapa('api', 'otra'));
    expect(semillaDeCapa('api', 'sketch')).not.toBe(semillaDeCapa('db', 'sketch'));
  });

  it('`seed N` cambia el resultado y es reproducible', () => {
    const base = semillaDeCapa('api', 'sketch');

    expect(semillaDeCapa('api', 'sketch', 7)).toBe(semillaDeCapa('api', 'sketch', 7));
    expect(semillaDeCapa('api', 'sketch', 7)).not.toBe(base);
    expect(semillaDeCapa('api', 'sketch', 8)).not.toBe(semillaDeCapa('api', 'sketch', 7));
  });

  it('el PRNG de una Capa es la misma secuencia sin importar que mas se haya sorteado', () => {
    const a = crearPrng(semillaDeCapa('api', 'g'));
    crearPrng(semillaDeCapa('db', 'g'))();
    const b = crearPrng(semillaDeCapa('api', 'g'));

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
    expect(a()).toBeLessThan(1);
  });

  it('el giro nunca pasa del tope de la Capa y es estable', () => {
    const giros = Array.from({ length: 200 }, (_, i) => giroDeCapa(semillaDeCapa(`n${i}`, 'giro'), 3));

    expect(giros.every((g) => Math.abs(g) <= 3)).toBe(true);
    expect(new Set(giros).size).toBeGreaterThan(50);
    expect(giroDeCapa(semillaDeCapa('n1', 'giro'), 3)).toBe(giros[1]);
    expect(giroDeCapa(5, 0)).toBe(0);
  });
});

describe('Familias de efectos del catalogo', () => {
  const paleta = { azul: '#2563eb' };
  const ok = (tipo: string, props: Array<{ clave: string; valor: string | number }>) => construirPrimitiva(tipo, props, paleta);

  it('cubre sombra, glow, vidrio, filtro y decoracion, y ninguna afecta a las Metricas', () => {
    const familias = new Set(Object.values(CATALOGO).map((p) => p.familia));

    for (const f of ['sombra', 'glow', 'vidrio', 'filtro', 'decoracion']) expect(familias).toContain(f);
    for (const p of Object.values(CATALOGO).filter((d) => ['sombra', 'glow', 'vidrio', 'filtro', 'decoracion'].includes(d.familia))) expect(p.afectaMetricas).toBe(false);
  });

  it('la sombra admite inset, spread y blur 0 (sombra dura)', () => {
    const dura = ok('shadow', [{ clave: 'color', valor: 'azul' }, { clave: 'x', valor: 4 }, { clave: 'y', valor: 4 }, { clave: 'inset', valor: 1 }, { clave: 'spread', valor: -2 }]);

    expect(dura.errores).toEqual([]);
    expect(dura.primitiva?.props).toMatchObject({ blur: 0, x: 4, y: 4, inset: 1, spread: -2 });
  });

  it('el giro rechaza (sin recortar) mas de 3 grados', () => {
    expect(ok('tilt', [{ clave: 'degrees', valor: 3 }]).errores).toEqual([]);
    expect(ok('tilt', [{ clave: 'degrees', valor: 4 }]).errores.map((e) => e.codigo)).toEqual(['E_THEME_INVALID_VALUE']);
  });

  it('exige color en glow, shadow y tape, y valida el resto de Primitivas', () => {
    for (const tipo of ['glow', 'shadow', 'tape']) expect(ok(tipo, []).errores).toHaveLength(1);
    expect(ok('glass', []).primitiva).toBeDefined();
    expect(ok('sketch', []).primitiva).toBeDefined();
    expect(ok('glass', [{ clave: 'blur', valor: 999 }]).errores).toHaveLength(1);
  });

  it('`seed` del Tema es un entero no negativo en tokens', () => {
    const con = (seed: string) => temaResueltoSchema.safeParse({ ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, seed } });

    expect(con('7').success).toBe(true);
    expect(con('-1').success).toBe(false);
    expect(con('1.5').success).toBe(false);
    expect(con('x').success).toBe(false);
  });
});

describe('Capas pintadas y Metricas', () => {
  it('sombra, glow, vidrio, mano alzada y decoracion no cambian las Metricas y llevan la semilla del Tema', () => {
    const capa = (nombre: string, tipo: string, props: Record<string, string | number>) => ({ nombre, primitiva: { tipo, props } });
    const adornado = {
      ...TEMA_NEUTRO,
      tokens: { ...TEMA_NEUTRO.tokens, seed: '9' },
      nodo: {
        ...TEMA_NEUTRO.nodo,
        capas: [capa('s', 'shadow', { color: 'blue', blur: 8 }), capa('g', 'glow', { color: 'blue' }), capa('v', 'glass', {}), capa('m', 'sketch', {}), capa('t', 'tape', { color: 'blue' })],
      },
    };
    const estilo = estiloResuelto(adornado);

    expect(estilo.metricas).toEqual(estiloResuelto(TEMA_NEUTRO).metricas);
    expect(estilo.pintura.nodo.capas.map((c) => c.tipo)).toEqual(['shadow', 'glow', 'glass', 'sketch', 'tape']);
    expect(estilo.pintura.semilla).toBe(9);
    expect(estiloResuelto(TEMA_NEUTRO).pintura.semilla).toBeUndefined();
  });
});
