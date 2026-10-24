/**
 * Un escenario del benchmark, en su propio proceso para que `maxRSS` sea del
 * escenario y no del resto. Uso: `node bench/escenario.ts <escenario>`; imprime
 * una linea JSON `{ escenario, medidas }` en stdout. Lo lanza `bench/ejecutar.ts`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';

import { resolveView } from 'canonico';
import type { EstadoDeColapso, FuenteCanonica, Nodo, Tema, VistaResuelta } from 'canonico';
import { run } from 'cli';
import { compile } from 'dsl';
import { layoutView } from 'layout';
import { TEMA_NEUTRO } from 'tema';
import { adaptadorDeWorker, servirLayout } from 'shell';
import type { PuertoDeMensajes } from 'shell';
import { build } from 'esbuild';

import { generarWorkspace } from './generador.ts';

const ESCENARIOS = ['build-10k', 'relayout-1k', 'relayout-slots', 'relayout-grande', 'colapso-5k', 'bundle'] as const;
type Escenario = (typeof ESCENARIOS)[number];

const ms = (desde: number): number => Math.round(performance.now() - desde);
const mb = (bytes: number): number => Math.round(bytes / 1024 / 1024);
const kb = (bytes: number): number => Math.round((bytes / 1024) * 10) / 10;

function contarNodos(nodos: readonly { children: readonly unknown[] }[]): number {
  return nodos.reduce((suma, n) => suma + 1 + contarNodos(n.children as typeof nodos), 0);
}

function compilar(nodos: number): FuenteCanonica {
  const { canonico, issues } = compile(generarWorkspace({ nodos }));
  if (canonico === undefined) throw new Error(`El Workspace sintetico no compila: ${JSON.stringify(issues.slice(0, 3))}`);
  return canonico;
}

/** Par de puertos en memoria que copian los mensajes como un Worker (structured clone, asincrono). */
function parDePuertos(): [PuertoDeMensajes, PuertoDeMensajes] {
  const crear = (): PuertoDeMensajes & { destino?: PuertoDeMensajes } => {
    const puerto: PuertoDeMensajes & { destino?: PuertoDeMensajes } = {
      onmessage: null,
      postMessage(mensaje) {
        const copia = structuredClone(mensaje);
        setTimeout(() => puerto.destino?.onmessage?.({ data: copia }), 0);
      },
    };
    return puerto;
  };
  const a = crear();
  const b = crear();
  a.destino = b;
  b.destino = a;
  return [a, b];
}

