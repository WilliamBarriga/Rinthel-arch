import { afterEach, describe, expect, it } from 'vitest';

import type { DiferenciaDeDev, EstadoDeDev, EventoDeDev } from 'canonico';

import { abrirWorkspaceVivo, puertoEnMemoria } from 'sesion';
import type { WorkspaceVivo } from 'sesion';

import { eventoDeActividad, lineasDeActividad } from '../../../tests/ayudas/actividad';
import { relojFalso } from '../../../tests/ayudas/reloj';
import type { RelojFalso } from '../../../tests/ayudas/reloj';

type OpcionesDelWorkspaceVivo = Parameters<typeof abrirWorkspaceVivo>[0];

const abiertos: WorkspaceVivo[] = [];
afterEach(() => {
  for (const ws of abiertos.splice(0)) ws.cerrar();
});

async function abrir(puerto: ReturnType<typeof puertoEnMemoria>, extra: Partial<OpcionesDelWorkspaceVivo> = {}) {
  const reloj = relojFalso();
  const ws = await abrirWorkspaceVivo({ puerto, reloj, debounceMs: 100, raiz: '/ws', ahora: () => 0, ...extra });
  abiertos.push(ws);
  return { ws, reloj };
}

type DatosDe<N extends EventoDeDev['nombre']> = Extract<EventoDeDev, { nombre: N }>['datos'];

/** Escucha solo los eventos `nombre` del flujo; devuelve como dejar de escuchar. */
const alEvento = <N extends EventoDeDev['nombre']>(ws: WorkspaceVivo, nombre: N, fn: (datos: DatosDe<N>) => void): (() => void) =>
  ws.escuchar((evento) => {
    if (evento.nombre === nombre) fn(evento.datos as DatosDe<N>);
  });

/** Promesa del siguiente estado del flujo de eventos. */
const siguiente = (ws: WorkspaceVivo): Promise<EstadoDeDev> =>
  new Promise((ok) => {
    const dejar = alEvento(ws, 'estado', (estado) => {
      dejar();
      ok(estado);
    });
  });

/** Edicion externa seguida del debounce completo: resuelve con el estado empujado. */
async function cambiarFuera(ws: WorkspaceVivo, reloj: RelojFalso, cambiar: () => void): Promise<EstadoDeDev> {
  const proximo = siguiente(ws);
  cambiar();
  reloj.avanzar(100);
  return proximo;
}

const secuencia = (gap: number) => `specification { node servicio }
model {
  servicio a
  servicio b
  interaction i "I" { a -> b "x" }
}
theme t {
  palette { papel "#fefce8"  tinta "#1f2937" }
  node { layer forma rect  layer relleno solid { color papel }  slots { title } }
  lifeline { gap ${gap} }
}
view v { type sequence  interaction i  theme t }
`;

