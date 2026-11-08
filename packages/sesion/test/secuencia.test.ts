import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = (interaccion: string, nodos = '  servicio cliente\n  servicio api\n  servicio db\n  servicio cola') => `specification { node servicio }
model {
${nodos}
${interaccion}
}
`;
const vista = 'view v { type sequence\n interaction checkout }\n';

const escenario = `  interaction checkout "Compra" {
    pedido: cliente -> api "POST /orders"
    api -> db "consulta"
    reply db -> api "filas"
    async api -> cola "evento"
    api -> api "validar"
    reply api -> api "ok"
    reply api -> cliente "201"
  }`;

async function geometriaDe(texto: string) {
  const sesion = abrirSesion({ 'main.dg': texto });
  const geometria = (await sesion.geometria('v'))?.geometry;
  if (geometria?.kind !== 'secuencia') throw new Error('se esperaba la geometria de secuencia');
  return geometria;
}
const centros = (g: Awaited<ReturnType<typeof geometriaDe>>) => Object.fromEntries(Object.entries(g.lifelines).map(([id, l]) => [id, l.x]));

describe('seam sesion: Vista de secuencia', () => {
  it('una Interaccion con sync, reply, async y mensaje propio compila sin issues y da columnas, filas y activaciones', async () => {
    const sesion = abrirSesion({ 'main.dg': modelo(escenario) + vista });
    expect(await sesion.diagnosticar()).toEqual([]);

    const g = await geometriaDe(modelo(escenario) + vista);
    // Columnas por primera aparicion.
    const x = centros(g);
    expect(Object.keys(g.lifelines)).toEqual(['cliente', 'api', 'db', 'cola']);
    expect(x['cliente']! < x['api']! && x['api']! < x['db']! && x['db']! < x['cola']!).toBe(true);
    // Filas: un Mensaje por fila, de arriba abajo.
    const filas = [0, 1, 2, 3, 4, 5, 6].map((i) => g.messages[String(i)]!.points[0]!.y);
    expect(filas).toEqual([...filas].sort((a, b) => a - b));
    expect(new Set(filas).size).toBe(7);
    // Cabeceras en la misma y; las lineas arrancan bajo ellas.
    expect(new Set(Object.values(g.nodes).map((n) => n.y)).size).toBe(1);
    expect(g.lifelines['api']!.y1).toBe(g.nodes['api']!.y + g.nodes['api']!.height);

    // Activaciones: api (pedido->201), db (consulta->filas), api anidada (validar->ok); `async` no abre ninguna.
    const deApi = g.activations.filter((a) => a.lifeline === 'api');
    expect(deApi.map((a) => a.nivel)).toEqual([0, 1]);
    const [externa, anidada] = deApi as [(typeof deApi)[0], (typeof deApi)[0]];
    expect(externa.y1).toBe(filas[0]);
    expect(externa.y2).toBe(filas[6]);
    expect(anidada.y1).toBe(filas[4]);
    expect(anidada.y2).toBe(filas[5]);
    expect(anidada.x).toBe(externa.x + externa.width / 2);
    expect(g.activations.some((a) => a.lifeline === 'cola')).toBe(false);
    const deDb = g.activations.find((a) => a.lifeline === 'db')!;
    expect([deDb.y1, deDb.y2]).toEqual([filas[1], filas[2]]);

    // Las flechas terminan en el borde de la activacion, no en la linea.
    expect(g.messages['0']!.points.at(-1)!.x).toBe(externa.x);
    expect(g.messages['2']!.points[0]!.x).toBe(deDb.x);
    expect(g.messages['2']!.points.at(-1)!.x).toBe(externa.x + externa.width);
    // El mensaje propio es un lazo de 4 puntos que sale a la derecha.
    expect(g.messages['4']!.points).toHaveLength(4);
    expect(g.messages['4']!.points[1]!.x).toBeGreaterThan(x['api']!);
    // Cada etiqueta tiene su caja encima de la flecha.
    expect(g.messages['0']!.label!.y + g.messages['0']!.label!.height).toBeLessThanOrEqual(filas[0]!);
  });

  it('el orden de Lifelines sigue a `order` (parcial) y luego la primera aparicion', async () => {
    const g = await geometriaDe(modelo(escenario) + 'view v { type sequence interaction checkout order db, cliente }\n');
    expect(Object.keys(g.lifelines)).toEqual(['db', 'cliente', 'api', 'cola']);
  });

  it('una etiqueta larga ensancha solo la separacion entre sus dos Lifelines y el layout es determinista', async () => {
    const con = (etiqueta: string) =>
      modelo(`  interaction checkout { cliente -> api "a"\n api -> db "${etiqueta}"\n db -> cola "c" }`) + vista;
    const corta = await geometriaDe(con('b'));
    const larga = await geometriaDe(con('una etiqueta muy larga que no cabe en el hueco por defecto entre columnas vecinas'));
    const separacion = (g: typeof corta, a: string, b: string) => g.lifelines[b]!.x - g.lifelines[a]!.x;

    expect(separacion(larga, 'cliente', 'api')).toBe(separacion(corta, 'cliente', 'api'));
    expect(separacion(larga, 'api', 'db')).toBeGreaterThan(separacion(corta, 'api', 'db'));
    expect(separacion(larga, 'db', 'cola')).toBe(separacion(corta, 'db', 'cola'));
    const caja = larga.messages['1']!.label!;
    expect(caja.width).toBeLessThanOrEqual(separacion(larga, 'api', 'db'));
    expect(await geometriaDe(con('b'))).toEqual(corta);
  });

  it('ni `interaction`, `reply` ni `order` como id de Nodo rompen la compilacion, y una Interaccion puede llamarse como un Nodo', async () => {
    const nodos = '  servicio interaction\n  servicio reply\n  servicio order';
    const texto = modelo('  interaction order {\n  interaction -> reply "x"\n  reply reply -> interaction\n  order -> order\n  }', nodos) + 'view v { type sequence\n interaction order\n order order, reply }\n';
    const sesion = abrirSesion({ 'main.dg': texto });
    expect(await sesion.diagnosticar()).toEqual([]);
    expect(sesion.fuente?.model.interactions[0]?.items.map((m) => [m.kind, m.from, m.to])).toEqual([
      ['sync', 'interaction', 'reply'],
      ['reply', 'reply', 'interaction'],
      ['sync', 'order', 'order'],
    ]);
  });

  it('la geometria de secuencia sobrevive al JSON del build', async () => {
    const construido = await abrirSesion({ 'main.dg': modelo(escenario) + vista }).construir();
    const { geometry } = JSON.parse(construido.archivos['geometria/v.json']!);
    expect(geometry.kind).toBe('secuencia');
  });
});

