import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = (interaction: string, nodes = '  servicio cliente\n  servicio api\n  servicio db\n  servicio cola') => `specification { node servicio }
model {
${nodes}
${interaction}
}
`;
const view = 'view v { type sequence\n interaction checkout }\n';

const scenario = `  interaction checkout "Compra" {
    pedido: cliente -> api "POST /orders"
    api -> db "consulta"
    reply db -> api "filas"
    async api -> cola "evento"
    api -> api "validar"
    reply api -> api "ok"
    reply api -> cliente "201"
  }`;

async function geometryOf(text: string) {
  const session = openSession({ 'main.dg': text });
  const geometry = (await session.geometry('v'))?.geometry;
  if (geometry?.kind !== 'secuencia') throw new Error('expected the sequence geometry');
  return geometry;
}
const centers = (g: Awaited<ReturnType<typeof geometryOf>>) => Object.fromEntries(Object.entries(g.lifelines).map(([id, l]) => [id, l.x]));

describe('session seam: sequence View', () => {
  it('an Interaction with sync, reply, async and a self message compiles without issues and gives columns, rows and activations', async () => {
    const session = openSession({ 'main.dg': model(scenario) + view });
    expect(await session.diagnose()).toEqual([]);

    const g = await geometryOf(model(scenario) + view);
    // Columns by first appearance.
    const x = centers(g);
    expect(Object.keys(g.lifelines)).toEqual(['cliente', 'api', 'db', 'cola']);
    expect(x['cliente']! < x['api']! && x['api']! < x['db']! && x['db']! < x['cola']!).toBe(true);
    // Rows: one Message per row, top to bottom.
    const rows = [0, 1, 2, 3, 4, 5, 6].map((i) => g.messages[String(i)]!.points[0]!.y);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(new Set(rows).size).toBe(7);
    // Headers at the same y; the lines start below them.
    expect(new Set(Object.values(g.nodes).map((n) => n.y)).size).toBe(1);
    expect(g.lifelines['api']!.y1).toBe(g.nodes['api']!.y + g.nodes['api']!.height);

    // Activations: api (pedido->201), db (consulta->filas), nested api (validar->ok); `async` opens none.
    const ofApi = g.activations.filter((a) => a.lifeline === 'api');
    expect(ofApi.map((a) => a.nivel)).toEqual([0, 1]);
    const [outer, nested] = ofApi as [(typeof ofApi)[0], (typeof ofApi)[0]];
    expect(outer.y1).toBe(rows[0]);
    expect(outer.y2).toBe(rows[6]);
    expect(nested.y1).toBe(rows[4]);
    expect(nested.y2).toBe(rows[5]);
    expect(nested.x).toBe(outer.x + outer.width / 2);
    expect(g.activations.some((a) => a.lifeline === 'cola')).toBe(false);
    const ofDb = g.activations.find((a) => a.lifeline === 'db')!;
    expect([ofDb.y1, ofDb.y2]).toEqual([rows[1], rows[2]]);

    // Arrows end at the activation border, not at the line.
    expect(g.messages['0']!.points.at(-1)!.x).toBe(outer.x);
    expect(g.messages['2']!.points[0]!.x).toBe(ofDb.x);
    expect(g.messages['2']!.points.at(-1)!.x).toBe(outer.x + outer.width);
    // The self message is a 4-point loop that goes out to the right.
    expect(g.messages['4']!.points).toHaveLength(4);
    expect(g.messages['4']!.points[1]!.x).toBeGreaterThan(x['api']!);
    // Each label has its box above the arrow.
    expect(g.messages['0']!.label!.y + g.messages['0']!.label!.height).toBeLessThanOrEqual(rows[0]!);
  });

  it('the Lifeline order follows `order` (partial) and then the first appearance', async () => {
    const g = await geometryOf(model(scenario) + 'view v { type sequence interaction checkout order db, cliente }\n');
    expect(Object.keys(g.lifelines)).toEqual(['db', 'cliente', 'api', 'cola']);
  });

  it('a long label widens only the spacing between its two Lifelines and the layout is deterministic', async () => {
    const withLabel = (label: string) =>
      model(`  interaction checkout { cliente -> api "a"\n api -> db "${label}"\n db -> cola "c" }`) + view;
    const short = await geometryOf(withLabel('b'));
    const long = await geometryOf(withLabel('una etiqueta muy larga que no cabe en el hueco por defecto entre columnas vecinas'));
    const spacing = (g: typeof short, a: string, b: string) => g.lifelines[b]!.x - g.lifelines[a]!.x;

    expect(spacing(long, 'cliente', 'api')).toBe(spacing(short, 'cliente', 'api'));
    expect(spacing(long, 'api', 'db')).toBeGreaterThan(spacing(short, 'api', 'db'));
    expect(spacing(long, 'db', 'cola')).toBe(spacing(short, 'db', 'cola'));
    const box = long.messages['1']!.label!;
    expect(box.width).toBeLessThanOrEqual(spacing(long, 'api', 'db'));
    expect(await geometryOf(withLabel('b'))).toEqual(short);
  });

  it('neither `interaction`, `reply` nor `order` as a Node id break compilation, and an Interaction may be named like a Node', async () => {
    const nodes = '  servicio interaction\n  servicio reply\n  servicio order';
    const text = model('  interaction order {\n  interaction -> reply "x"\n  reply reply -> interaction\n  order -> order\n  }', nodes) + 'view v { type sequence\n interaction order\n order order, reply }\n';
    const session = openSession({ 'main.dg': text });
    expect(await session.diagnose()).toEqual([]);
    expect(session.source?.model.interactions[0]?.items.flatMap((m) => (m.type === 'message' ? [[m.kind, m.from, m.to]] : []))).toEqual([
      ['sync', 'interaction', 'reply'],
      ['reply', 'reply', 'interaction'],
      ['sync', 'order', 'order'],
    ]);
  });

  it('the sequence geometry survives the build JSON', async () => {
    const built = await openSession({ 'main.dg': model(scenario) + view }).build();
    const { geometry } = JSON.parse(built.files['geometria/v.json']!);
    expect(geometry.kind).toBe('secuencia');
  });
});