describe('Workspace vivo: recarga y clasificacion', () => {
  it('cambiar lifeline { gap } del Tema de una Vista de secuencia se clasifica como estructura', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': secuencia(100) } });
    const { ws, reloj } = await abrir(puerto);

    const empujado = await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', secuencia(300)));

    expect(empujado.cambio).toBe('estructura');
    expect(empujado.version).toBe(1);
  });

  it('cambiar row { height } del Tema de una Vista ER se clasifica como estructura', async () => {
    const er = (alto: number) => `specification { node tabla }
model {
  tabla t1 "T1" {
    id: uuid pk
    name: text
  }
}
theme t {
  palette { papel "#fefce8"  tinta "#1f2937" }
  node { layer forma rect  layer relleno solid { color papel }  slots { title attrs } }
  row { height ${alto} }
}
view v { type er  include **  theme t }
`;
    const puerto = puertoEnMemoria({ propios: { 'main.dg': er(20) } });
    const { ws, reloj } = await abrir(puerto);

    expect((await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', er(40)))).cambio).toBe('estructura');
  });
});

const MODELO = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
  theme t
}
`;

const tema = (relleno: string, slots = 'title attrs') => `theme t {
  palette { papel "#fefce8"  tinta "#1f2937"  rojo "#dc2626" }
  node {
    layer forma rect { radius 8 }
    layer relleno solid { color ${relleno} }
    layer borde border { color tinta width 1 }
    slots { ${slots} }
  }
}
`;

describe('Workspace vivo: mas clasificacion y recarga', () => {
  it('un cambio solo de pintura es pintura y conserva la Geometria', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MODELO + tema('papel') } });
    const { ws, reloj } = await abrir(puerto);
    const antes = await ws.geometria('general');
    expect(ws.estado().cambio).toBeUndefined();

    const empujado = await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', MODELO + tema('rojo')));

    expect(empujado.cambio).toBe('pintura');
    expect(await ws.geometria('general')).toEqual(antes);
  });

  it('un cambio de Slots o del Modelo es estructura', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MODELO + tema('papel') } });
    const { ws, reloj } = await abrir(puerto);

    expect((await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', MODELO + tema('papel', 'title')))).cambio).toBe('estructura');
    expect((await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', (MODELO + tema('papel', 'title')).replace('"Base de datos"', '"Base"')))).cambio).toBe('estructura');
  });

  it('un .tsx es codigo y una fuente nueva es estructura', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MODELO + tema('papel') }, recursos: { 'componentes/Rayo.tsx': 'a', 'fuentes/Erica.ttf': 'f1' } });
    const { ws, reloj } = await abrir(puerto);

    expect((await cambiarFuera(ws, reloj, () => puerto.tocarRecurso('componentes/Rayo.tsx', 'b'))).cambio).toBe('codigo');
    const conFuente = await cambiarFuera(ws, reloj, () => puerto.tocarRecurso('fuentes/Nueva.woff2', 'f2'));
    expect(conFuente.cambio).toBe('estructura');
    expect(Object.keys(conFuente.fuentes ?? {}).sort()).toEqual(['fuentes/Erica.ttf', 'fuentes/Nueva.woff2']);
  });

  it('con errores conserva el ultimo dibujo bueno, sin cambio; al corregir compara con lo ultimo bueno', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MODELO + tema('papel') } });
    const { ws, reloj } = await abrir(puerto);

    const roto = await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', (MODELO + tema('papel')).replace('servicio api', 'servico api')));

    expect(roto.issues[0]).toMatchObject({ file: 'main.dg', line: 6, severity: 'error' });
    expect(roto.issues[0]!.href).toContain('/ws/main.dg:6:');
    expect(roto.cambio).toBeUndefined();
    expect(roto.fuente?.model.nodes.map((n) => n.id)).toEqual(['api', 'db']);
    expect(Object.keys((await ws.geometria('general'))!.geometry.nodes).sort()).toEqual(['api', 'db']);
    const arreglado = await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', MODELO + tema('rojo')));
    expect(arreglado.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(arreglado.cambio).toBe('pintura');
  });

  it('agrupa los cambios seguidos en una sola recompilacion y no recompila antes del debounce', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MODELO + tema('papel') } });
    const { ws, reloj } = await abrir(puerto);
    const empujados: number[] = [];
    alEvento(ws, 'estado', (e) => empujados.push(e.version));

    for (let i = 0; i < 5; i++) {
      puerto.editarFuera('main.dg', MODELO.replace('"API"', `"API ${i}"`) + tema('papel'));
      reloj.avanzar(50);
    }
    expect(empujados).toEqual([]);
    expect(reloj.pendientes()).toBe(1);
    const proximo = siguiente(ws);
    reloj.avanzar(100);
    await proximo;

    expect(empujados).toEqual([1]);
    expect(ws.estado().fuente?.model.nodes.find(({ id }) => id === 'api')?.title).toBe('API 4');
  });

  it('recargar relee el puerto sin esperar al debounce; cerrar deja de observar', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MODELO + tema('papel') } });
    const { ws, reloj } = await abrir(puerto);
    puerto.editarFuera('main.dg', MODELO + tema('rojo'));

    await ws.recargar();
    expect(ws.estado()).toMatchObject({ version: 1, cambio: 'pintura' });

    ws.cerrar();
    puerto.editarFuera('main.dg', MODELO + tema('papel'));
    expect(reloj.pendientes()).toBe(0);
  });

  it('los Temas de --theme-path se compilan antes del Workspace', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MODELO }, temas: { 'temas/t.dg': tema('papel') } });
    const { ws } = await abrir(puerto);

    expect(ws.estado().fuente?.themes.map(({ name }) => name)).toContain('t');
    expect(ws.estado().issues).toEqual([]);
  });
});

const BASE = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
}
`;

const pin = (x: number, y: number) => ({ type: 'move-pin', view: 'general', node: 'api', x, y }) as const;

