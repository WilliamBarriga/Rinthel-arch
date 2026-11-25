import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { INSPECT_CONTRACT_VERSION, salidaDeInspectSchema } from 'canonico';
import { run } from 'cli';

const RAIZ = resolve(__dirname, 'fixtures/tema-cli');

async function json(args: string[], raiz = RAIZ) {
  const r = await run(['inspect', 'theme', ...args, '--workspace', raiz, '--json']);
  return { ...r, salida: r.stdout === '' ? undefined : salidaDeInspectSchema.parse(JSON.parse(r.stdout)) };
}

const temaDe = (salida: Awaited<ReturnType<typeof json>>['salida']) => {
  if (salida?.command !== 'theme') throw new Error('se esperaba la salida de tema');
  return salida.theme;
};
const origenes = (salida: Awaited<ReturnType<typeof json>>['salida']) =>
  Object.fromEntries(temaDe(salida).layers.map((c) => [c.name, `${c.origin.file}:${c.origin.line}`]));

describe('inspect theme', () => {
  it('da la cadena extends, las Capas resueltas con el archivo:linea del parche que las fijo y las Metricas', async () => {
    const r = await json(['app']);

    expect(r.exitCode).toBe(0);
    expect(r.salida).toMatchObject({ contractVersion: INSPECT_CONTRACT_VERSION, command: 'theme' });
    const tema = temaDe(r.salida);
    expect(tema).toMatchObject({ name: 'app', file: 'app.dg', line: 1, extends: ['base'], parts: ['resalte'], hasCode: false, components: [] });
    expect(tema.layers.map((c) => [c.name, c.primitive])).toEqual([
      ['forma', 'rect'],
      ['relleno', 'solid'],
      ['borde', 'border'],
    ]);
    // `borde` lo fijo el parche del hijo; el resto viene del padre.
    expect(origenes(r.salida)).toEqual({ forma: 'base.dg:8', relleno: 'base.dg:9', borde: 'app.dg:3' });
    expect(tema.layers[2]?.props).toMatchObject({ width: 2 });
    expect(tema.metrics.fontSize).toBeGreaterThan(0);
    expect(tema.slots).toBe('column { title attrs }');
    expect(`${tema.slotsOrigin.file}:${tema.slotsOrigin.line}`).toBe('base.dg:11');
  });

  it('--kind y --state resuelven la cascada de un caso, con las part usadas', async () => {
    const tipo = await json(['app', '--kind', 'servicio']);
    expect(tipo.exitCode).toBe(0);
    expect(temaDe(tipo.salida)).toMatchObject({ kind: 'servicio', parts: ['resalte'] });
    expect(temaDe(tipo.salida).layers.map((c) => c.name)).toEqual(['forma', 'brillo', 'relleno', 'borde']);
    expect(origenes(tipo.salida)).toMatchObject({ brillo: 'base.dg:2', relleno: 'app.dg:5' });
    expect(temaDe(tipo.salida).layers[1]).toMatchObject({ above: true });

    const estado = await json(['app', '--kind', 'servicio', '--state', 'hover']);
    expect(temaDe(estado.salida)).toMatchObject({ kind: 'servicio', state: 'hover' });
    expect(origenes(estado.salida)).toMatchObject({ borde: 'app.dg:8', relleno: 'app.dg:5' });
    expect(temaDe(estado.salida).layers.find((c) => c.name === 'borde')?.props).toMatchObject({ width: 4 });
  });

  it('un Tema incorporado sale marcado como tal; con --catalog trae las claves del catalogo', async () => {
    const r = await json(['neutral', '--catalog']);

    expect(r.exitCode).toBe(0);
    const tema = temaDe(r.salida);
    expect(tema.file).toBe('<built-in>');
    expect(tema.catalog?.primitives).toEqual(expect.arrayContaining(['rect', 'solid', 'border', 'circle']));
    expect(tema.catalog?.motions).toEqual(expect.arrayContaining(['pulse']));
    expect(tema.catalog?.effects.length).toBeGreaterThan(0);
    expect(temaDe((await json(['neutral'])).salida).catalog).toBeUndefined();
  });

  it('un incorporado que extiende a otro da su cadena extends y el sitio de cada Capa en el texto incorporado', async () => {
    const tema = temaDe((await json(['neutral-dark'])).salida);

    expect(tema.extends).toEqual(['neutral']);
    // neutral-dark solo cambia la Paleta: todas sus Capas las fijo neutral, en lineas distintas del texto incorporado.
    const sitios = tema.layers.map((c) => c.origin);
    expect(sitios.every((s) => s.file === '<built-in>' && s.line > 1)).toBe(true);
    expect(new Set(sitios.map((s) => s.line)).size).toBe(sitios.length);
  });

  it('un Tema, Tipo o estado inexistente sale con codigo 1 y sugerencia', async () => {
    const tema = await run(['inspect', 'theme', 'ap', '--workspace', RAIZ]);
    expect(tema.exitCode).toBe(1);
    expect(tema.stdout).toBe('');
    expect(tema.stderr).toContain("No such Theme 'ap'");
    expect(tema.stderr).toContain('app');

    const tipo = await run(['inspect', 'theme', 'app', '--kind', 'servicioo', '--workspace', RAIZ]);
    expect(tipo.exitCode).toBe(1);
    expect(tipo.stderr).toContain('servicio');

    const estado = await run(['inspect', 'theme', 'app', '--state', 'hovr', '--workspace', RAIZ]);
    expect(estado.exitCode).toBe(1);
    expect(estado.stderr).toContain('hover');
  });

  it('el texto legible lista cadena, Capas con su origen y Metricas', async () => {
    const r = await run(['inspect', 'theme', 'app', '--kind', 'servicio', '--workspace', RAIZ]);

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('app app.dg:1');
    expect(r.stdout).toContain('extends: base');
    expect(r.stdout).toContain('parts: resalte');
    expect(r.stdout).toMatch(/relleno solid .*app\.dg:5/);
    expect(r.stdout).toContain('Metrics:');
  });

  it('muestra el fondo de pagina con el parche que fijo cada Capa y si queda fijo', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-pagina');
    const r = await json(['hijo'], raiz);

    expect(r.exitCode).toBe(0);
    const { page: pagina } = temaDe(r.salida);
    expect(pagina.fixed).toBe(true);
    expect(pagina.layers.map((c) => [c.name, c.primitive, `${c.origin.file}:${c.origin.line}`])).toEqual([
      ['fondo', 'solid', 'main.dg:8'],
      ['puntos', 'dots', 'main.dg:15'],
    ]);
    expect(pagina.layers[1]?.props).toMatchObject({ size: 30 });

    const texto = await run(['inspect', 'theme', 'hijo', '--workspace', raiz]);
    expect(texto.stdout).toContain('Page: (fixed to the viewer)');
    expect(texto.stdout).toMatch(/puntos dots .*main\.dg:15/);
  });

  it('muestra la pila de group, la del Grupo cerrado y la cabecera, cada Capa con el parche que la fijo', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-grupo');
    const abierto = temaDe((await json(['hijo'], raiz)).salida).group;
    const porTipo = temaDe((await json(['hijo', '--kind', 'capa', '--state', 'hover'], raiz)).salida).group;
    const origen = (capas: typeof abierto.layers) => Object.fromEntries(capas.map((c) => [c.name, `${c.origin.file}:${c.origin.line}`]));

    expect(abierto).toMatchObject({ own: true, header: 'row gap 6 pad 6 { icon title }', padding: { top: 12, left: 12, bottom: 12, right: 12 } });
    expect(abierto.headerHeight).toBeGreaterThan(0);
    expect(abierto.layers.map((c) => c.name)).toEqual(['caja', 'borde']);
    // `borde` lo fijo el parche del hijo (ancho); el resto viene del padre.
    expect(origen(abierto.layers)).toEqual({ caja: 'main.dg:8', borde: 'main.dg:19' });
    expect(abierto.layers[1]?.props).toMatchObject({ width: 2, color: 'tinta' });
    // Cerrado: otra pila, con la Capa que anade `state collapsed` del padre.
    expect(abierto.collapsed.layers.map((c) => c.name)).toEqual(['caja', 'relleno', 'borde']);
    expect(origen(abierto.collapsed.layers)['relleno']).toBe('main.dg:14');
    // Con Tipo y state: gana el ultimo nivel que fijo la Capa.
    expect(origen(porTipo.layers)['borde']).toBe('main.dg:13');
    expect(porTipo.layers.find((c) => c.name === 'borde')?.props).toMatchObject({ color: 'azul', width: 3 });

    const texto = await run(['inspect', 'theme', 'hijo', '--workspace', raiz]);
    expect(texto.stdout).toContain('Grupo:');
    expect(texto.stdout).toContain('header: row gap 6 pad 6 { icon title }');
    expect(texto.stdout).toMatch(/borde dashed .*main\.dg:19/);
  });

  it('muestra donde se escribio la disposicion de Slots del Nodo, de la cabecera del Grupo y del Grupo cerrado', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-grupo');
    const { group: grupo, slotsOrigin: origenDeSlots } = temaDe((await json(['hijo'], raiz)).salida);
    const sitio = ({ file, line }: { file: string; line: number }) => `${file}:${line}`;

    // El Tema `hijo` hereda de `base` su cabecera; el Grupo cerrado y el Nodo no escriben `slots`: valen la linea del Tema.
    expect(sitio(grupo.headerOrigin)).toBe('main.dg:10');
    expect(sitio(grupo.collapsed.slotsOrigin)).toBe(sitio(origenDeSlots));
    expect(sitio(origenDeSlots)).toBe('main.dg:18');

    const texto = (await run(['inspect', 'theme', 'hijo', '--workspace', raiz])).stdout;
    expect(texto).toMatch(/header: row gap 6 pad 6 \{ icon title \} \(height \d+\) main\.dg:10/);
    expect(texto).toMatch(/^Slots: .* main\.dg:18$/m);
  });

  it('las Metricas traen el padding efectivo del Grupo (cabecera mas padding), no el por defecto del Nodo', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-grupo');
    const { metrics: metricas, group: grupo } = temaDe((await json(['hijo'], raiz)).salida);

    expect(metricas['paddingGrupo']).toEqual({ top: grupo.headerHeight + 12, left: 12, bottom: 12, right: 12 });
  });

  it('un Tema sin group lo dice: pila sobria de los tokens y no las Capas del Nodo', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-grupo');
    const { group: grupo } = temaDe((await json(['sobrio'], raiz)).salida);

    expect(grupo).toMatchObject({ own: false, layers: [] });
    expect((await run(['inspect', 'theme', 'sobrio', '--workspace', raiz])).stdout).toContain('Group: (no group: sober stack derived from the Theme tokens, not the Node Layers)');
  });

  it('un Workspace con errores no se consulta (codigo 1)', async () => {
    const r = await run(['inspect', 'theme', 'app', '--workspace', join(__dirname, 'fixtures/con-errores')]);
    expect(r.exitCode).toBe(1);
  });
});

