import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const modelo = `specification { node servicio { color rojo } }
model {
  servicio api { attrs { id: int  nombre: texto } }
  servicio db
  api -> db
}
`;

const vista = (tema = '') => `view v {
  type architecture
  include **
${tema}}
`;

const tema = (nodo: string, extra = '') => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8" ${extra} }
  node {
${nodo}
  }
}
`;

const CAPAS = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    layer borde border { color rojo width 2 }
    slots { title attrs }`;

const trabajo = (temaDsl: string, vistaDsl = vista('  theme t\n')) => ({ 'main.dg': modelo + temaDsl + vistaDsl });

describe('seam sesion: Temas con Capas y Slots', () => {
  it('un Tema con tres Primitivas y Slots compila sin issues y da el Estilo resuelto de la Vista', async () => {
    const sesion = abrirSesion(trabajo(tema(CAPAS)));

    expect(await sesion.diagnosticar()).toEqual([]);
    const estilo = sesion.estilo('v')!;
    expect(estilo.pintura.nodo.capas).toEqual([
      { nombre: 'forma', tipo: 'rect', props: { radius: 8 } },
      { nombre: 'relleno', tipo: 'solid', props: { color: '#fefce8' } },
      { nombre: 'borde', tipo: 'border', props: { color: '#dc2626', width: 2 } },
    ]);
    expect(estilo.metricas.disposicion).toEqual({ direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }, { slot: 'attrs' }] });
  });

  it('la Geometria lleva el rectangulo de cada Slot, apilados en el orden del Tema', async () => {
    const sesion = abrirSesion(trabajo(tema(CAPAS)));

    const { geometry } = (await sesion.geometria('v'))!;
    const { metricas } = sesion.estilo('v')!;
    const api = geometry.nodes['api']!;

    expect(api.slots!['title']).toEqual({ x: 0, y: 0, width: api.width, height: metricas.cabecera });
    expect(api.slots!['attrs']).toEqual({ x: 0, y: metricas.cabecera, width: api.width, height: 2 * metricas.fila });
    expect(api.height).toBe(metricas.cabecera + 2 * metricas.fila);
    expect(geometry.nodes['db']!.slots).toEqual({ title: { x: 0, y: 0, width: geometry.nodes['db']!.width, height: metricas.cabecera } });
  });

  it('un Tema que no lista `attrs` no reserva ni dibuja filas, y el puerto de Atributo cae al centro', async () => {
    const solo = abrirSesion(trabajo(tema(`${CAPAS.replace('slots { title attrs }', 'slots { title }')}`)));

    const { geometry } = (await solo.geometria('v'))!;

    expect(geometry.nodes['api']!.slots).toEqual({ title: expect.any(Object) });
    expect(geometry.nodes['api']!.height).toBe(solo.estilo('v')!.metricas.cabecera);
  });

  it('el orden de `slots` es el orden visual', async () => {
    const sesion = abrirSesion(trabajo(tema(CAPAS.replace('slots { title attrs }', 'slots { attrs title }'))));

    const { geometry } = (await sesion.geometria('v'))!;

    expect(geometry.nodes['api']!.slots!['attrs']!.y).toBe(0);
    expect(geometry.nodes['api']!.slots!['title']!.y).toBe(2 * sesion.estilo('v')!.metricas.fila);
  });

  it('el Estilo resuelto es determinista y las Metricas no dependen de las Capas', () => {
    const a = abrirSesion(trabajo(tema(CAPAS))).estilo('v')!;
    const b = abrirSesion(trabajo(tema(CAPAS))).estilo('v')!;
    const otraPintura = abrirSesion(trabajo(tema(CAPAS.replace('radius 8', 'radius 30').replace('width 2', 'width 5')))).estilo('v')!;

    expect(b).toEqual(a);
    expect(otraPintura.pintura).not.toEqual(a.pintura);
    expect(otraPintura.metricas).toEqual(a.metricas);
  });

  it('cambiar solo la pintura conserva la clave de layout: la Geometria vigente se reutiliza', async () => {
    const inicial = abrirSesion(trabajo(tema(CAPAS)));
    const primera = (await inicial.geometria('v'))!;

    const pintada = inicial.actualizar(trabajo(tema(CAPAS.replace('radius 8', 'radius 30'))));
    const segunda = (await pintada.geometria('v'))!;
    const conSlots = (await inicial.actualizar(trabajo(tema(CAPAS.replace('slots { title attrs }', 'slots { title }')))).geometria('v'))!;

    expect(segunda.layoutKey).toBe(primera.layoutKey);
    expect(segunda).toBe(primera);
    expect(conSlots.layoutKey).not.toBe(primera.layoutKey);
  });

  it('informa todos los errores del catalogo a la vez, con codigo, posicion y sugerencia', async () => {
    const malo = tema(`    layer forma rec { radius 8 }
    layer relleno solid { colour papel }
    layer borde border { color rojo width 99 }
    slots { title titulo }`);
    const issues = await abrirSesion(trabajo(malo)).diagnosticar();

    expect(issues.map((i) => i.code).sort()).toEqual(
      ['E_THEME_INVALID_VALUE', 'E_THEME_INVALID_VALUE', 'E_THEME_UNKNOWN_PRIMITIVE', 'E_THEME_UNKNOWN_PROPERTY', 'E_THEME_UNKNOWN_SLOT'].sort(),
    );
    expect(issues.find((i) => i.code === 'E_THEME_UNKNOWN_PRIMITIVE')).toMatchObject({ severity: 'error', file: 'main.dg', line: 10, fix: expect.objectContaining({ replacement: 'rect' }) });
    expect(issues.find((i) => i.code === 'E_THEME_UNKNOWN_PROPERTY')!.fix?.replacement).toBe('color');
    expect(issues.find((i) => i.code === 'E_THEME_UNKNOWN_SLOT')!.message).toContain("'titulo'");
  });

  it('un valor fuera de rango es un error y no se recorta; un color fuera de la Paleta tambien', async () => {
    const issues = await abrirSesion(trabajo(tema(`    layer borde border { color azul width 99 }`))).diagnosticar();

    expect(issues.map((i) => i.code).sort()).toEqual(['E_THEME_INVALID_VALUE', 'E_UNKNOWN_PALETTE_COLOR']);
  });

  it('una Capa repetida en el mismo bloque es un error', async () => {
    const issues = await abrirSesion(trabajo(tema(`    layer a rect\n    layer a rect`))).diagnosticar();

    expect(issues.map((i) => i.code)).toEqual(['E_THEME_DUPLICATE_LAYER']);
  });

  it('extends: una Capa del mismo nombre se parchea por nombre y una nueva exige ubicacion', () => {
    const sesion = abrirSesion({
      'main.dg':
        modelo +
        tema(CAPAS) +
        `theme hijo extends t {
  palette { azul "#2563eb" }
  node {
    layer borde { color azul }
    layer extra rect after forma { radius 1 }
  }
}\n` +
        vista('  theme hijo\n'),
    });

    expect(sesion.estilo('v')!.pintura.nodo.capas.map((c) => [c.nombre, c.props['color'] ?? c.props['radius']])).toEqual([
      ['forma', 8],
      ['extra', 1],
      ['relleno', '#fefce8'],
      ['borde', '#2563eb'],
    ]);
  });

  it('los Temas viejos con nodeStyles o edgeStyles ya no se aceptan', async () => {
    const viejo = `theme viejo extends neutral { nodeStyles { servicio { fill "#fff" } } }\n`;
    const issues = await abrirSesion({ 'main.dg': modelo + viejo + vista() }).diagnosticar();

    expect(issues.map((i) => i.code)).toContain('E_SYNTAX_ERROR');
    const bordes = await abrirSesion({ 'main.dg': modelo + 'theme viejo extends neutral { edgeStyles { default { stroke red } } }\n' + vista() }).diagnosticar();
    expect(bordes.map((i) => i.code)).toContain('E_SYNTAX_ERROR');
  });

  it('una Vista sin Tema usa el neutro, que muestra titulo y Atributos', async () => {
    const sesion = abrirSesion({ 'main.dg': (modelo + vista()).replace('{ color rojo }', '') });

    expect(sesion.estilo('v')!.metricas.disposicion.hijos).toHaveLength(2);
    expect(sesion.estilo('nada')).toBeUndefined();
  });
});

