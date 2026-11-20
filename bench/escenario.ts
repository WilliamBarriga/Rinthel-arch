/**
 * Un escenario del benchmark, en su propio proceso para que `maxRSS` sea solo suyo.
 * Uso: `node bench/escenario.ts <escenario>`; imprime una linea JSON `{ escenario, medidas }`.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';

import { resolveView } from 'canonico';
import type { EstadoDeColapso, FuenteCanonica, Nodo, Tema, VistaDeSecuencia } from 'canonico';
import { run } from 'cli';
import { compile } from 'dsl';
import { layoutView } from 'layout';
import { TEMA_NEUTRO } from 'tema';
import { adaptadorDeWorker, servirLayout } from 'shell';
import type { PuertoDeMensajes } from 'shell';

import { construirEstudio } from 'estudio/construir';
import { generarSecuencia, generarWorkspace } from './generador.ts';

const ESCENARIOS = ['build-10k', 'relayout-1k', 'relayout-slots', 'relayout-grande', 'colapso-5k', 'secuencia-grande', 'bundle'] as const;
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

/** Slots anidados tres niveles: el peor caso razonable de `colocarEnCaja`, que corre por Nodo en cada relayout. */
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

/** Frente al mismo Modelo con la disposicion plana del Tema neutro. */
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
  const mayor = [...fuente.model.nodes].sort((a, b) => contarNodos([b]) - contarNodos([a]))[0]!;
  const abierto: EstadoDeColapso = { collapsed: raices.filter((id: string) => id !== mayor.id), expanded: [mayor.id] };
  const expandir = await relayout(fuente, abierto, adaptador);
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

/** Mejor de 3 corridas tras una de calentamiento. */
async function secuenciaGrande(): Promise<Record<string, number>> {
  const { canonico, issues } = compile(generarSecuencia({ mensajes: 1000, lifelines: 50, profundidad: 3 }));
  if (canonico === undefined) throw new Error(`La Interaccion sintetica no compila: ${JSON.stringify(issues.slice(0, 3))}`);
  const vista = resolveView(canonico, 'secuencia') as VistaDeSecuencia;
  const inicio = performance.now();
  await layoutView(vista, TEMA);
  const frioMs = ms(inicio);
  const corridas: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await layoutView(vista, TEMA);
    corridas.push(ms(t));
  }
  return { mensajes: vista.interaction.messages.length, lifelines: vista.nodes.length, tiempoFrioMs: frioMs, tiempoMs: Math.min(...corridas), maxRssMb: mb(process.resourceUsage().maxRSS * 1024) };
}

/** Imports estaticos (`import ... from"./x.js"`) de un modulo ES del build, como rutas relativas a `raiz`. */
function importsEstaticos(raiz: string, archivo: string): string[] {
  const texto = readFileSync(join(raiz, archivo), 'utf8');
  return [...texto.matchAll(/(?:^|;)import\s*(?:\{[^}]*\}\s*from\s*)?"\.\/([^"]+)"/g)].map((m) => join(dirname(archivo), m[1]!));
}

/** `archivo` y todo lo que importa estaticamente (lo que el navegador baja antes de ejecutarlo). */
function cierre(raiz: string, archivo: string, visto = new Set<string>()): Set<string> {
  if (visto.has(archivo)) return visto;
  visto.add(archivo);
  for (const otro of importsEstaticos(raiz, archivo)) cierre(raiz, otro, visto);
  return visto;
}

async function bundleDelShell(): Promise<Record<string, number>> {
  // La pagina real de `dev` tal como la construye `estudio` (`dev.tsx`, modulo ES con trozos) y el Worker (ELK, sin zod).
  const salida = mkdtempSync(join(tmpdir(), 'rinthel-bundle-'));
  try {
    await construirEstudio({ salida });
    const gzip = (archivos: Iterable<string>): number => [...archivos].reduce((total, a) => total + gzipSync(readFileSync(join(salida, a)), { level: 9 }).length, 0);
    const inicial = cierre(salida, 'pagina.js');
    const codigo = readdirSync(join(salida, 'trozos')).find((t) => t.startsWith('panel-de-codigo-'));
    const delEditor = codigo === undefined ? [] : [...cierre(salida, `trozos/${codigo}`)].filter((a) => !inicial.has(a));
    const worker = gzip(['worker.js']);
    // Suelo: lo que pesa elkjs separado en api (pagina) + worker, sin nada nuestro.
    const lib = join(import.meta.dirname, '..', 'packages', 'layout', 'node_modules', 'elkjs', 'lib');
    const elkApi = gzipSync(readFileSync(join(lib, 'elk-api.js')), { level: 9 }).length;
    const elkWorker = gzipSync(readFileSync(join(lib, 'elk-worker.min.js')), { level: 9 }).length;
    return {
      paginaGzipKb: kb(gzip(inicial)),
      editorGzipKb: kb(gzip(delEditor)),
      workerGzipKb: kb(worker),
      totalGzipKb: kb(gzip(inicial) + worker),
      elkApiMasWorkerGzipKb: kb(elkApi + elkWorker),
    };
  } finally {
    rmSync(salida, { recursive: true, force: true });
  }
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
  'secuencia-grande': secuenciaGrande,
  bundle: bundleDelShell,
};
const medidas = await ejecutores[escenario]();
process.stdout.write(`${JSON.stringify({ escenario, medidas })}\n`);
