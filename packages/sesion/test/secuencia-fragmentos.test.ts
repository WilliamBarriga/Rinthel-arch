import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = (interaccion: string) => `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  servicio cola
${interaccion}
}
view v { type sequence
 interaction i }
`;

async function geometriaDe(texto: string) {
  const geometria = (await abrirSesion({ 'main.dg': texto }).geometria('v'))?.geometry;
  if (geometria?.kind !== 'secuencia') throw new Error('se esperaba la geometria de secuencia');
  return geometria;
}

describe('seam sesion: Fragmentos de secuencia', () => {
  it('alt con dos operandos da un marco que cubre sus Lifelines, un divisor y las guardas', async () => {
    const texto = modelo(`  interaction i {
    cliente -> api "pedir"
    alt "hay stock" {
      api -> db "reservar"
    } else "sin stock" {
      api -> cliente "rechazar"
    }
    cliente -> api "fin"
  }`);
    expect(await abrirSesion({ 'main.dg': texto }).diagnosticar()).toEqual([]);
    const g = await geometriaDe(texto);
    const [marco] = g.fragments;
    expect(g.fragments).toHaveLength(1);
    expect(marco!.operator).toBe('alt');
    expect(marco!.operands).toHaveLength(2);
    // Los Mensajes del Fragmento llevan ruta `2.<operando>.<indice>`.
    expect(Object.keys(g.messages).sort()).toEqual(['0', '1.0.0', '1.1.0', '2']);
    const reservar = g.messages['1.0.0']!.points[0]!.y;
    const rechazar = g.messages['1.1.0']!.points[0]!.y;
    // Cada Mensaje cae en la franja de su operando; el marco los contiene y los de fuera quedan fuera.
    const [op1, op2] = marco!.operands as [(typeof marco.operands)[0], (typeof marco.operands)[0]];
    expect(reservar > op1.y1 && reservar < op1.y2).toBe(true);
    expect(rechazar > op2.y1 && rechazar < op2.y2).toBe(true);
    expect(op1.divider).toBeUndefined();
    expect(op2.divider).toBe(op1.y2);
    expect(marco!.y).toBeLessThan(op1.y1 + 1);
    expect(marco!.y + marco!.height).toBe(op2.y2);
    expect(g.messages['0']!.points[0]!.y).toBeLessThan(marco!.y);
    expect(g.messages['2']!.points[0]!.y).toBeGreaterThan(marco!.y + marco!.height);
    // Ancho: de la Lifeline mas a la izquierda (cliente) a la mas a la derecha (db) del contenido, con relleno; cola queda fuera.
    expect(marco!.x).toBeLessThan(g.lifelines['cliente']!.x);
    expect(marco!.x + marco!.width).toBeGreaterThan(g.lifelines['db']!.x);
    expect(marco!.x + marco!.width).toBeLessThan(g.lifelines['db']!.x + 60);
    // La guarda del primer operando va junto a la pestana; la del segundo, bajo su divisor.
    expect(op1.guard!.text).toBe('[hay stock]');
    expect(op1.guard!.box.x).toBeGreaterThanOrEqual(marco!.tab.x + marco!.tab.width);
    expect(op2.guard!.box.y).toBe(op2.divider);
    // La pestana cabe el texto medido del operador.
    expect(marco!.tab.width).toBeGreaterThan(20);
  });

  it('par apila sus operandos en vertical con un divisor', async () => {
    const g = await geometriaDe(
      modelo(`  interaction i {
    par {
      cliente -> api "a"
    } and {
      cliente -> db "b"
    }
  }`),
    );
    const [marco] = g.fragments;
    expect(marco!.operator).toBe('par');
    expect(marco!.operands[1]!.divider).toBe(marco!.operands[0]!.y2);
    expect(g.messages['0.1.0']!.points[0]!.y).toBeGreaterThan(g.messages['0.0.0']!.points[0]!.y);
  });

  it('tres niveles anidados dan marcos concentricos, cada uno dentro del anterior', async () => {
    const g = await geometriaDe(
      modelo(`  interaction i {
    opt "uno" {
      loop "dos" {
        critical "tres" {
          cliente -> api "x"
        }
      }
    }
  }`),
    );
    expect(g.fragments.map((f) => [f.ruta, f.operator, f.nivel])).toEqual([
      ['0', 'opt', 0],
      ['0.0.0', 'loop', 1],
      ['0.0.0.0.0', 'critical', 2],
    ]);
    const [a, b, c] = g.fragments as [(typeof g.fragments)[0], (typeof g.fragments)[0], (typeof g.fragments)[0]];
    for (const [fuera, dentro] of [[a, b], [b, c]] as const) {
      expect(dentro.x).toBeGreaterThan(fuera.x);
      expect(dentro.x + dentro.width).toBeLessThan(fuera.x + fuera.width);
      expect(dentro.y).toBeGreaterThan(fuera.y);
      expect(dentro.y + dentro.height).toBeLessThan(fuera.y + fuera.height);
    }
    expect(Object.keys(g.messages)).toEqual(['0.0.0.0.0.0.0']);
    // El marco exterior queda dentro del lienzo.
    expect(a.x).toBeGreaterThanOrEqual(0);
  });

  it('un sync sin reply dentro de un Fragmento cierra su activacion al fin del Fragmento', async () => {
    const g = await geometriaDe(
      modelo(`  interaction i {
    opt {
      cliente -> api "a"
    }
    cliente -> db "b"
  }`),
    );
    const marco = g.fragments[0]!;
    const deApi = g.activations.find((a) => a.lifeline === 'api')!;
    expect(deApi.y2).toBe(marco.y + marco.height);
    // La de `db`, fuera de todo Fragmento, dura hasta el fin de la Interaccion.
    const deDb = g.activations.find((a) => a.lifeline === 'db')!;
    expect(deDb.y2).toBeGreaterThan(marco.y + marco.height);
  });

  it('un Fragmento cuyo contenido queda fuera de la Vista desaparece', async () => {
    const texto = modelo(`  interaction i {
    cliente -> api "a"
    opt { cola -> db "x" }
  }`).replace('interaction i }', 'interaction i exclude cola }');
    expect((await geometriaDe(texto)).fragments).toEqual([]);
  });

  it('alt con and y opt con else dan E_INVALID_FRAGMENT_OPERAND con hint, no E_SYNTAX_ERROR', async () => {
    const diagnosticar = (cuerpo: string) => abrirSesion({ 'main.dg': modelo(`  interaction i {\n${cuerpo}\n  }`) }).diagnosticar();
    const cruzado = await diagnosticar('alt { cliente -> api } and { cliente -> db }');
    expect(cruzado.map((d) => d.code)).toEqual(['E_INVALID_FRAGMENT_OPERAND']);
    expect(cruzado[0]!.hint).toContain('else');
    expect(cruzado[0]!.line).toBe(8);
    const sobra = await diagnosticar('opt { cliente -> api } else { cliente -> db }');
    expect(sobra.map((d) => d.code)).toEqual(['E_INVALID_FRAGMENT_OPERAND']);
    expect(sobra[0]!.hint).toBeDefined();
    const par = await diagnosticar('par { cliente -> api } else { cliente -> db }');
    expect(par.map((d) => d.code)).toEqual(['E_INVALID_FRAGMENT_OPERAND']);
    expect(par[0]!.hint).toContain('and');
  });

  it('un Mensaje con un extremo desconocido dentro de un Fragmento se ubica en el texto', async () => {
    const issues = await abrirSesion({ 'main.dg': modelo('  interaction i {\n    opt {\n      cliente -> apii "a"\n    }\n  }') }).diagnosticar();
    expect(issues.map((d) => [d.code, d.line])).toEqual([['E_UNKNOWN_LIFELINE', 9]]);
  });
});