describe('Workspace vivo: Gestos con la version vista', () => {
  it('con la version vigente escribe la edicion, recompila y responde la version nueva', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);

    const r = await ws.editar(pin(10, 20), ws.estado().version);

    expect(r).toEqual({ ok: true, version: 1 });
    expect(puerto.texto('main.dg')).toContain('node api { pin 10,20 }');
    expect(ws.estado().version).toBe(1);
  });

  it('una version vieja aun guardada se aplica si el archivo que cambia no cambio desde entonces', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws, reloj } = await abrir(puerto);
    const vista = ws.estado().version;
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', '// otro editado\n'));

    const r = await ws.editar(pin(1, 2), vista);

    expect(r.ok).toBe(true);
    expect(puerto.texto('main.dg')).toContain('pin 1,2');
  });

  it('un cambio externo en otro archivo, aun sin recompilar, no es conflicto', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws } = await abrir(puerto);
    puerto.editarFuera('otro.dg', '// otro editado\n');

    expect((await ws.editar(pin(1, 2), 0)).ok).toBe(true);
    expect(puerto.texto('otro.dg')).toBe('// otro editado\n');
  });

  it('un cambio externo en el mismo archivo se rechaza como stale-hash y no escribe', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    const vista = ws.estado().version;
    puerto.editarFuera('main.dg', `${BASE}\n`);

    expect(await ws.editar(pin(1, 2), vista)).toMatchObject({ ok: false, reason: 'stale-hash' });
    // Tambien tras recompilar: la version vieja sigue guardada, pero su hash ya no es el del disco.
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', `${BASE}\n\n`));
    expect(await ws.editar(pin(1, 2), vista)).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(puerto.texto('main.dg')).toBe(`${BASE}\n\n`);
  });

  it('una version ya olvidada (mas de 16 versiones atras) se rechaza como stale-hash', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': '// 0\n' } });
    const { ws, reloj } = await abrir(puerto);
    for (let i = 1; i <= 15; i++) await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', `// ${i}\n`));
    expect(ws.estado().version).toBe(15);
    expect((await ws.editar(pin(1, 2), 0)).ok).toBe(true); // la version 0 es la 16a guardada: aun vale

    await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', '// 17\n'));
    const r = await ws.editar(pin(3, 4), 0);

    expect(r).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(puerto.texto('main.dg')).toContain('pin 1,2');
  });

  it('sin version se aplica sobre el texto vigente', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    puerto.editarFuera('main.dg', `${BASE}\n`);

    expect((await ws.editar(pin(1, 2))).ok).toBe(true);
  });

  it('una Vista inexistente, un Nodo inexistente o un archivo de --theme-path se rechazan sin escribir', async () => {
    const [modelo, vistas] = BASE.split('\nview general');
    const puerto = puertoEnMemoria({ propios: { 'main.dg': modelo as string }, temas: { 'vistas.dg': `view general${vistas as string}` } });
    const { ws } = await abrir(puerto);

    expect(await ws.editar({ ...pin(1, 2), view: 'nada' }, 0)).toMatchObject({ ok: false, reason: 'unknown-view' });
    expect(await ws.editar({ ...pin(1, 2), node: 'ghost' }, 0)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await ws.editar(pin(1, 2), 0)).toMatchObject({ ok: false, reason: 'unknown-file', file: 'vistas.dg' });
    expect(puerto.leer().propios).toEqual({ 'main.dg': modelo });
    expect(ws.estado().version).toBe(0);
  });

  it('reorder-lifelines se escribe con la version vista', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': secuencia(100) } });
    const { ws } = await abrir(puerto);

    expect((await ws.editar({ type: 'reorder-lifelines', view: 'v', order: ['b', 'a'] }, 0)).ok).toBe(true);
    expect(puerto.texto('main.dg')).toContain('order b, a');
  });
});

