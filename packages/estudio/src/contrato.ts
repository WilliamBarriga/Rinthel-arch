/**
 * `estudio/contrato` (solo pruebas): `probarContratoDeDev(crear)` es la suite que corre igual contra `devEnMemoria`
 * (aqui) y contra el `dev` real con `puertoEnMemoria` (en `cli`), para que el fake no mienta. Tambien exporta
 * `devEnMemoria` y `eventosSobreFetch` (transporte SSE sobre `fetch`, para Node).
 * Invariantes: las entradas son DSL de texto; las rutas se piden relativas (`/api/estado`); no entra al bundle del navegador.
 * Depende de `vitest` (peerDependency opcional), `sesion` y `canonico`.
 */
import { describe, expect, it } from 'vitest';

import type { EventoDeActividad } from 'canonico';

import type { ActividadDeDev, EstadoDeDev } from './protocolo';
import { crearLectorSse } from './sse';

export { devEnMemoria } from './dev-en-memoria';
export type { DevEnMemoria } from './dev-en-memoria';
export { crearLectorSse } from './sse';

/** Ruta relativa -> texto, como `ArchivosDelWorkspace` de `dsl`. */
type ArchivosDelWorkspace = Readonly<Record<string, string>>;

/** Un `dev` levantado para una prueba: lo que la pagina ve de el (transporte) mas una escritura ajena. */
export interface DevDePrueba {
  /** Acepta rutas relativas a la raiz del servidor. */
  fetch: typeof fetch;
  /** Mismo contrato que `DependenciasDelCliente.eventos` de la pagina. */
  eventos: (url: string, alEvento: (nombre: string, datos: string) => void) => () => void;
  /** Escritura fuera de `dev` (un agente u otro editor); `undefined` borra. */
  editarFuera(ruta: string, texto: string | undefined): void;
  /** Anexa texto a `.diagrams/actividad.jsonl`, como el CLI de otro proceso. */
  anexarActividad(texto: string): void;
  cerrar(): Promise<void>;
}

/** `temas` son los de `--theme-path` (se compilan pero no se escriben); `actividad`, el texto inicial de `.diagrams/actividad.jsonl` (sin el, el registro no existe). */
export type CrearDev = (contenido: { propios: ArchivosDelWorkspace; temas?: ArchivosDelWorkspace; actividad?: string }) => Promise<DevDePrueba>;

/** `eventos` sobre un `fetch` que entrega el cuerpo en streaming (Node 18+); la pagina usa `EventSource`. */
export function eventosSobreFetch(fetchFn: typeof fetch): DevDePrueba['eventos'] {
  return (url, alEvento) => {
    const abortar = new AbortController();
    const leer = crearLectorSse(alEvento);
    void (async () => {
      const res = await fetchFn(url, { signal: abortar.signal });
      const lector = res.body?.getReader();
      if (lector === undefined) return;
      const decodificador = new TextDecoder();
      for (;;) {
        const { value, done } = await lector.read();
        if (done) return;
        leer(decodificador.decode(value, { stream: true }));
      }
    })().catch(() => undefined);
    return () => abortar.abort();
  };
}

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db "lee"
}

view general {
  type architecture
  include **
}