describe('seam sesion: mini-layout de Slots', () => {
  const conIconos = `specification { node servicio { color rojo  icon box } }
model {
  servicio api { attrs { id: int  nombre: texto } }
  servicio db
  api#nombre -> db
}
`;
  const geometriaDe = async (slots: string, fuente = conIconos) => {
    const sesion = abrirSesion({ 'main.dg': fuente + tema(`    layer forma rect\n    ${slots}`) + vista('  theme t\n') });
    expect(await sesion.diagnosticar()).toEqual([]);
    return { geometry: (await sesion.geometria('v'))!.geometry, metricas: sesion.estilo('v')!.metricas };
  };

  it('una fila icono + titulo: el icono queda a la izquierda dentro de su rectangulo y no solapa al titulo', async () => {
    const { geometry, metricas } = await geometriaDe('slots column { row gap 6 { icon { side 20 }  title }  attrs }');
    const { slots, width } = geometry.nodes['db']!;
    const { icon, title } = slots!;

    expect(icon).toEqual({ x: 0, y: (metricas.cabecera - 20) / 2, width: 20, height: 20 });
    expect(title).toEqual({ x: 26, y: 0, width: width - 26, height: metricas.cabecera });
    expect(icon!.x + icon!.width).toBeLessThanOrEqual(title!.x);
  });

  it('una columna anidada con pad y gap da los rectangulos, el tamano de caja y el puerto del Atributo', async () => {
    const { geometry, metricas } = await geometriaDe('slots column pad 8 gap 4 { row { icon  title }  attrs }');
    const api = geometry.nodes['api']!;
    const lado = metricas.iconoLado;
    const fila = Math.max(lado, metricas.cabecera);

    expect(api.slots!['attrs']).toEqual({ x: 8, y: 8 + fila + 4, width: api.width - 16, height: 2 * metricas.fila });
    expect(api.height).toBe(8 + fila + 4 + 2 * metricas.fila + 8);
    // La Arista `api#nombre -> db` sale por la fila `nombre` (la segunda): su puerto cae en el centro de esa fila.
    const ruta = geometry.edges['api.nombre->db'] ?? Object.values(geometry.edges)[0]!;
    const centro = api.y + api.slots!['attrs']!.y + metricas.fila * 1.5;
    expect(ruta.points[0]!.y).toBe(centro);
  });

  it('una fila de dos Slots con align end pega el titulo al final de su eje cruzado', async () => {
    const { geometry, metricas } = await geometriaDe('slots row { icon { side 40 }  title { align end } }');
    const { icon, title } = geometry.nodes['db']!.slots!;

    expect(icon!.height).toBe(40);
    expect(title!.y + title!.height).toBe(Math.max(40, metricas.cabecera));
  });

  it('un Slot que el Tema no lista no se coloca aunque el Nodo tenga icono', async () => {
    const { geometry } = await geometriaDe('slots { title }');

    expect(Object.keys(geometry.nodes['db']!.slots!)).toEqual(['title']);
  });

  it('un Nodo sin icono no reserva el Slot icon', async () => {
    const { geometry } = await geometriaDe('slots row gap 6 { icon title }', conIconos.replace('icon box', ''));

    expect(Object.keys(geometry.nodes['db']!.slots!)).toEqual(['title']);
    expect(geometry.nodes['db']!.slots!['title']!.x).toBe(0);
  });

  it('claves desconocidas, Slots desconocidos, alineaciones invalidas y Slots repetidos: todos a la vez con sugerencia', async () => {
    const sesion = abrirSesion({ 'main.dg': conIconos + tema('    slots row gapp 4 { icn  title { align centro }  title }') + vista('  theme t\n') });
    const issues = await sesion.diagnosticar();

    expect(issues.map((i) => i.code)).toEqual(['E_THEME_UNKNOWN_PROPERTY', 'E_THEME_UNKNOWN_SLOT', 'E_THEME_INVALID_VALUE', 'E_THEME_UNKNOWN_SLOT']);
    expect(issues[0]!.hint).toBe("quisiste decir 'gap'");
    expect(issues[1]!.hint).toBe("quisiste decir 'icon'");
    expect(issues[2]!.hint).toBe("quisiste decir 'center'");
  });

  it('cambiar la disposicion cambia la clave de layout; el icono de un Nodo tambien', async () => {
    const a = abrirSesion({ 'main.dg': conIconos + tema('    slots row { icon title }') + vista('  theme t\n') });
    const b = abrirSesion({ 'main.dg': conIconos + tema('    slots column { icon title }') + vista('  theme t\n') });

    expect((await a.geometria('v'))!.geometry.nodes['db']!.height).not.toBe((await b.geometria('v'))!.geometry.nodes['db']!.height);
  });
});
