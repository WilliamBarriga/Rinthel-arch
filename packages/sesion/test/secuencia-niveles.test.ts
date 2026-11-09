import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import { abrirSesion } from 'sesion';

const modelo = (interaccion: string, vistas: string) => `specification { node servicio }
model {
  servicio cliente
  servicio sistema {
    servicio api
    servicio db
  }
  servicio cola
${interaccion}
}
${vistas}`;

const escenario = `  interaction i {
    cliente -> sistema.api "pedir"
    sistema.api -> sistema.db "consultar"
    reply sistema.db -> sistema.api "filas"
    sistema.api -> cola "evento"
    reply sistema.api -> cliente "ok"
  }`;

function resolver(texto: string, vista: string) {
  const sesion = abrirSesion({ 'main.dg': texto });
  const vr = resolveView(sesion.fuente!, vista);
  return { sesion, resuelta: vr!, mensajes: vr?.interaction?.messages ?? [] };
}

describe('seam sesion: depth, collapsed y exclude en secuencia', () => {
  it('depth funde las hijas en su Grupo y un Mensaje interno pasa a ser propio', async () => {
    const texto = modelo(escenario, 'view v { type sequence\n interaction i\n depth 1 }\n');
    const { sesion, resuelta, mensajes } = resuelta_(texto);
    expect(await sesion.diagnosticar()).toEqual([]);
    expect(resuelta.nodes.map((n) => n.id)).toEqual(['cliente', 'sistema', 'cola']);
    expect(mensajes.map((m) => [m.from, m.to])).toEqual([
      ['cliente', 'sistema'],
      ['sistema', 'sistema'],
      ['sistema', 'sistema'],
      ['sistema', 'cola'],
      ['sistema', 'cliente'],
    ]);
    const g = (await sesion.geometria('v'))!.geometry;
    if (g.kind !== 'secuencia') throw new Error('secuencia');
    // El Mensaje propio dibuja el lazo (4 puntos).
    expect(g.messages['1']!.points).toHaveLength(4);
  });

  it('collapsed de un Grupo hace lo mismo que depth para ese Grupo', () => {
    const { resuelta } = resuelta_(modelo(escenario, 'view v { type sequence\n interaction i\n collapsed sistema }\n'));
    expect(resuelta.nodes.map((n) => n.id)).toEqual(['cliente', 'sistema', 'cola']);
  });

  it('exclude quita la Lifeline y sus Mensajes, y un Fragmento que queda vacio desaparece', () => {
    const texto = modelo(
      `  interaction i {
    cliente -> sistema.api "pedir"
    opt "con cache" {
      sistema.api -> sistema.db "leer"
    }
    reply sistema.api -> cliente "ok"
  }`,
      'view v { type sequence\n interaction i\n exclude sistema.db }\n',
    );
    const { resuelta, mensajes } = resuelta_(texto);
    expect(resuelta.nodes.map((n) => n.id)).toEqual(['cliente', 'sistema.api']);
    expect(mensajes.map((m) => m.ruta)).toEqual(['0', '2']);
    expect(resuelta.interaction!.items.map((i) => i.type)).toEqual(['message', 'message']);
  });

  it('exclude de un Grupo colapsado quita tambien los Mensajes de sus hijas', () => {
    const { mensajes } = resuelta_(modelo(escenario, 'view v { type sequence\n interaction i\n depth 1\n exclude sistema }\n'));
    expect(mensajes).toEqual([]);
  });
});

describe('seam sesion: autonumber', () => {
  const vistas = `view completa { type sequence
 interaction i
 autonumber }
view sin_db { type sequence
 interaction i
 exclude sistema.db
 autonumber }
view sin_numero { type sequence
 interaction i }
`;

  it('numera los Mensajes proyectados, reply incluidos, y el numero entra en la etiqueta', () => {
    const { mensajes } = resuelta_(modelo(escenario, vistas), 'completa');
    expect(mensajes.map((m) => m.label)).toEqual(['1. pedir', '2. consultar', '3. filas', '4. evento', '5. ok']);
  });

  it('dos Vistas de la misma Interaccion numeran distinto segun su exclude', () => {
    const { mensajes } = resuelta_(modelo(escenario, vistas), 'sin_db');
    expect(mensajes.map((m) => m.label)).toEqual(['1. pedir', '2. evento', '3. ok']);
  });

  it('un Mensaje sin etiqueta se numera solo con el numero', () => {
    const texto = modelo('  interaction i {\n    cliente -> cola\n  }', 'view v { type sequence\n interaction i\n autonumber }\n');
    expect(resuelta_(texto).mensajes.map((m) => m.label)).toEqual(['1']);
  });

  it('cambiar autonumber cambia la clave de layout (y la geometria cacheada)', async () => {
    const sesion = abrirSesion({ 'main.dg': modelo(escenario, vistas) });
    const con = (await sesion.geometria('completa'))!;
    const sin = (await sesion.geometria('sin_numero'))!;
    expect(con.layoutKey).not.toBe(sin.layoutKey);
  });

  it('autonumber fuera de una Vista de secuencia es E_VIEW_PROPERTY_FOR_TYPE', async () => {
    const sesion = abrirSesion({ 'main.dg': modelo(escenario, 'view v { type architecture\n include **\n autonumber }\n') });
    const issues = await sesion.diagnosticar();
    expect(issues.map((i) => i.code)).toContain('E_VIEW_PROPERTY_FOR_TYPE');
  });
});

function resuelta_(texto: string, vista = 'v') {
  return resolver(texto, vista);
}