describe('session seam: sequence validation', () => {
  const issues = async (text: string) => openSession({ 'main.dg': text }).diagnose();
  const codes = async (text: string) => (await issues(text)).map((i) => i.code);

  it('sequence-without-interaction with a hint of the existing Interactions', async () => {
    const res = await issues(model(scenario) + 'view v { type sequence }\n');
    expect(res.map((i) => i.code)).toEqual(['sequence-without-interaction']);
    expect(res[0]!.hint).toContain('checkout');
  });

  it('unknown-interaction in the View, with a typo fix', async () => {
    const text = model(scenario) + 'view v { type sequence\n interaction chekout }\n';
    const res = await issues(text);
    expect(res.map((i) => i.code)).toEqual(['unknown-interaction']);
    expect(res[0]!.fix?.replacement).toBe('checkout');
    expect(res[0]).toMatchObject({ file: 'main.dg', line: text.split('\n').findIndex((l) => l.includes('chekout')) + 1 });
  });

  it('duplicate-interaction with related pointing at the original', async () => {
    const res = await issues(model(`${scenario}\n  interaction checkout { cliente -> api }`) + view);
    expect(res.map((i) => i.code)).toEqual(['duplicate-interaction']);
    expect(res[0]!.related).toHaveLength(1);
    expect(res[0]!.line).toBeGreaterThan(res[0]!.related![0]!.line);
  });

  it('unknown-lifeline in an end and in `order`, with a typo fix and never syntax-error', async () => {
    const inMessage = await issues(model('  interaction checkout { cliente -> apii }') + view);
    expect(inMessage.map((i) => i.code)).toEqual(['unknown-lifeline']);
    expect(inMessage[0]!.fix?.replacement).toBe('api');
    const inOrder = await issues(model(scenario) + 'view v { type sequence\n interaction checkout\n order cliente, dbb }\n');
    expect(inOrder.map((i) => i.code)).toEqual(['unknown-lifeline']);
    expect(inOrder[0]!.fix?.replacement).toBe('db');
  });

  it('duplicate-message-id with related', async () => {
    const res = await issues(model('  interaction checkout {\n a: cliente -> api\n a: api -> db\n }') + view);
    expect(res.map((i) => i.code)).toEqual(['duplicate-message-id']);
    expect(res[0]!.related).toHaveLength(1);
  });

  it('view-property-for-type: include and pin in sequence; interaction and order outside it', async () => {
    const inSequence = await issues(model(scenario) + 'view v { type sequence\n interaction checkout\n include **\n node api { pin 10, 10 } }\n');
    expect(inSequence.map((i) => i.code)).toEqual(['view-property-for-type', 'view-property-for-type']);
    expect(inSequence.every((i) => i.hint !== undefined)).toBe(true);
    const outside = await issues(model(scenario) + 'view v { type architecture\n include **\n interaction checkout\n order api }\n');
    expect(outside.map((i) => i.code)).toEqual(['view-property-for-type', 'view-property-for-type']);
  });

  it('expanded in a sequence View is view-property-for-type with a hint', async () => {
    const text = model(scenario.replace(/\bapi\b/g, 'equipo.api'), '  servicio cliente\n  servicio equipo {\n  servicio api\n  }\n  servicio db\n  servicio cola');
    const res = await issues(text + 'view v { type sequence\n interaction checkout\n expanded equipo }\n');
    expect(res.map((i) => i.code)).toEqual(['view-property-for-type']);
    expect(res[0]!.hint).toBeDefined();
  });

  it('expanded on a Node that is not a Group, or with link, in sequence only gives view-property-for-type', async () => {
    const text = model(scenario.replace(/\bapi\b/g, 'equipo.api'), '  servicio cliente\n  servicio equipo {\n  servicio api\n  }\n  servicio db\n  servicio cola');
    const notGroup = await issues(text + 'view v { type sequence\n interaction checkout\n expanded db }\n');
    expect(notGroup.map((i) => i.code)).toEqual(['view-property-for-type']);
    const withLink = await issues(text + 'view w { type architecture\n include ** }\nview v { type sequence\n interaction checkout\n expanded equipo\n link equipo -> w }\n');
    expect(withLink.map((i) => i.code)).toEqual(['view-property-for-type']);
  });

  it('the sequence Geometry has no boxes at the foot of the Lifelines', async () => {
    const g = await geometryOf(model(scenario) + view);
    expect('footers' in g).toBe(false);
  });

  it('link-not-lifeline: link from a Message or from a Node that is not a Lifeline; from a Lifeline it is valid', async () => {
    const other = 'view otra { type architecture\n include ** }\n';
    const base = model(scenario) + other;
    const fromLifeline = await issues(base + 'view v { type sequence\n interaction checkout\n link api -> otra }\n');
    expect(fromLifeline).toEqual([]);
    const fromMessage = await issues(base + 'view v { type sequence\n interaction checkout\n link pedido -> otra }\n');
    expect(fromMessage.map((i) => i.code)).toEqual(['link-not-lifeline']);
    const fromForeignNode = await issues(model('  interaction checkout { cliente -> api }') + other + 'view v { type sequence\n interaction checkout\n link db -> otra }\n');
    expect(fromForeignNode.map((i) => i.code)).toEqual(['link-not-lifeline']);
    expect(fromForeignNode[0]!.severity).toBe('error');
    // In architecture the same link is left alone.
    expect(await issues(base + 'view w { type architecture\n include **\n link api -> otra }\n')).toEqual([]);
  });

  it('order-not-in-interaction (warning, ignored) and reply-without-sync', async () => {
    const order = await issues(model('  interaction checkout { cliente -> api }') + 'view v { type sequence\n interaction checkout\n order cola, api }\n');
    expect(order.map((i) => [i.code, i.severity])).toEqual([['order-not-in-interaction', 'warning']]);
    const g = await geometryOf(model('  interaction checkout { cliente -> api }') + 'view v { type sequence\n interaction checkout\n order cola, api }\n');
    expect(Object.keys(g.lifelines)).toEqual(['api', 'cliente']);

    const reply = await issues(model('  interaction checkout { reply api -> cliente }') + view);
    expect(reply.map((i) => [i.code, i.severity])).toEqual([['reply-without-sync', 'warning']]);
  });

  it('a Message without an Edge between its Nodes is valid', async () => {
    expect(await codes(model('  interaction checkout { cliente -> api }') + view)).toEqual([]);
  });
});

