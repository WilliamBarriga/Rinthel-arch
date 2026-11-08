import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = (interacciones: string, vista = 'view v { type sequence\n interaction i }') => `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  servicio cola
${interacciones}
}
${vista}
`;

async function geometriaDe(texto: string) {
  const geometria = (await abrirSesion({ 'main.dg': texto }).geometria('v'))?.geometry;
  if (geometria?.kind !== 'secuencia') throw new Error('se esperaba la geometria de secuencia');
  return geometria;
}

const separacion = (g: Awaited<ReturnType<typeof geometriaDe>>, a: string, b: string): number => Math.abs(g.lifelines[b]!.x - g.lifelines[a]!.x);

describe('seam sesion: Notas y ref de secuencia', () => {
  it('una Nota no es participante y `over X, Y` ensancha la separacion entre X e Y', async () => {
    const sin = modelo('  interaction i {\n    cliente -> api "a"\n    note over cliente, api "x"\n  }');
    const largo = 'una nota muy larga que obliga a separar las columnas bastante mas de lo normal';
    const con = modelo(`  interaction i {\n    cliente -> api "a"\n    note over cliente, api "${largo}"\n  }`);
    expect(await abrirSesion({ 'main.dg': con }).diagnosticar()).toEqual([]);
    const corta = await geometriaDe(sin);
    const g = await geometriaDe(con);
    expect(Object.keys(g.lifelines).sort()).toEqual(['api', 'cliente']);
    expect(g.notes).toHaveLength(1);
    expect(separacion(g, 'cliente', 'api')).toBeGreaterThan(separacion(corta, 'cliente', 'api'));
    const nota = g.notes[0]!;
    // La Nota cubre ambas Lifelines, esta bajo el Mensaje y su texto va envuelto en varias lineas.
    expect(nota.x).toBeLessThanOrEqual(g.lifelines['cliente']!.x);
    expect(nota.x + nota.width).toBeGreaterThanOrEqual(g.lifelines['api']!.x);
    expect(nota.y).toBeGreaterThan(g.messages['0']!.points[0]!.y);
    expect(nota.lines.length).toBeGreaterThan(1);
    expect(nota.lines.join(' ')).toBe(largo);
    expect(g.height).toBeGreaterThan(nota.y + nota.height);
  });

  it('left of y right of anclan la Nota a un lado de la Lifeline', async () => {
    const g = await geometriaDe(modelo('  interaction i {\n    cliente -> api "a"\n    note left of cliente "izq"\n    note right of api "der"\n  }'));
    const [izq, der] = g.notes as [(typeof g.notes)[0], (typeof g.notes)[0]];
    expect(izq.x + izq.width).toBeLessThanOrEqual(g.lifelines['cliente']!.x);
    expect(der.x).toBeGreaterThanOrEqual(g.lifelines['api']!.x);
    expect(g.width).toBeGreaterThanOrEqual(der.x + der.width);
    expect(izq.x).toBeGreaterThanOrEqual(0);
  });

  it('el marco de ref cubre los participantes de la Interaccion referida presentes en la Vista', async () => {
    const g = await geometriaDe(
      modelo('  interaction login { api -> db "auth" }\n  interaction i {\n    cliente -> api "a"\n    api -> db "b"\n    cola -> cliente "z"\n    ref login\n  }'),
    );
    const marco = g.fragments.find((m) => m.operator === 'ref')!;
    expect(marco.title?.text).toBe('login');
    expect(marco.x).toBeGreaterThan(g.lifelines['cliente']!.x);
    expect(marco.x).toBeLessThan(g.lifelines['api']!.x);
    expect(marco.x + marco.width).toBeGreaterThan(g.lifelines['db']!.x);
    expect(marco.x + marco.width).toBeLessThan(g.lifelines['cola']!.x);
    expect(marco.y).toBeGreaterThan(g.messages['2']!.points[0]!.y);
  });

  it('sin participantes en comun el marco de ref cubre todas las Lifelines', async () => {
    const g = await geometriaDe(modelo('  interaction otra { db -> cola "x" }\n  interaction i {\n    cliente -> api "a"\n    ref otra\n  }'));
    const marco = g.fragments.find((m) => m.operator === 'ref')!;
    expect(marco.x).toBeLessThan(g.lifelines['cliente']!.x);
    expect(marco.x + marco.width).toBeGreaterThan(g.lifelines['api']!.x);
  });

  it('un ref en ciclo (a se referencia a si misma) es valido', async () => {
    const texto = modelo('  interaction i {\n    cliente -> api "a"\n    ref i\n  }');
    expect(await abrirSesion({ 'main.dg': texto }).diagnosticar()).toEqual([]);
  });
});