describe('Workspace vivo: deshacer, rehacer y cola de escrituras', () => {
  it('deshacer restaura el texto exacto anterior y rehacer reaplica la edicion', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2), 0);
    const conPin = puerto.texto('main.dg');

    expect(await ws.deshacer()).toEqual({ ok: true, version: 2 });
    expect(puerto.texto('main.dg')).toBe(BASE);
    expect((await ws.rehacer()).ok).toBe(true);
    expect(puerto.texto('main.dg')).toBe(conPin);
  });

  it('sin nada que deshacer o rehacer rechaza con su motivo y no escribe', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);

    expect(await ws.deshacer()).toMatchObject({ ok: false, reason: 'nothing-to-undo' });
    expect(await ws.rehacer()).toMatchObject({ ok: false, reason: 'nothing-to-redo' });
    expect(puerto.texto('main.dg')).toBe(BASE);
  });

  it('una edicion que no cambia el texto no apila; una edicion nueva descarta lo rehacible', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    await ws.editar(pin(1, 2));
    expect((await ws.deshacer()).ok).toBe(true);
    expect(puerto.texto('main.dg')).toBe(BASE);
    expect((await ws.deshacer()).ok).toBe(false);

    await ws.editar(pin(3, 4));
    expect(await ws.rehacer()).toMatchObject({ ok: false, reason: 'nothing-to-redo' });
  });

  it('una escritura externa no reinicia el Historial: deshacer da 409 solo si cambio por fuera un archivo que la entrada restaura', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws, reloj } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    const conPin = puerto.texto('main.dg')!;

    // Fuera de dev cambia otro archivo: la entrada sigue valida y deshacer no pisa el cambio ajeno.
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', '// otro a mano\n'));
    expect((await ws.deshacer()).ok).toBe(true);
    expect(puerto.leer().propios).toEqual({ 'main.dg': BASE, 'otro.dg': '// otro a mano\n' });
    expect((await ws.rehacer()).ok).toBe(true);
    expect(puerto.texto('main.dg')).toBe(conPin);

    // Fuera de dev cambia el archivo que la entrada restaura: 409 sin pisarlo, y el Historial sigue ahi.
    const externo = `${conPin}\n// editado a mano\n`;
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', externo));
    expect(await ws.deshacer()).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(await ws.deshacer()).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(puerto.texto('main.dg')).toBe(externo);
    expect(ws.historial().pasado).toHaveLength(1);

    // Una edicion sobre el texto externo apila encima: deshacerla vuelve al texto externo.
    await ws.editar(pin(5, 6));
    expect((await ws.deshacer()).ok).toBe(true);
    expect(puerto.texto('main.dg')).toBe(externo);
  });

  it('deshacer borra el archivo que creo la edicion y rehacer lo vuelve a crear', async () => {
    const base = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const puerto = { ...base, escribir: (ruta: string, texto: string) => (base.escribir(ruta, texto), ruta === 'main.dg' && base.escribir('extra.dg', '// extra\n')) };
    const { ws } = await abrir(puerto as typeof base);
    await ws.editar(pin(1, 2));
    expect(base.texto('extra.dg')).toBe('// extra\n');

    expect((await ws.deshacer()).ok).toBe(true);
    expect(base.texto('extra.dg')).toBeUndefined();
    expect((await ws.rehacer()).ok).toBe(true);
    expect(base.texto('extra.dg')).toBe('// extra\n');
  });

  it('si la escritura falla a mitad, revierte lo escrito, propaga el fallo y el historial sigue valido', async () => {
    const base = puertoEnMemoria({ propios: { 'main.dg': BASE, 'b.dg': '// b\n' } });
    const fallo = { activo: false };
    const puerto = {
      ...base,
      escribir(ruta: string, texto: string) {
        if (fallo.activo && ruta === 'main.dg') throw new Error('disco lleno');
        base.escribir(ruta, texto);
      },
    };
    const { ws } = await abrir(puerto as typeof base);
    await ws.editar(pin(1, 2));
    const conPin = base.texto('main.dg');
    base.editarFuera('b.dg', '// b\n'); // sin cambio de texto: el historial sigue valido
    await ws.deshacer();

    fallo.activo = true;
    await expect(ws.rehacer()).rejects.toThrow('disco lleno');
    expect(base.texto('main.dg')).toBe(BASE);

    fallo.activo = false;
    expect((await ws.rehacer()).ok).toBe(true);
    expect(base.texto('main.dg')).toBe(conPin);
  });

  it('las operaciones concurrentes se aplican una tras otra', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    await ws.editar(pin(3, 4));

    const resultados = await Promise.all([ws.deshacer(), ws.deshacer(), ws.deshacer()]);

    expect(resultados.map((r) => r.ok)).toEqual([true, true, false]);
    expect(puerto.texto('main.dg')).toBe(BASE);
    // Dos ediciones con la misma version vista: la segunda ve el texto que escribio la primera y se rechaza.
    const [a, b] = await Promise.all([ws.editar(pin(7, 8), ws.estado().version), ws.editar(pin(9, 9), ws.estado().version)]);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, reason: 'stale-hash' });
  });
});