view datos {
  type architecture
  include db
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}
`;

const CON_ERROR = DSL.replace('include db', 'include db\n  nada-de-esto');

interface Cuerpo {
  ok?: boolean;
  [clave: string]: unknown;
}

/** Espera al primer evento `estado` que cumpla `basta`. */
function esperarEstado(dev: DevDePrueba, basta: (e: EstadoDeDev) => boolean, alAbrir?: () => void): Promise<EstadoDeDev> {
  return new Promise((ok) => {
    let abierto = false;
    const cerrar = dev.eventos('/eventos', (nombre, datos) => {
      if (nombre !== 'estado') return;
      const estado = JSON.parse(datos) as EstadoDeDev;
      if (!abierto) {
        abierto = true;
        alAbrir?.();
      }
      if (basta(estado)) {
        setTimeout(cerrar, 0);
        ok(estado);
      }
    });
  });
}

/** Junta los `event: actividad` que llegan por `/eventos` hasta que `basta` los acepte. */
function esperarActividad(dev: DevDePrueba, basta: (recibidos: ActividadDeDev[]) => boolean, alAbrir?: () => void): Promise<ActividadDeDev[]> {
  return new Promise((ok) => {
    const recibidos: ActividadDeDev[] = [];
    let abierto = false;
    const cerrar = dev.eventos('/eventos', (nombre, datos) => {
      if (nombre === 'estado' && !abierto) {
        abierto = true;
        alAbrir?.();
      }
      if (nombre !== 'actividad') return;
      recibidos.push(JSON.parse(datos) as ActividadDeDev);
      if (basta(recibidos)) {
        setTimeout(cerrar, 0);
        ok(recibidos);
      }
    });
  });
}

const eventoDePrueba = (pid: number, extra: Partial<EventoDeActividad> = {}): EventoDeActividad => ({
  contractVersion: 1,
  ts: '2026-11-19T10:00:00.000Z',
  pid,
  comando: 'edit',
  args: ['--workspace', '.', '--intent', '{}'],
  exitCode: 0,
  duracionMs: 4,
  ...extra,
});
const lineaDe = (evento: EventoDeActividad): string => `${JSON.stringify(evento)}\n`;

export function probarContratoDeDev(crear: CrearDev): void {
  const con = async <T>(propios: ArchivosDelWorkspace, prueba: (dev: DevDePrueba) => Promise<T>, extra: { temas?: ArchivosDelWorkspace; actividad?: string } = {}): Promise<T> => {
    const dev = await crear({ propios, ...extra });
    try {
      return await prueba(dev);
    } finally {
      await dev.cerrar();
    }
  };
  const json = async (dev: DevDePrueba, ruta: string, init?: RequestInit): Promise<{ status: number; cuerpo: Cuerpo }> => {
    const res = await dev.fetch(ruta, init);
    return { status: res.status, cuerpo: (await res.json()) as Cuerpo };
  };
  const post = (dev: DevDePrueba, ruta: string, cuerpo: unknown) => json(dev, ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

  describe('contrato del protocolo de dev', () => {
    it('GET /api/estado: version, Vistas en orden de declaracion y sin issues', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const { status, cuerpo } = await json(dev, '/api/estado');
        expect(status).toBe(200);
        expect(cuerpo).toMatchObject({ vistas: ['general', 'datos'], issues: [] });
        expect(typeof cuerpo['version']).toBe('number');
      });
    });

    it('un Workspace con errores desde el inicio da issues con enlace y sin Fuente', async () => {
      await con({ 'main.dg': CON_ERROR }, async (dev) => {
        const { cuerpo } = await json(dev, '/api/estado');
        expect(cuerpo['fuente']).toBeUndefined();
        const issues = cuerpo['issues'] as Array<{ severity: string; file: string; href: string }>;
        expect(issues.some((i) => i.severity === 'error' && i.file === 'main.dg' && i.href.length > 0)).toBe(true);
      });
    });

    it('/eventos manda event: estado al conectar y otro, con version mayor, tras una escritura externa', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const inicial = (await json(dev, '/api/estado')).cuerpo['version'] as number;
        const nuevo = await esperarEstado(
          dev,
          (e) => e.version > inicial,
          () => dev.editarFuera('main.dg', DSL.replace('"API"', '"API nueva"')),
        );
        expect(nuevo.fuente?.model.nodes.find((n) => n.id === 'api')?.title).toBe('API nueva');
      });
    });

    it('/eventos reproduce al conectar los ultimos 50 Eventos de actividad (previos) sin las lineas rotas', async () => {
      const registro = Array.from({ length: 55 }, (_, i) => lineaDe(eventoDePrueba(i))).join('') + '{roto\n';
      await con(
        { 'main.dg': DSL },
        async (dev) => {
          const [previos] = await esperarActividad(dev, (r) => r.length > 0);
          expect(previos?.previos).toBe(true);
          expect(previos?.eventos.map((e) => e.pid)).toEqual(Array.from({ length: 50 }, (_, i) => i + 5));
        },
        { actividad: registro },
      );
    });

    it('un Evento anexado al registro llega como event: actividad en vivo', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const nuevo = eventoDePrueba(7, { agente: 'claude', objetivo: { vista: 'datos' } });
        const recibidos = await esperarActividad(
          dev,
          (r) => r.some((a) => !a.previos),
          () => dev.anexarActividad(`no es json\n${lineaDe(nuevo)}`),
        );
        expect(recibidos.filter((a) => !a.previos)).toEqual([{ previos: false, eventos: [nuevo] }]);
      });
    });

    it('GET /api/vista/<id> da la Geometria de la Vista; una Vista inexistente es 404', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const { status, cuerpo } = await json(dev, '/api/vista/datos');
        expect(status).toBe(200);
        expect(cuerpo['view']).toBe('datos');
        expect(Object.keys((cuerpo['geometry'] as { nodes: object }).nodes)).toEqual(['db']);
        expect((await dev.fetch('/api/vista/nada')).status).toBe(404);
      });
    });

    it('GET /api/inspect/<comando>/<argumento> da lo mismo que inspect --json; si no existe, 404 con los cercanos', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const nodo = await json(dev, '/api/inspect/nodo/api');
        expect(nodo.status).toBe(200);
        expect(nodo.cuerpo).toMatchObject({ comando: 'nodo', nodo: { id: 'api', type: 'servicio', title: 'API', file: 'main.dg', line: 6 }, aristas: [{ from: 'api', to: 'db', label: 'lee', direction: 'out' }], vistas: [{ id: 'general' }] });
        const buscar = await json(dev, '/api/inspect/buscar/dat');
        expect((buscar.cuerpo['resultados'] as Array<{ kind: string; id: string }>).map((r) => `${r.kind}:${r.id}`)).toEqual(['vista:datos', 'nodo:db']);
        const vista = await json(dev, '/api/inspect/vista/datos');
        expect(vista.cuerpo).toMatchObject({ comando: 'vista', vista: { id: 'datos', nodos: [{ id: 'db' }] } });

        const ausente = await json(dev, '/api/inspect/nodo/apj');
        expect(ausente).toEqual({ status: 404, cuerpo: { ok: false, mensaje: "No existe el Nodo 'apj'. Quiza: api", cercanos: ['api'] } });
        expect((await dev.fetch('/api/inspect/nada/x')).status).toBe(404);
      });
    });

    it('GET /api/vista/<id>?tema=<nombre> da la Geometria con otro Tema sin cachearla; 404 si falta la Vista o el Tema', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        expect(await json(dev, '/api/vista/datos?tema=claro')).toMatchObject({ status: 200, cuerpo: { view: 'datos', theme: 'claro' } });
        expect(await json(dev, '/api/vista/datos')).toMatchObject({ status: 200, cuerpo: { view: 'datos', theme: 'neutral' } });
        expect((await dev.fetch('/api/vista/datos?tema=nada')).status).toBe(404);
        expect((await dev.fetch('/api/vista/nada?tema=claro')).status).toBe(404);
      });
    });

    it('GET /api/inspect/tema/<nombre> da la cadena extends y las Capas; un Tema inexistente es 404 con los cercanos', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const { status, cuerpo } = await json(dev, '/api/inspect/tema/claro');
        expect(status).toBe(200);
        expect(cuerpo).toMatchObject({ comando: 'tema', tema: { name: 'claro', file: 'main.dg', extends: ['neutral'] } });
        expect(await json(dev, '/api/inspect/tema/clara')).toEqual({ status: 404, cuerpo: { ok: false, mensaje: "No existe el Tema 'clara'. Quiza: claro", cercanos: ['claro'] } });
      });
    });

    it('POST /api/edit con fijar-tema escribe theme en la Vista; sin tema lo quita; un Tema no declarado es 422 tema-desconocido', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const temaDe = async (vista: string) => ((await json(dev, '/api/estado')).cuerpo['fuente'] as EstadoDeDev['fuente'])?.views.find((v) => v.id === vista)?.theme;
        expect(await post(dev, '/api/edit', { tipo: 'fijar-tema', vista: 'datos', tema: 'claro' })).toMatchObject({ status: 200, cuerpo: { ok: true } });
        expect(await temaDe('datos')).toBe('claro');
        expect(await post(dev, '/api/edit', { tipo: 'fijar-tema', vista: 'datos' })).toMatchObject({ status: 200, cuerpo: { ok: true } });
        expect(await temaDe('datos')).toBeUndefined();
        expect(await post(dev, '/api/edit', { tipo: 'fijar-tema', vista: 'datos', tema: 'clara' })).toMatchObject({ status: 422, cuerpo: { ok: false, motivo: 'tema-desconocido' } });
      });
    });

    it('POST /api/edit aplica una Intencion con la version vista; deshacer y rehacer la quitan y la reponen', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const version = (await json(dev, '/api/estado')).cuerpo['version'] as number;
        const overrides = async () => ((await json(dev, '/api/estado')).cuerpo['fuente'] as EstadoDeDev['fuente'])?.views[0]?.overrides ?? [];

        const editado = await post(dev, '/api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 40, y: 80, version });
        expect(editado).toMatchObject({ status: 200, cuerpo: { ok: true } });
        expect(await overrides()).toMatchObject([{ node: 'api', pin: { x: 40, y: 80 } }]);

        expect(await post(dev, '/api/deshacer', {})).toMatchObject({ status: 200, cuerpo: { ok: true } });
        expect(await overrides()).toEqual([]);
        expect(await post(dev, '/api/rehacer', {})).toMatchObject({ status: 200, cuerpo: { ok: true } });
        expect(await overrides()).toMatchObject([{ node: 'api' }]);
      });
    });

    it('rechazos de POST /api/edit: version olvidada 409, Vista desconocida 422, cuerpo que no es Intencion 400', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        expect(await post(dev, '/api/edit', { tipo: 'mover-pin', vista: 'general', nodo: 'api', x: 1, y: 1, version: 9999 })).toMatchObject({ status: 409, cuerpo: { ok: false, motivo: 'hash-desactualizado' } });
        expect(await post(dev, '/api/edit', { tipo: 'mover-pin', vista: 'nada', nodo: 'api', x: 1, y: 1 })).toMatchObject({ status: 422, cuerpo: { ok: false, motivo: 'vista-desconocida' } });
        expect((await post(dev, '/api/edit', { tipo: 'otra-cosa' })).status).toBe(400);
        expect(await post(dev, '/api/deshacer', {})).toMatchObject({ status: 422, cuerpo: { ok: false, motivo: 'nada-que-deshacer' } });
      });
    });

    const TEMA = 'theme claro extends neutral {}\n';
    const enLinea = (line: number, column: number) => ({ start: { line, column }, end: { line, column } });
    const leerTexto = async (dev: DevDePrueba, ruta: string) => (await json(dev, `/api/archivo/${ruta}`)).cuerpo['texto'];

    it('GET /api/archivos lista los del Workspace y los de --theme-path (soloLectura) con hash y version', async () => {
      await con(
        { 'main.dg': DSL },
        async (dev) => {
          const { status, cuerpo } = await json(dev, '/api/archivos');
          expect(status).toBe(200);
          expect(typeof cuerpo['version']).toBe('number');
          const archivos = cuerpo['archivos'] as Array<{ file: string; hash: string; soloLectura: boolean }>;
          expect(archivos.map(({ file, soloLectura }) => ({ file, soloLectura }))).toEqual([
            { file: 'main.dg', soloLectura: false },
            { file: 'tema.dg', soloLectura: true },
          ]);
          expect(archivos.every((a) => a.hash.length > 0)).toBe(true);
        },
        { temas: { 'tema.dg': TEMA } },
      );
    });

    it('GET /api/archivo/<ruta> da { file, texto, hash, version }; uno inexistente es 404', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const { status, cuerpo } = await json(dev, '/api/archivo/main.dg');
        expect(status).toBe(200);
        expect(cuerpo).toMatchObject({ file: 'main.dg', texto: DSL, version: expect.any(Number), hash: expect.any(String) });
        expect((await dev.fetch('/api/archivo/nada.dg')).status).toBe(404);
      });
    });

    it('POST /api/edit { ediciones, version } escribe el texto y deshacer lo quita', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const { version } = (await json(dev, '/api/archivo/main.dg')).cuerpo;
        const editado = await post(dev, '/api/edit', { ediciones: [{ file: 'main.dg', range: enLinea(1, 1), replacement: '// hola\n' }], version });
        expect(editado).toMatchObject({ status: 200, cuerpo: { ok: true } });
        expect(await leerTexto(dev, 'main.dg')).toBe(`// hola\n${DSL}`);
        expect((await post(dev, '/api/deshacer', {})).status).toBe(200);
        expect(await leerTexto(dev, 'main.dg')).toBe(DSL);
      });
    });

    it('un texto que no compila: 422 invalida por defecto; con aunqueNoCompile se guarda y el estado trae los issues', async () => {
      await con({ 'main.dg': DSL }, async (dev) => {
        const rota = { ediciones: [{ file: 'main.dg', range: enLinea(8, 3), replacement: 'fantasma -> ' }] };
        expect(await post(dev, '/api/edit', rota)).toMatchObject({ status: 422, cuerpo: { ok: false, motivo: 'invalida' } });
        expect(await post(dev, '/api/edit', { ...rota, aunqueNoCompile: true })).toMatchObject({ status: 200, cuerpo: { ok: true } });
        expect(await leerTexto(dev, 'main.dg')).toContain('fantasma -> api -> db');
        const estado = (await json(dev, '/api/estado')).cuerpo as unknown as EstadoDeDev;
        expect(estado.issues.some((i) => i.severity === 'error')).toBe(true);
        expect(estado.vistas).toEqual(['general', 'datos']);
      });
    });

    it('rechazos de ediciones: archivo de --theme-path 422, archivo cambiado por fuera 409, forma invalida 400', async () => {
      await con(
        { 'main.dg': DSL },
        async (dev) => {
          const { version } = (await json(dev, '/api/archivo/main.dg')).cuerpo;
          expect(await post(dev, '/api/edit', { ediciones: [{ file: 'tema.dg', range: enLinea(1, 1), replacement: '// x\n' }], aunqueNoCompile: true })).toMatchObject({
            status: 422,
            cuerpo: { ok: false, motivo: 'archivo-desconocido' },
          });
          await esperarEstado(
            dev,
            (e) => e.version > (version as number),
            () => dev.editarFuera('main.dg', `${DSL}\n`),
          );
          expect(await post(dev, '/api/edit', { ediciones: [{ file: 'main.dg', range: enLinea(1, 1), replacement: '// x\n' }], version })).toMatchObject({
            status: 409,
            cuerpo: { ok: false, motivo: 'hash-desactualizado' },
          });
          expect((await post(dev, '/api/edit', { ediciones: [{ file: 1 }] })).status).toBe(400);
        },
        { temas: { 'tema.dg': TEMA } },
      );
    });
  });
}