describe('inspect theme --diagram', () => {
  const RAIZ_DIAGRAMA = resolve(__dirname, 'fixtures/tema-diagrama');
  const relleno = (salida: Awaited<ReturnType<typeof json>>['salida']) => temaDe(salida).layers.find((c) => c.name === 'relleno')?.props['color'];

  it('aplica los parches diagram de ese Tipo de diagrama a la cascada', async () => {
    const sin = await json(['t'], RAIZ_DIAGRAMA);
    const flujo = await json(['t', '--diagram', 'flow'], RAIZ_DIAGRAMA);
    const arquitectura = await json(['t', '--diagram', 'architecture'], RAIZ_DIAGRAMA);

    expect(relleno(sin.salida)).toBe('azul');
    expect(relleno(arquitectura.salida)).toBe('azul');
    expect(relleno(flujo.salida)).toBe('verde');
    expect(temaDe(flujo.salida)).toMatchObject({ diagram: 'flow' });
  });

  it('un Tipo de diagrama desconocido sale con codigo 1 y sugiere el cercano', async () => {
    const r = await run(['inspect', 'theme', 't', '--diagram', 'flo', '--workspace', RAIZ_DIAGRAMA]);

    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('flow');
  });
});

describe('inspect theme: elementos de secuencia y fila', () => {
  const RAIZ_SECUENCIA = resolve(__dirname, 'fixtures/tema-secuencia');

  it('muestra la pila, los parches y las Metricas de cada elemento declarado', async () => {
    const r = await json(['t'], RAIZ_SECUENCIA);

    const { elements: elementos } = temaDe(r.salida);
    expect(elementos?.sequence?.['message']).toMatchObject({
      layers: [{ name: 'linea', primitive: 'line' }],
      markers: { end: 'arrow' },
      metrics: { gap: 40 },
      patches: { reply: [{ name: 'linea', primitive: 'line', props: { style: 'dashed' } }] },
    });
    expect(elementos?.sequence?.['fragment']?.patches['alt']?.map((c) => c.name)).toEqual(['forma', 'relleno']);
    expect(elementos?.sequence?.['lifeline']).toBeUndefined();
    expect(elementos?.row).toMatchObject({ height: 30, layers: [{ name: 'fondo' }] });
  });

  it('--diagram sequence de un Tema sin lifeline muestra el lifeline derivado de edge, discontinuo y con derived: true', async () => {
    const r = await json(['app', '--diagram', 'sequence']);

    const secuencia = temaDe(r.salida).elements?.sequence;
    expect(secuencia?.['lifeline']).toMatchObject({ derived: true, layers: [{ primitive: 'line', props: { style: 'dashed' } }], markers: { end: 'cross' } });
    // Los cinco Elementos de secuencia, todos derivados: el Tema no declara ninguno.
    expect(Object.keys(secuencia ?? {}).sort()).toEqual(['activation', 'fragment', 'lifeline', 'message', 'note']);
    expect(Object.values(secuencia ?? {}).every((e) => e.derived === true)).toBe(true);
    // La activacion toma solo forma, relleno y borde del Nodo; `reply` lleva la continuidad opuesta.
    expect(secuencia?.['activation']?.layers.map((c) => c.name)).toEqual(['forma', 'relleno', 'borde']);
    expect(secuencia?.['message']?.patches['reply']?.at(-1)?.props).toMatchObject({ style: 'dashed' });
  });

  it('un Elemento declarado no lleva derivado y --diagram er deriva la fila', async () => {
    const declarado = await json(['t', '--diagram', 'sequence'], RAIZ_SECUENCIA);
    const er = await json(['app', '--diagram', 'er']);

    expect(temaDe(declarado.salida).elements?.sequence?.['message']?.derived).toBeUndefined();
    expect(temaDe(declarado.salida).elements?.sequence?.['lifeline']?.derived).toBe(true);
    expect(temaDe(er.salida).elements?.row).toMatchObject({ derived: true, layers: [] });
  });

  it('el texto legible marca los Elementos derivados', async () => {
    const r = await run(['inspect', 'theme', 'app', '--diagram', 'sequence', '--workspace', RAIZ]);

    expect(r.stdout).toMatch(/Sequence:\n {2}lifeline \(derived\):[^\n]*end=cross/);
  });

  it('el texto legible lista los elementos y un Tema sin ellos no los menciona', async () => {
    const con = await run(['inspect', 'theme', 't', '--workspace', RAIZ_SECUENCIA]);
    const sin = await run(['inspect', 'theme', 'app', '--workspace', RAIZ]);

    expect(con.stdout).toMatch(/Sequence:\n {2}message:[^\n]*\n[\s\S]*patch reply/);
    expect(con.stdout).toMatch(/Row: height 30/);
    expect(sin.stdout).not.toMatch(/Sequence:|Row:/);
  });
});