describe('Workspace vivo: Historial visible y salto (#193)', () => {
  it('saltar a una entrada del pasado deja el texto justo despues de ella, conserva el futuro y lo muestra con ids y hora', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    let ahora = 1000;
    const { ws } = await abrir(puerto, { ahora: () => (ahora += 1000) });
    await ws.editar(pin(1, 2));
    const conUno = puerto.texto('main.dg');
    await ws.editar(pin(3, 4));
    await ws.editar(pin(5, 6));

    expect(await ws.saltar(1)).toMatchObject({ ok: true });
    expect(puerto.texto('main.dg')).toBe(conUno);
    const h = ws.historial();
    expect(h.pasado).toEqual([{ id: 1, descripcion: 'move api in general', archivos: ['main.dg'], cuando: 2000, alcanzable: true }]);
    expect(h.futuro.map((e) => e.id)).toEqual([2, 3]);
    expect(h.inicio).toEqual({ alcanzable: true });

    expect((await ws.saltar(0)).ok).toBe(true);
    expect(puerto.texto('main.dg')).toBe(BASE);
    expect((await ws.saltar(3)).ok).toBe(true);
    expect(ws.historial().pasado.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('cada entrada nombra solo los archivos que cambio y lleva un id creciente que no se reutiliza al descartar el futuro', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    await ws.editar(pin(3, 4));
    await ws.editar(pin(5, 6));
    await ws.deshacer();

    await ws.editar(pin(7, 8));

    expect(ws.historial().pasado.map(({ id, archivos }) => [id, archivos])).toEqual([
      [1, ['main.dg']],
      [2, ['main.dg']],
      [4, ['main.dg']],
    ]);
    expect(ws.historial().futuro).toEqual([]);
  });

  it('saltar a una entrada del futuro rehace hasta ella y conserva lo que queda despues', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    await ws.editar(pin(3, 4));
    const conDos = puerto.texto('main.dg');
    await ws.editar(pin(5, 6));
    await ws.saltar(0);

    expect((await ws.saltar(2)).ok).toBe(true);

    expect(puerto.texto('main.dg')).toBe(conDos);
    expect(ws.historial().pasado.map((e) => e.id)).toEqual([1, 2]);
    expect(ws.historial().futuro.map((e) => e.id)).toEqual([3]);
  });

  it('saltar no escribe un archivo que cambia y vuelve en el camino', async () => {
    const base = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const escritos: string[] = [];
    const puerto = { ...base, escribir: (ruta: string, texto: string) => (escritos.push(ruta), base.escribir(ruta, texto)) };
    const { ws } = await abrir(puerto as typeof base);
    await ws.editar({ ediciones: [{ file: 'main.dg', range: { start: punto(1, 1), end: punto(1, 1) }, replacement: '// x\n' }] });
    await ws.editar({ ediciones: [{ file: 'main.dg', range: { start: punto(1, 1), end: punto(2, 1) }, replacement: '' }] });
    escritos.length = 0;

    expect((await ws.saltar(0)).ok).toBe(true);

    expect(escritos).toEqual([]);
    expect(base.texto('main.dg')).toBe(BASE);
    expect(ws.historial().futuro).toHaveLength(2);
  });

  it('una escritura externa deja no alcanzables, con motivo, las entradas que restaurarian ese archivo; saltar a ellas es 409', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    await ws.editar(pin(3, 4));
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', `${puerto.texto('main.dg')}\n`));

    const h = ws.historial();
    expect(h.pasado[0]).toMatchObject({ id: 1, alcanzable: false, reason: expect.stringContaining('main.dg') });
    expect(h.pasado[1]).toMatchObject({ id: 2, alcanzable: true });
    expect(await ws.saltar(1)).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(await ws.saltar(42)).toMatchObject({ ok: false, reason: 'unknown-entry' });
  });
});

describe('Workspace vivo: confianza en el codigo', () => {
  it('no confia en el codigo hasta confiar(), salvo que se diga de antemano', async () => {
    const codigo = { componentes: {}, issues: [], bundle: 'return { A: 1 };' };
    const { ws } = await abrir(puertoEnMemoria({ propios: { 'main.dg': BASE } }), { compilarCodigo: () => codigo });
    expect(ws.codigo()).toEqual({ componentes: [], confiado: false, bundle: 'return { A: 1 };' });
    ws.confiar();
    expect(ws.codigo().confiado).toBe(true);

    const { ws: confiado } = await abrir(puertoEnMemoria({ propios: { 'main.dg': BASE } }), { confiarEnCodigo: true });
    expect(confiado.codigo().confiado).toBe(true);
  });
});

const punto = (line: number, column: number) => ({ line, column });

