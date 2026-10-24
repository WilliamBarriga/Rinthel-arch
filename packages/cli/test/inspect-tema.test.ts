import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { INSPECT_CONTRACT_VERSION, salidaDeInspectSchema } from 'canonico';
import { run } from 'cli';

const RAIZ = resolve(__dirname, 'fixtures/tema-cli');

async function json(args: string[], raiz = RAIZ) {
  const r = await run(['inspect', 'tema', ...args, '--workspace', raiz, '--json']);
  return { ...r, salida: r.stdout === '' ? undefined : salidaDeInspectSchema.parse(JSON.parse(r.stdout)) };
}

const temaDe = (salida: Awaited<ReturnType<typeof json>>['salida']) => {
  if (salida?.comando !== 'tema') throw new Error('se esperaba la salida de tema');
  return salida.tema;
};
const origenes = (salida: Awaited<ReturnType<typeof json>>['salida']) =>
  Object.fromEntries(temaDe(salida).capas.map((c) => [c.nombre, `${c.origen.file}:${c.origen.line}`]));

describe('inspect tema', () => {
  it('da la cadena extends, las Capas resueltas con el archivo:linea del parche que las fijo y las Metricas', async () => {
    const r = await json(['app']);

    expect(r.exitCode).toBe(0);
    expect(r.salida).toMatchObject({ contractVersion: INSPECT_CONTRACT_VERSION, comando: 'tema' });
    const tema = temaDe(r.salida);
    expect(tema).toMatchObject({ name: 'app', file: 'app.dg', line: 1, extends: ['base'], partes: ['resalte'], temaConCodigo: false, componentes: [] });
    expect(tema.capas.map((c) => [c.nombre, c.primitiva])).toEqual([
      ['forma', 'rect'],
      ['relleno', 'solid'],
      ['borde', 'border'],
    ]);
    // `borde` lo fijo el parche del hijo; el resto viene del padre.
    expect(origenes(r.salida)).toEqual({ forma: 'base.dg:8', relleno: 'base.dg:9', borde: 'app.dg:3' });
    expect(tema.capas[2]?.props).toMatchObject({ width: 2 });
    expect(tema.metricas.fontSize).toBeGreaterThan(0);
    expect(tema.slots).toBe('column { title attrs }');
  });

  it('--tipo y --estado resuelven la cascada de un caso, con las part usadas', async () => {
    const tipo = await json(['app', '--tipo', 'servicio']);
    expect(tipo.exitCode).toBe(0);
    expect(temaDe(tipo.salida)).toMatchObject({ tipo: 'servicio', partes: ['resalte'] });
    expect(temaDe(tipo.salida).capas.map((c) => c.nombre)).toEqual(['forma', 'brillo', 'relleno', 'borde']);
    expect(origenes(tipo.salida)).toMatchObject({ brillo: 'base.dg:2', relleno: 'app.dg:5' });
    expect(temaDe(tipo.salida).capas[1]).toMatchObject({ encima: true });

    const estado = await json(['app', '--tipo', 'servicio', '--estado', 'hover']);
    expect(temaDe(estado.salida)).toMatchObject({ tipo: 'servicio', estado: 'hover' });
    expect(origenes(estado.salida)).toMatchObject({ borde: 'app.dg:8', relleno: 'app.dg:5' });
    expect(temaDe(estado.salida).capas.find((c) => c.nombre === 'borde')?.props).toMatchObject({ width: 4 });
  });

  it('un Tema incorporado sale marcado como tal; con --catalogo trae las claves del catalogo', async () => {
    const r = await json(['neutral', '--catalogo']);

    expect(r.exitCode).toBe(0);
    const tema = temaDe(r.salida);
    expect(tema.file).toBe('<incorporados>');
    expect(tema.catalogo?.primitivas).toEqual(expect.arrayContaining(['rect', 'solid', 'border', 'circle']));
    expect(tema.catalogo?.movimientos).toEqual(expect.arrayContaining(['pulso']));
    expect(tema.catalogo?.efectos.length).toBeGreaterThan(0);
    expect(temaDe((await json(['neutral'])).salida).catalogo).toBeUndefined();
  });

  it('un incorporado que extiende a otro da su cadena extends y el sitio de cada Capa en el texto incorporado', async () => {
    const tema = temaDe((await json(['neutral-dark'])).salida);

    expect(tema.extends).toEqual(['neutral']);
    // neutral-dark solo cambia la Paleta: todas sus Capas las fijo neutral, en lineas distintas del texto incorporado.
    const sitios = tema.capas.map((c) => c.origen);
    expect(sitios.every((s) => s.file === '<incorporados>' && s.line > 1)).toBe(true);
    expect(new Set(sitios.map((s) => s.line)).size).toBe(sitios.length);
  });

  it('un Tema, Tipo o estado inexistente sale con codigo 1 y sugerencia', async () => {
    const tema = await run(['inspect', 'tema', 'ap', '--workspace', RAIZ]);
    expect(tema.exitCode).toBe(1);
    expect(tema.stdout).toBe('');
    expect(tema.stderr).toContain("No existe el Tema 'ap'");
    expect(tema.stderr).toContain('app');

    const tipo = await run(['inspect', 'tema', 'app', '--tipo', 'servicioo', '--workspace', RAIZ]);
    expect(tipo.exitCode).toBe(1);
    expect(tipo.stderr).toContain('servicio');

    const estado = await run(['inspect', 'tema', 'app', '--estado', 'hovr', '--workspace', RAIZ]);
    expect(estado.exitCode).toBe(1);
    expect(estado.stderr).toContain('hover');
  });

  it('el texto legible lista cadena, Capas con su origen y Metricas', async () => {
    const r = await run(['inspect', 'tema', 'app', '--tipo', 'servicio', '--workspace', RAIZ]);

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('app app.dg:1');
    expect(r.stdout).toContain('extends: base');
    expect(r.stdout).toContain('partes: resalte');
    expect(r.stdout).toMatch(/relleno solid .*app\.dg:5/);
    expect(r.stdout).toContain('Metricas:');
  });

  it('muestra el fondo de pagina con el parche que fijo cada Capa y si queda fijo', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-pagina');
    const r = await json(['hijo'], raiz);

    expect(r.exitCode).toBe(0);
    const { pagina } = temaDe(r.salida);
    expect(pagina.fijo).toBe(true);
    expect(pagina.capas.map((c) => [c.nombre, c.primitiva, `${c.origen.file}:${c.origen.line}`])).toEqual([
      ['fondo', 'solid', 'main.dg:8'],
      ['puntos', 'dots', 'main.dg:15'],
    ]);
    expect(pagina.capas[1]?.props).toMatchObject({ size: 30 });

    const texto = await run(['inspect', 'tema', 'hijo', '--workspace', raiz]);
    expect(texto.stdout).toContain('Pagina: (fija al visor)');
    expect(texto.stdout).toMatch(/puntos dots .*main\.dg:15/);
  });

  it('muestra la pila de group, la del Grupo cerrado y la cabecera, cada Capa con el parche que la fijo', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-grupo');
    const abierto = temaDe((await json(['hijo'], raiz)).salida).grupo;
    const porTipo = temaDe((await json(['hijo', '--tipo', 'capa', '--estado', 'hover'], raiz)).salida).grupo;
    const origen = (capas: typeof abierto.capas) => Object.fromEntries(capas.map((c) => [c.nombre, `${c.origen.file}:${c.origen.line}`]));

    expect(abierto).toMatchObject({ propio: true, cabecera: 'row gap 6 pad 6 { icon title }', padding: { top: 12, left: 12, bottom: 12, right: 12 } });
    expect(abierto.alturaDeCabecera).toBeGreaterThan(0);
    expect(abierto.capas.map((c) => c.nombre)).toEqual(['caja', 'borde']);
    // `borde` lo fijo el parche del hijo (ancho); el resto viene del padre.
    expect(origen(abierto.capas)).toEqual({ caja: 'main.dg:8', borde: 'main.dg:19' });
    expect(abierto.capas[1]?.props).toMatchObject({ width: 2, color: 'tinta' });
    // Cerrado: otra pila, con la Capa que anade `state collapsed` del padre.
    expect(abierto.colapsado.capas.map((c) => c.nombre)).toEqual(['caja', 'relleno', 'borde']);
    expect(origen(abierto.colapsado.capas)['relleno']).toBe('main.dg:14');
    // Con Tipo y estado: gana el ultimo nivel que fijo la Capa.
    expect(origen(porTipo.capas)['borde']).toBe('main.dg:13');
    expect(porTipo.capas.find((c) => c.nombre === 'borde')?.props).toMatchObject({ color: 'azul', width: 3 });

    const texto = await run(['inspect', 'tema', 'hijo', '--workspace', raiz]);
    expect(texto.stdout).toContain('Grupo:');
    expect(texto.stdout).toContain('cabecera: row gap 6 pad 6 { icon title }');
    expect(texto.stdout).toMatch(/borde dashed .*main\.dg:19/);
  });

  it('un Tema sin group lo dice: pila sobria de los tokens y no las Capas del Nodo', async () => {
    const raiz = resolve(__dirname, 'fixtures/tema-grupo');
    const { grupo } = temaDe((await json(['sobrio'], raiz)).salida);

    expect(grupo).toMatchObject({ propio: false, capas: [] });
    expect((await run(['inspect', 'tema', 'sobrio', '--workspace', raiz])).stdout).toContain('Grupo: (sin group: pila sobria derivada de los tokens del Tema, no las Capas del Nodo)');
  });

  it('un Workspace con errores no se consulta (codigo 1)', async () => {
    const r = await run(['inspect', 'tema', 'app', '--workspace', join(__dirname, 'fixtures/con-errores')]);
    expect(r.exitCode).toBe(1);
  });
});