async function buildDe10k(): Promise<Record<string, number>> {
  const carpeta = mkdtempSync(join(tmpdir(), 'bench-build-'));
  try {
    const archivos = generarWorkspace({ nodos: 10_000 });
    for (const [ruta, texto] of Object.entries(archivos)) writeFileSync(join(carpeta, ruta), texto);
    const inicio = performance.now();
    const { exitCode, stdout, stderr } = await run(['build', '--workspace', carpeta]);
    const tiempoMs = ms(inicio);
    if (exitCode !== 0) throw new Error(`build salio con ${exitCode}: ${stdout}${stderr}`);
    return { nodos: 10_000, tiempoMs, maxRssMb: mb(process.resourceUsage().maxRSS * 1024) };
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

const TEMA: Tema = TEMA_NEUTRO;

/** Resuelve la Vista en `estado` y la pasa por el layout del Worker (puertos en memoria). */
async function relayout(fuente: FuenteCanonica, estado: EstadoDeColapso, adaptador: ReturnType<typeof adaptadorDeWorker>, tema: Tema = TEMA) {
  const inicio = performance.now();
  const vista = resolveView(fuente, 'todo', estado)!;
  const resolucionMs = ms(inicio);
  await adaptador(vista, tema);
  return { vista, resolucionMs, totalMs: ms(inicio) };
}

async function relayoutDe1k(): Promise<Record<string, number>> {
  const fuente = compilar(1000);
  const [pagina, worker] = parDePuertos();
  servirLayout(worker);
  const adaptador = adaptadorDeWorker(pagina);
  const frio = await relayout(fuente, {}, adaptador);
  const caliente = await relayout(fuente, {}, adaptador);
  // Sin Worker: el mismo layout directo, para separar el coste de los mensajes.
  const inicio = performance.now();
  await layoutView(frio.vista, TEMA);
  return {
    nodosVisibles: frio.vista.nodes.length,
    tiempoFrioMs: frio.totalMs,
    tiempoCalienteMs: caliente.totalMs,
    layoutDirectoMs: ms(inicio),
    maxRssMb: mb(process.resourceUsage().maxRSS * 1024),
  };
}

/**
 * Disposicion de Slots anidada tres niveles (`row`/`column` dentro de `row`/`column`, con gap, pad y `align`):
 * el peor caso razonable del mini-layout, que `colocarEnCaja` recorre por cada Nodo en cada relayout.
 */
const SLOTS_ANIDADOS = {
  direccion: 'column',
  gap: 4,
  pad: 8,
  hijos: [
    {
      direccion: 'row',
      gap: 6,
      pad: 2,
      hijos: [
        { slot: 'icon' },
        {
          direccion: 'column',
          gap: 2,
          pad: 0,
          hijos: [{ slot: 'title' }, { direccion: 'row', gap: 4, pad: 0, hijos: [{ slot: 'badge', align: 'start' }, { slot: 'counter', align: 'end' }] }],
        },
      ],
    },
    { direccion: 'column', gap: 2, pad: 0, hijos: [{ slot: 'desc' }, { direccion: 'row', gap: 4, pad: 0, hijos: [{ slot: 'footer' }] }] },
    { slot: 'attrs' },
  ],
} as const;

/** Relayout de `nodos` Nodos del Modelo (con sus Grupos) con Slots `row/column` anidados, frente al mismo Modelo con la disposicion plana del Tema neutro. */
async function relayoutConSlotsAnidados(nodos: number): Promise<Record<string, number>> {
  const fuente = compilar(nodos);
  const anidado = { ...TEMA_NEUTRO, nodo: { ...TEMA_NEUTRO.nodo, slots: SLOTS_ANIDADOS } } as unknown as Tema;
  const [pagina, worker] = parDePuertos();
  servirLayout(worker);
  const adaptador = adaptadorDeWorker(pagina);
  const neutro = await relayout(fuente, {}, adaptador);
  const frio = await relayout(fuente, {}, adaptador, anidado);
  const caliente = await relayout(fuente, {}, adaptador, anidado);
  return {
    nodosDelModelo: contarNodos(fuente.model.nodes),
    nodosVisibles: frio.vista.nodes.length,
    tiempoNeutroMs: neutro.totalMs,
    tiempoFrioMs: frio.totalMs,
    tiempoCalienteMs: caliente.totalMs,
    maxRssMb: mb(process.resourceUsage().maxRSS * 1024),
  };
}

async function colapsoDe5k(): Promise<Record<string, number>> {
  const fuente = compilar(5000);
  const raices = fuente.model.nodes.filter((n: Nodo) => n.children.length > 0).map((n: Nodo) => n.id);
  const [pagina, worker] = parDePuertos();
  servirLayout(worker);
  const adaptador = adaptadorDeWorker(pagina);

  // Estado inicial: todas las raices cerradas (un Modelo de 5k no se expande entero: el shell tope es ~1k).
  const cerrado: EstadoDeColapso = { collapsed: raices };
  const inicial = await relayout(fuente, cerrado, adaptador);
  // Expandir la raiz mas grande, como un clic en su control de Grupo.
  const mayor = [...fuente.model.nodes].sort((a, b) => contarNodos([b]) - contarNodos([a]))[0]!;
  const abierto: EstadoDeColapso = { collapsed: raices.filter((id: string) => id !== mayor.id), expanded: [mayor.id] };
  const expandir = await relayout(fuente, abierto, adaptador);
  // Y volver a cerrarla.
  const colapsar = await relayout(fuente, cerrado, adaptador);
  return {
    nodosDelModelo: contarNodos(fuente.model.nodes),
    visiblesCerrado: inicial.vista.nodes.length,
    visiblesAbierto: expandir.vista.nodes.length,
    layoutInicialMs: inicial.totalMs,
    expandirMs: expandir.totalMs,
    expandirResolucionMs: expandir.resolucionMs,
    colapsarMs: colapsar.totalMs,
    maxRssMb: mb(process.resourceUsage().maxRSS * 1024),
  };
}

async function empaquetar(contents: string): Promise<{ min: number; gzip: number }> {
  const salida = await build({
    stdin: { contents, resolveDir: import.meta.dirname, loader: 'ts' },
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    logLevel: 'error',
  });
  const texto = salida.outputFiles[0]!.contents;
  return { min: texto.length, gzip: gzipSync(texto, { level: 9 }).length };
}

async function bundleDelShell(): Promise<Record<string, number>> {
  // Los dos bundles que `export --format html` incrusta (mismas opciones que `packages/cli/src/html.ts`):
  // la pagina (shell + React, sin ELK) y el Worker (layout con ELK, sin zod, tal cual los empaqueta el CLI).
  const navegador = join(import.meta.dirname, '..', 'packages', 'cli', 'navegador');
  const bundle = async (entrada: string, alias: Record<string, string> = {}): Promise<{ min: number; gzip: number }> => {
    const salida = await build({
      entryPoints: [join(navegador, entrada)],
      bundle: true,
      write: false,
      minify: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      charset: 'ascii',
      legalComments: 'none',
      jsx: 'automatic',
      logLevel: 'error',
      alias,
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const texto = salida.outputFiles[0]!.contents;
    return { min: texto.length, gzip: gzipSync(texto, { level: 9 }).length };
  };
  const pagina = await bundle('arranque.tsx');
  const worker = await bundle('worker.ts', { zod: join(navegador, 'zod-inerte.ts') });
  // Suelo: lo que pesa elkjs separado en api (pagina) + worker, sin nada nuestro.
  const lib = join(import.meta.dirname, '..', 'packages', 'layout', 'node_modules', 'elkjs', 'lib');
  const elkApi = gzipSync(readFileSync(join(lib, 'elk-api.js')), { level: 9 }).length;
  const elkWorker = gzipSync(readFileSync(join(lib, 'elk-worker.min.js')), { level: 9 }).length;
  return {
    paginaGzipKb: kb(pagina.gzip),
    workerGzipKb: kb(worker.gzip),
    totalGzipKb: kb(pagina.gzip + worker.gzip),
    elkApiMasWorkerGzipKb: kb(elkApi + elkWorker),
  };
}

const escenario = process.argv[2] as Escenario | undefined;
if (escenario === undefined || !ESCENARIOS.includes(escenario)) {
  process.stderr.write(`Uso: node bench/escenario.ts <${ESCENARIOS.join('|')}>\n`);
  process.exit(2);
}
const ejecutores: Record<Escenario, () => Promise<Record<string, number>>> = {
  'build-10k': buildDe10k,
  'relayout-1k': relayoutDe1k,
  'relayout-slots': () => relayoutConSlotsAnidados(500),
  'relayout-grande': () => relayoutConSlotsAnidados(3000),
  'colapso-5k': colapsoDe5k,
  bundle: bundleDelShell,
};
const medidas = await ejecutores[escenario]();
process.stdout.write(`${JSON.stringify({ escenario, medidas })}\n`);