describe('Workspace vivo: ediciones de texto del editor', () => {
  it('aplica las ediciones con la version vista y deja una entrada "text of <file>" en el Historial', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    const r = await ws.editar({ ediciones: [{ file: 'main.dg', range: { start: punto(7, 30), end: punto(7, 30) }, replacement: ' "Datos"' }] }, ws.estado().version);

    expect(r).toEqual({ ok: true, version: 1 });
    expect(puerto.texto('main.dg')).toContain('servicio db "Base de datos" "Datos"');
    expect(ws.historial()).toMatchObject({ pasado: [{ descripcion: 'text of main.dg', archivos: ['main.dg'] }], futuro: [] });
    expect((await ws.deshacer()).ok).toBe(true);
    expect(puerto.texto('main.dg')).toBe(BASE);
    expect(ws.historial()).toMatchObject({ pasado: [], futuro: [{ descripcion: 'text of main.dg', archivos: ['main.dg'] }] });
  });

  it('la descripcion de la peticion gana; una Intencion se describe sola', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    await ws.editar({ ediciones: [{ file: 'main.dg', range: { start: punto(1, 1), end: punto(1, 1) }, replacement: '// hola\n' }], descripcion: 'Apply 1 fix' });

    expect(ws.historial().pasado.map((e) => e.descripcion)).toEqual(['move api in general', 'Apply 1 fix']);
  });

  it('si el archivo cambio por fuera desde la version vista, rechaza con stale-hash sin escribir', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    const vista = ws.estado().version;
    puerto.editarFuera('main.dg', `${BASE}\n`);

    const r = await ws.editar({ ediciones: [{ file: 'main.dg', range: { start: punto(1, 1), end: punto(1, 1) }, replacement: '// x\n' }] }, vista);
    expect(r).toMatchObject({ ok: false, reason: 'stale-hash', file: 'main.dg' });
    expect(puerto.texto('main.dg')).toBe(`${BASE}\n`);
  });

  it('con aunqueNoCompile guarda un texto con errores; el estado conserva la ultima Fuente buena con los issues', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    const rota = { ediciones: [{ file: 'main.dg', range: { start: punto(8, 3), end: punto(8, 3) }, replacement: 'fantasma -> ' }] };

    expect(await ws.editar(rota, 0)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await ws.editar({ ...rota, aunqueNoCompile: true }, 0)).toMatchObject({ ok: true });
    expect(puerto.texto('main.dg')).toContain('fantasma -> api -> db');
    expect(ws.estado().fuente?.views.map((v) => v.id)).toEqual(['general']);
    expect(ws.estado().issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('escribir en un archivo de --theme-path da unknown-file', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE }, temas: { 'tema.dg': 'theme t {}\n' } });
    const { ws } = await abrir(puerto);
    const r = await ws.editar({ ediciones: [{ file: 'tema.dg', range: { start: punto(1, 1), end: punto(1, 1) }, replacement: '// x\n' }], aunqueNoCompile: true }, 0);
    expect(r).toMatchObject({ ok: false, reason: 'unknown-file', file: 'tema.dg' });
  });
});

describe('Workspace vivo: fix y "Aplicar N fix"', () => {
  const COLGANTES = {
    'main.dg': BASE.replace('  api -> db\n', '  api -> dbb\n'),
    'mas.dg': 'model {\n  db -> apii\n}\n',
  };
  const fixesDe = (ws: WorkspaceVivo) => ws.estado().issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));

  it('los fix de varios archivos van en una peticion: se escriben juntos y quedan como una sola entrada del Historial', async () => {
    const puerto = puertoEnMemoria({ propios: COLGANTES });
    const { ws } = await abrir(puerto);
    const fixes = fixesDe(ws);
    expect(fixes.map((f) => f.file).sort()).toEqual(['main.dg', 'mas.dg']);

    const r = await ws.editar({ ediciones: fixes, descripcion: 'Aplicar 2 fix' }, ws.estado().version);

    expect(r.ok).toBe(true);
    expect(puerto.texto('main.dg')).toContain('  api -> db\n');
    expect(puerto.texto('mas.dg')).toBe('model {\n  db -> api\n}\n');
    expect(ws.estado().issues).toEqual([]);
    expect(ws.historial().pasado).toMatchObject([{ descripcion: 'Aplicar 2 fix', archivos: ['main.dg', 'mas.dg'] }]);
    expect((await ws.deshacer()).ok).toBe(true);
    expect([puerto.texto('main.dg'), puerto.texto('mas.dg')]).toEqual([COLGANTES['main.dg'], COLGANTES['mas.dg']]);
  });

  it('si dos fix se solapan no escribe nada, dice motivo y archivo y no toca el Historial', async () => {
    const puerto = puertoEnMemoria({ propios: COLGANTES });
    const { ws } = await abrir(puerto);
    const fixes = fixesDe(ws);
    const enMain = fixes.find((f) => f.file === 'main.dg')!;

    const r = await ws.editar({ ediciones: [...fixes, { ...enMain, replacement: 'otro' }], descripcion: 'Aplicar 3 fix' }, ws.estado().version);

    expect(r).toMatchObject({ ok: false, reason: 'overlapping-edits', file: 'main.dg' });
    expect([puerto.texto('main.dg'), puerto.texto('mas.dg')]).toEqual([COLGANTES['main.dg'], COLGANTES['mas.dg']]);
    expect(ws.historial().pasado).toEqual([]);
  });
});

