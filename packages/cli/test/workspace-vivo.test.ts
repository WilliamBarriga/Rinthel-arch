import { afterEach, describe, expect, it } from 'vitest';

import type { EstadoDeDev } from 'canonico';
import { hashDeContenido } from 'sesion';

import { puertoEnMemoria } from '../src/puerto-en-memoria';
import { abrirWorkspaceVivo } from '../src/workspace-vivo';
import type { OpcionesDelWorkspaceVivo, Reloj, WorkspaceVivo } from '../src/workspace-vivo';

/** Reloj falso: las tareas programadas solo corren al `avanzar`. */
function relojFalso(): Reloj & { avanzar(ms: number): void; pendientes(): number } {
  let ahora = 0;
  let tareas: { en: number; fn: () => void }[] = [];
  return {
    programar(fn, ms) {
      const tarea = { en: ahora + ms, fn };
      tareas.push(tarea);
      return () => {
        tareas = tareas.filter((t) => t !== tarea);
      };
    },
    avanzar(ms) {
      ahora += ms;
      const vencidas = tareas.filter((t) => t.en <= ahora);
      tareas = tareas.filter((t) => t.en > ahora);
      for (const t of vencidas) t.fn();
    },
    pendientes: () => tareas.length,
  };
}

const abiertos: WorkspaceVivo[] = [];
afterEach(() => {
  for (const ws of abiertos.splice(0)) ws.cerrar();
});

async function abrir(puerto: ReturnType<typeof puertoEnMemoria>, extra: Partial<OpcionesDelWorkspaceVivo> = {}) {
  const reloj = relojFalso();
  const ws = await abrirWorkspaceVivo({ puerto, reloj, debounceMs: 100, raiz: '/ws', ...extra });
  abiertos.push(ws);
  return { ws, reloj };
}

/** Promesa del siguiente estado empujado a los suscriptores. */
const siguiente = (ws: WorkspaceVivo): Promise<EstadoDeDev> =>
  new Promise((ok) => {
    const dejar = ws.suscribir((estado) => {
      dejar();
      ok(estado);
    });
  });

/** Edicion externa seguida del debounce completo: resuelve con el estado empujado. */
async function cambiarFuera(ws: WorkspaceVivo, reloj: ReturnType<typeof relojFalso>, cambiar: () => void): Promise<EstadoDeDev> {
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
    ws.suscribir((e) => empujados.push(e.version));

    for (let i = 0; i < 5; i++) {
      puerto.editarFuera('main.dg', `${MODELO + tema('papel')}\n// ${i}\n`);
      reloj.avanzar(50);
    }
    expect(empujados).toEqual([]);
    expect(reloj.pendientes()).toBe(1);
    const proximo = siguiente(ws);
    reloj.avanzar(100);
    await proximo;

    expect(empujados).toEqual([1]);
    expect(ws.estado().hashes['main.dg']).toBe(hashDeContenido(`${MODELO + tema('papel')}\n// 4\n`));
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

const pin = (x: number, y: number) => ({ tipo: 'mover-pin', vista: 'general', nodo: 'api', x, y }) as const;

describe('Workspace vivo: Gestos con la version vista', () => {
  it('con la version vigente escribe la edicion, recompila y responde la version nueva', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);

    const r = await ws.editar(pin(10, 20), ws.estado().version);

    expect(r).toEqual({ ok: true, version: 1 });
    expect(puerto.texto('main.dg')).toContain('node api { pin 10,20 }');
    expect(ws.estado().version).toBe(1);
    expect(ws.estado().hashes['main.dg']).toBe(hashDeContenido(puerto.texto('main.dg')!));
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

  it('un cambio externo en el mismo archivo se rechaza como hash-desactualizado y no escribe', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws, reloj } = await abrir(puerto);
    const vista = ws.estado().version;
    puerto.editarFuera('main.dg', `${BASE}\n`);

    expect(await ws.editar(pin(1, 2), vista)).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    // Tambien tras recompilar: la version vieja sigue guardada, pero su hash ya no es el del disco.
    await cambiarFuera(ws, reloj, () => puerto.editarFuera('main.dg', `${BASE}\n\n`));
    expect(await ws.editar(pin(1, 2), vista)).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    expect(puerto.texto('main.dg')).toBe(`${BASE}\n\n`);
  });

  it('una version ya olvidada (mas de 16 versiones atras) se rechaza como hash-desactualizado', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE, 'otro.dg': '// 0\n' } });
    const { ws, reloj } = await abrir(puerto);
    for (let i = 1; i <= 15; i++) await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', `// ${i}\n`));
    expect(ws.estado().version).toBe(15);
    expect((await ws.editar(pin(1, 2), 0)).ok).toBe(true); // la version 0 es la 16a guardada: aun vale

    await cambiarFuera(ws, reloj, () => puerto.editarFuera('otro.dg', '// 17\n'));
    const r = await ws.editar(pin(3, 4), 0);

    expect(r).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
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

    expect(await ws.editar({ ...pin(1, 2), vista: 'nada' }, 0)).toMatchObject({ ok: false, motivo: 'vista-desconocida' });
    expect(await ws.editar({ ...pin(1, 2), nodo: 'fantasma' }, 0)).toMatchObject({ ok: false, motivo: 'invalida' });
    expect(await ws.editar(pin(1, 2), 0)).toMatchObject({ ok: false, motivo: 'archivo-desconocido', file: 'vistas.dg' });
    expect(puerto.leer().propios).toEqual({ 'main.dg': modelo });
    expect(ws.estado().version).toBe(0);
  });

  it('ordenar-lifelines se escribe con la version vista', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': secuencia(100) } });
    const { ws } = await abrir(puerto);

    expect((await ws.editar({ tipo: 'ordenar-lifelines', vista: 'v', orden: ['b', 'a'] }, 0)).ok).toBe(true);
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

    expect(await ws.deshacer()).toMatchObject({ ok: false, motivo: 'nada-que-deshacer' });
    expect(await ws.rehacer()).toMatchObject({ ok: false, motivo: 'nada-que-rehacer' });
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
    expect(await ws.rehacer()).toMatchObject({ ok: false, motivo: 'nada-que-rehacer' });
  });

  it('tras una edicion externa, deshacer rechaza como hash-desactualizado sin pisarla y el historial empieza de nuevo', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': BASE } });
    const { ws } = await abrir(puerto);
    await ws.editar(pin(1, 2));
    const externo = `${puerto.texto('main.dg')!}\n// editado a mano\n`;
    puerto.editarFuera('main.dg', externo);

    expect(await ws.deshacer()).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    expect(puerto.texto('main.dg')).toBe(externo);
    expect(await ws.deshacer()).toMatchObject({ ok: false, motivo: 'nada-que-deshacer' });
    // Una edicion sobre el texto externo apila desde ahi: deshacerla vuelve al texto externo.
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
    expect(b).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
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