describe('session seam: create and destroy', () => {
  const lifecycle = `  interaction checkout {
    cliente -> api "pedir"
    create api -> db "abrir"
    api -> db "consulta"
    destroy api -> db "cerrar"
    reply api -> cliente "listo"
  }`;

  it('the created header moves down to the height of its Message, the arrow ends at it and its line starts there', async () => {
    const g = await geometryOf(model(lifecycle) + view);
    const y = g.messages['1']!.points[0]!.y;
    expect(g.nodes['db']!.y).toBeGreaterThan(g.nodes['cliente']!.y);
    expect(g.nodes['db']!.y + g.nodes['db']!.height / 2).toBe(y);
    expect(g.lifelines['db']!.y1).toBe(g.nodes['db']!.y + g.nodes['db']!.height);
    // The arrow ends at the header border (api is to its left).
    expect(g.messages['1']!.points.at(-1)!.x).toBe(g.nodes['db']!.x);
    // create and destroy open no activations: only the sync 'consulta' opens the db one, and it is clipped at the cut.
    const ofDb = g.activations.filter((a) => a.lifeline === 'db');
    expect(ofDb.map((a) => a.y1)).toEqual([g.messages['2']!.points[0]!.y]);
    expect(ofDb[0]!.y2).toBe(g.lifelines['db']!.y2);
  });

  it('the line of the destroyed one is cut at the destroy Message and marked', async () => {
    const g = await geometryOf(model(lifecycle) + view);
    expect(g.lifelines['db']!.y2).toBe(g.messages['3']!.points[0]!.y);
    expect(g.lifelines['db']!.destroyed).toBe(true);
    expect(g.lifelines['api']!.destroyed).toBeUndefined();
    expect(g.lifelines['api']!.y2).toBeGreaterThan(g.lifelines['db']!.y2);
    expect(g.messages['3']!.points.at(-1)!.x).toBe(g.lifelines['db']!.x);
  });

  it('create-not-first with related pointing at the first appearance', async () => {
    const text = model('  interaction checkout {\n cliente -> db\n create api -> db\n }') + view;
    const res = await openSession({ 'main.dg': text }).diagnose();
    expect(res.map((i) => i.code)).toEqual(['create-not-first']);
    expect(res[0]!.related).toHaveLength(1);
    expect(res[0]!.related![0]!.line).toBeLessThan(res[0]!.line);
  });

  it('after-destroy with related pointing at the destroy', async () => {
    const text = model('  interaction checkout {\n destroy cliente -> db\n api -> db\n }') + view;
    const res = await openSession({ 'main.dg': text }).diagnose();
    expect(res.map((i) => i.code)).toEqual(['after-destroy']);
    expect(res[0]!.related).toHaveLength(1);
    expect(res[0]!.related![0]!.line).toBeLessThan(res[0]!.line);
  });
});