describe('Workspace vivo: lectura de archivos para el editor', () => {
  it('lista los .dg del Workspace y los de --theme-path (estos de solo lectura) con su hash y la version', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE }, temas: { 'tema.dg': 'theme t {}\n' } });
    const { ws } = await abrir(puerto);
    const { version, archivos } = ws.archivos();
    expect(version).toBe(0);
    expect(archivos.map(({ file, soloLectura }) => ({ file, soloLectura }))).toEqual([
      { file: 'main.dg', soloLectura: false },
      { file: 'tema.dg', soloLectura: true },
    ]);
    expect(archivos[0]?.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('da el texto vigente de un archivo con su hash y la version; uno inexistente es undefined', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    expect(ws.archivo('main.dg')).toMatchObject({ file: 'main.dg', texto: BASE, version: 0 });
    expect(ws.archivo('nada.dg')).toBeUndefined();
  });
});

describe('Workspace vivo: Diferencia', () => {
  const recoger = (ws: WorkspaceVivo): DiferenciaDeDev[] => {
    const recibidas: DiferenciaDeDev[] = [];
    alEvento(ws, 'diferencia', (d) => recibidas.push(d));
    return recibidas;
  };

  it('una escritura externa empuja la Diferencia contra la Sesion anterior, con origen externo y la version del estado', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    const recibidas = recoger(ws);

    const estado = await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', BASE.replace('servicio db "Base de datos"', 'servicio db "Datos"\n  servicio cola "Cola"')));

    expect(recibidas).toEqual([
      {
        version: estado.version,
        origen: 'externo',
        agregados: [{ kind: 'node', id: 'cola' }],
        quitados: [],
        cambiados: [{ elemento: { kind: 'node', id: 'db' }, propiedades: [{ nombre: 'title', clase: 'texto' }] }],
      },
    ]);
  });

  it('las escrituras de la UI (Intencion, deshacer, rehacer) son propias y su eco no empuja otra Diferencia', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    const recibidas = recoger(ws);

    await ws.editar(pin(1, 2), 0);
    await ws.deshacer();
    await ws.rehacer();
    reloj.avanzar(100);
    await ws.recargar();

    expect(recibidas.map((d) => [d.origen, d.version])).toEqual([
      ['propio', 1],
      ['propio', 2],
      ['propio', 3],
    ]);
    expect(recibidas[0]?.cambiados).toEqual([{ elemento: { kind: 'view', id: 'general' }, propiedades: [{ nombre: 'overrides', clase: 'estructura' }] }]);
  });

  it('saltar en el Historial es una escritura propia: su Diferencia sale con origen propio y su eco no empuja otra', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    await ws.editar(pin(3, 4));
    const recibidas = recoger(ws);

    expect(await ws.saltar(0)).toMatchObject({ ok: true });
    expect((await ws.saltar(2)).ok).toBe(true);
    reloj.avanzar(100);
    await ws.recargar();

    expect(recibidas.map((d) => d.origen)).toEqual(['propio', 'propio']);
    expect(recibidas[0]?.cambiados).toEqual([{ elemento: { kind: 'view', id: 'general' }, propiedades: [{ nombre: 'overrides', clase: 'estructura' }] }]);
  });

  it('una escritura de la UI que se recompila junto a una externa en otro archivo es externa', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': 'model {\n  servicio x "X"\n}\n' } });
    const { ws } = await abrir(puerto);
    const recibidas = recoger(ws);

    puerto.editarFuera('otro.dg', 'model {\n  servicio x "X nuevo"\n}\n');
    await ws.editar(pin(1, 2), 0);

    expect(recibidas.map((d) => d.origen)).toEqual(['externo']);
    expect(recibidas[0]?.cambiados.map((c) => c.elemento)).toEqual([
      { kind: 'node', id: 'x' },
      { kind: 'view', id: 'general' },
    ]);
  });

  it('varias Sesiones con errores seguidas dan una sola Diferencia contra la ultima Sesion buena', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    const recibidas = recoger(ws);

    await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', BASE.replace('servicio api', 'servico api')));
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', BASE.replace('servicio api "API"', 'servico api "API 2"')));
    expect(recibidas).toEqual([]);
    const arreglado = await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', BASE.replace('"API"', '"API 3"')));

    expect(recibidas).toEqual([
      { version: arreglado.version, origen: 'externo', agregados: [], quitados: [], cambiados: [{ elemento: { kind: 'node', id: 'api' }, propiedades: [{ nombre: 'title', clase: 'texto' }] }] },
    ]);
  });

  it('las ediciones de texto de la UI, aun guardadas sin compilar con aunqueNoCompile, dan una sola Diferencia propia', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    const recibidas = recoger(ws);
    const insertar = (texto: string) => ({ ediciones: [{ file: 'main.dg', range: { start: punto(6, 18), end: punto(6, 18) }, replacement: texto }], aunqueNoCompile: true });

    await ws.editar(insertar(' "Atiende'));
    expect(recibidas).toEqual([]);
    await ws.editar(insertar('"'));

    expect(recibidas.map((d) => [d.origen, d.cambiados.map((c) => c.elemento)])).toEqual([['propio', [{ kind: 'node', id: 'api' }]]]);
  });

  it('volver a la ultima Sesion buena no empuja nada y la siguiente escritura propia ya no hereda el origen externo', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': '// otro\n' } });
    const { ws, reloj } = await abrir(puerto);
    const recibidas = recoger(ws);

    await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', 'model { roto'));
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', '// otro\n'));
    expect(recibidas).toEqual([]);
    await ws.editar(pin(1, 2));

    expect(recibidas.map((d) => d.origen)).toEqual(['propio']);
  });
});