describe('inspect theme: los Elementos declarados salen como antes de la derivacion', () => {
  const RAIZ_SECUENCIA = resolve(__dirname, 'fixtures/tema-secuencia');
  /** Salida grabada sin derivacion de Elementos para el mismo Workspace: la referencia independiente. */
  const deMain = (caso: string): string => readFileSync(resolve(__dirname, `fixtures/inspect-tema-main/t-${caso}.json`), 'utf8');

  it.each([
    ['none', []],
    ['er', ['--diagram', 'er']],
    ['flow', ['--diagram', 'flow']],
  ])('sin Elementos derivados (%s), la salida es exactamente la de antes', async (caso, extra) => {
    const r = await run(['inspect', 'theme', 't', ...extra, '--workspace', RAIZ_SECUENCIA, '--json']);

    expect(r.stdout).toBe(deMain(caso));
  });

  it('con --diagram sequence, la salida es la de antes mas los Elementos derivados, marcados', async () => {
    const r = await run(['inspect', 'theme', 't', '--diagram', 'sequence', '--workspace', RAIZ_SECUENCIA, '--json']);
    const salida = JSON.parse(r.stdout) as { theme: { elements: { sequence: Record<string, { derived?: true }> } } };
    const { sequence: secuencia } = salida.theme.elements;
    const derivados = Object.keys(secuencia).filter((nombre) => secuencia[nombre]?.derived === true);
    for (const nombre of derivados) delete secuencia[nombre];

    expect(derivados.sort()).toEqual(['activation', 'lifeline', 'note']);
    expect(salida).toEqual(JSON.parse(deMain('sequence')));
  });
});

describe('inspect theme sin --diagram', () => {
  it('Capas y Metricas sin parches de Tipo de diagrama, como antes (un parche diagram architecture no entra)', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-diagrama-arquitectura');
    const r = await run(['inspect', 'theme', 't', '--workspace', raiz, '--json']);

    expect(r.stdout).toBe(readFileSync(resolve(__dirname, 'fixtures/inspect-tema-main/arquitectura-none.json'), 'utf8'));
    expect(JSON.parse(r.stdout).theme.slots).toBe('column { title attrs }');
  });
});