describe('seam sesion: validacion de secuencia', () => {
  const issues = async (texto: string) => abrirSesion({ 'main.dg': texto }).diagnosticar();
  const codigos = async (texto: string) => (await issues(texto)).map((i) => i.code);

  it('E_SEQUENCE_WITHOUT_INTERACTION con hint de las Interacciones existentes', async () => {
    const res = await issues(modelo(escenario) + 'view v { type sequence }\n');
    expect(res.map((i) => i.code)).toEqual(['E_SEQUENCE_WITHOUT_INTERACTION']);
    expect(res[0]!.hint).toContain('checkout');
  });

  it('E_UNKNOWN_INTERACTION en la Vista, con fix por typo', async () => {
    const texto = modelo(escenario) + 'view v { type sequence\n interaction chekout }\n';
    const res = await issues(texto);
    expect(res.map((i) => i.code)).toEqual(['E_UNKNOWN_INTERACTION']);
    expect(res[0]!.fix?.replacement).toBe('checkout');
    expect(res[0]).toMatchObject({ file: 'main.dg', line: texto.split('\n').findIndex((l) => l.includes('chekout')) + 1 });
  });

  it('E_DUPLICATE_INTERACTION con related al original', async () => {
    const res = await issues(modelo(`${escenario}\n  interaction checkout { cliente -> api }`) + vista);
    expect(res.map((i) => i.code)).toEqual(['E_DUPLICATE_INTERACTION']);
    expect(res[0]!.related).toHaveLength(1);
    expect(res[0]!.line).toBeGreaterThan(res[0]!.related![0]!.line);
  });

  it('E_UNKNOWN_LIFELINE en un extremo y en `order`, con fix por typo y nunca E_SYNTAX_ERROR', async () => {
    const enMensaje = await issues(modelo('  interaction checkout { cliente -> apii }') + vista);
    expect(enMensaje.map((i) => i.code)).toEqual(['E_UNKNOWN_LIFELINE']);
    expect(enMensaje[0]!.fix?.replacement).toBe('api');
    const enOrder = await issues(modelo(escenario) + 'view v { type sequence\n interaction checkout\n order cliente, dbb }\n');
    expect(enOrder.map((i) => i.code)).toEqual(['E_UNKNOWN_LIFELINE']);
    expect(enOrder[0]!.fix?.replacement).toBe('db');
  });

  it('E_DUPLICATE_MESSAGE_ID con related', async () => {
    const res = await issues(modelo('  interaction checkout {\n a: cliente -> api\n a: api -> db\n }') + vista);
    expect(res.map((i) => i.code)).toEqual(['E_DUPLICATE_MESSAGE_ID']);
    expect(res[0]!.related).toHaveLength(1);
  });

  it('E_VIEW_PROPERTY_FOR_TYPE: include y pin en secuencia; interaction y order fuera', async () => {
    const enSecuencia = await issues(modelo(escenario) + 'view v { type sequence\n interaction checkout\n include **\n node api { pin 10, 10 } }\n');
    expect(enSecuencia.map((i) => i.code)).toEqual(['E_VIEW_PROPERTY_FOR_TYPE', 'E_VIEW_PROPERTY_FOR_TYPE']);
    expect(enSecuencia.every((i) => i.hint !== undefined)).toBe(true);
    const fuera = await issues(modelo(escenario) + 'view v { type architecture\n include **\n interaction checkout\n order api }\n');
    expect(fuera.map((i) => i.code)).toEqual(['E_VIEW_PROPERTY_FOR_TYPE', 'E_VIEW_PROPERTY_FOR_TYPE']);
  });

  it('W_ORDER_NOT_IN_INTERACTION (aviso, se ignora) y W_REPLY_WITHOUT_SYNC', async () => {
    const orden = await issues(modelo('  interaction checkout { cliente -> api }') + 'view v { type sequence\n interaction checkout\n order cola, api }\n');
    expect(orden.map((i) => [i.code, i.severity])).toEqual([['W_ORDER_NOT_IN_INTERACTION', 'warning']]);
    const g = await geometriaDe(modelo('  interaction checkout { cliente -> api }') + 'view v { type sequence\n interaction checkout\n order cola, api }\n');
    expect(Object.keys(g.lifelines)).toEqual(['api', 'cliente']);

    const respuesta = await issues(modelo('  interaction checkout { reply api -> cliente }') + vista);
    expect(respuesta.map((i) => [i.code, i.severity])).toEqual([['W_REPLY_WITHOUT_SYNC', 'warning']]);
  });

  it('un Mensaje sin Arista entre sus Nodos es valido', async () => {
    expect(await codigos(modelo('  interaction checkout { cliente -> api }') + vista)).toEqual([]);
  });
});