describe('Workspace vivo: protocolo de eventos', () => {

  it('la instantanea de conexion da estado, Historial y la actividad con previos, en ese orden', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE }, actividad: lineasDeActividad(eventoDeActividad(3)) });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2));

    const conexion = ws.conexion();

    expect(conexion.map(({ nombre }) => nombre)).toEqual(['estado', 'historial', 'actividad']);
    expect(conexion[0]?.datos).toMatchObject({ version: 1 });
    expect(conexion[1]?.datos).toMatchObject({ pasado: [{ id: 1, descripcion: 'move api in general', archivos: ['main.dg'] }], futuro: [] });
    expect(conexion[2]?.datos).toEqual({ previos: true, eventos: [eventoDeActividad(3)] });
  });

  it('tras cada estado llega su Historial y despues su Diferencia; la actividad anexada llega sola tras el debounce', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    const recibidos: EventoDeDev[] = [];
    ws.escuchar((evento) => recibidos.push(evento));

    await ws.editar(pin(1, 2), 0);
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', BASE.replace('"API"', '"API nueva"')));
    puerto.anexarActividad(lineasDeActividad(eventoDeActividad(9)));
    expect(recibidos.map(({ nombre }) => nombre)).toEqual(['estado', 'historial', 'diferencia', 'estado', 'historial', 'diferencia']);
    reloj.avanzar(100);

    expect(recibidos.map(({ nombre }) => nombre).slice(6)).toEqual(['actividad']);
    expect(recibidos[1]?.datos).toMatchObject({ pasado: [{ id: 1 }], inicio: { alcanzable: true } });
    expect(recibidos[4]?.datos).toMatchObject({ pasado: [{ id: 1 }], inicio: { alcanzable: false } });
    expect(recibidos.map((e) => (e.nombre === 'diferencia' ? [e.datos.origen, e.datos.version] : undefined)).filter(Boolean)).toEqual([
      ['propio', 1],
      ['externo', 2],
    ]);
    expect(recibidos[6]?.datos).toEqual({ previos: false, eventos: [eventoDeActividad(9)] });
  });

  it('dejar de escuchar corta el flujo', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    const recibidos: EventoDeDev[] = [];
    const dejar = ws.escuchar((evento) => recibidos.push(evento));

    dejar();
    await ws.editar(pin(1, 2), 0);

    expect(recibidos).toEqual([]);
  });
});

describe('Workspace vivo: old file conventions (the Dev UI fix action)', () => {
  it('reports old-workspace-convention and its rename fix renames the file, together with a text fix', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'temas/t.dg': 'theme t extends neutral { node { state hover { layer borde { width 2 } } } }\n' } });
    const { ws } = await abrir(puerto);
    const fixes = ws.estado().issues.flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
    expect(ws.estado().issues.map((i) => i.code).sort()).toEqual(['old-catalog-value', 'old-workspace-convention']);

    const r = await ws.editar({ ediciones: fixes }, ws.estado().version);

    expect(r).toMatchObject({ ok: true });
    expect(puerto.texto('themes/t.dg')).toContain('layer border');
    expect(puerto.texto('temas/t.dg')).toBeUndefined();
    expect(ws.estado().issues).toEqual([]);
  });

  it('a rename onto an existing path is rejected with invalid-rename and nothing is written', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'temas/t.dg': 'theme t extends neutral-dark {\n}\n', 'themes/u.dg': 'theme u extends neutral-dark {\n}\n' } });
    const { ws } = await abrir(puerto);
    const fix = ws.estado().issues.find((i) => i.code === 'old-workspace-convention')?.fix;

    expect(await ws.editar({ ediciones: [fix!] }, ws.estado().version)).toMatchObject({ ok: false, reason: 'invalid-rename' });
    expect(puerto.texto('temas/t.dg')).toBeDefined();
  });
});
