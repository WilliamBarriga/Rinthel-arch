/**
 * Capturas lado a lado: el prototipo aprobado (`prototype/render-hibrido`) contra la galeria de Temas en `dev`.
 * Uso (necesita `pnpm build`): `pnpm capturas <tema>... [abierto|cobertura]`  o  `pnpm capturas --todos [vista]`.
 *   abierto (por defecto): Vista de referencia de la galeria (`<tema>-referencia`) contra la Vista `abierto` del prototipo.
 *   cobertura: solo la galeria (`<tema>`, el Modelo de cobertura); el prototipo no tiene Vista equivalente.
 * Otro Workspace: `pnpm capturas --workspace <ruta> --vista <id> [--prototipo <variante>] <tema>...` pinta esa Vista
 *   con cada Tema (del Workspace o incorporado) sobre una copia temporal (`capturas/workspace.ts`) y, con
 *   `--prototipo`, la pone junto a la Vista `abierto` de esa variante del prototipo (p. ej. `A`, la de soft-card).
 * Para la documentacion (`pnpm docs:capturas`): `--salida <dir>` escribe `<prefijo><tema>.png` en ese directorio (`--prefijo`,
 *   `--ancho`/`--alto` para el encuadre (1600x900 por defecto), `--escala` para el deviceScaleFactor, 2 por defecto), sin pagina de comparacion, y termina.
 * Salida: PNG y una pagina de comparacion en `$CAPTURAS_DIR` (por defecto `/tmp/rinthel-capturas`, fuera del repo),
 * servida por un mini server local que sigue vivo al terminar; imprime `http://localhost:<puerto>/salida/`.
 * Chromium: `$CHROMIUM_PATH` o la cache de Playwright (`~/.cache/ms-playwright/chromium-*`). Un solo motor fijo para
 * que las capturas sean comparables. No forma parte de `pnpm test`.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';
import type { Browser } from 'playwright';

import { VARIANTE_DE_TEMA, prepararPrototipo } from './capturas/prototipo.ts';
import { iniciarDevDeGaleria, servirEstatico } from './capturas/servidores.ts';
import { prepararWorkspace } from './capturas/workspace.ts';

const REPO = resolve(import.meta.dirname, '..');
const GALERIA = 'examples/temas/galeria';
const VIEWPORT = { width: 1600, height: 900 };
const VISTAS = ['abierto', 'cobertura'] as const;
type Vista = (typeof VISTAS)[number];

const fallar = (mensaje: string): never => {
  console.error(mensaje);
  return process.exit(1);
};

/** Que capturar: cada Tema con su Vista en un Workspace y, si hay, la variante del prototipo con la que se compara. */
interface Pedido {
  workspace: string;
  temas: string[];
  /** Vista del Workspace que pinta cada Tema. */
  vistaDe: (tema: string) => string;
  /** Variante del prototipo de cada Tema (Vista `abierto`); `undefined` = sin prototipo. */
  varianteDe: (tema: string) => string | undefined;
  titulo: string;
  /** Nombre del lado propio en archivos y pagina (`galeria` o `workspace`). */
  lado: string;
  /** Modo documentacion (`--salida`): PNG `<prefijo><tema>.png` en `dir`, sin pagina de comparacion. */
  docs?: { dir: string; prefijo: string; escala: number; encuadre: { width: number; height: number } };
}

const USO = `Uso: pnpm capturas <tema>... [${VISTAS.join('|')}]  o  pnpm capturas --todos [vista]
     pnpm capturas --workspace <ruta> --vista <id> [--prototipo <variante>] <tema>...`;

function leerArgumentos(): Pedido {
  const { values: v, positionals: posicionales } = parseArgs({
    args: process.argv.slice(2),
    options: { todos: { type: 'boolean', default: false }, workspace: { type: 'string' }, salida: { type: 'string' }, prefijo: { type: 'string' }, escala: { type: 'string' }, ancho: { type: 'string' }, alto: { type: 'string' }, vista: { type: 'string' }, prototipo: { type: 'string' } },
    allowPositionals: true,
  });
  if (v.workspace !== undefined) {
    const pedido = pedidoDeWorkspace(v.workspace, v.vista, v.prototipo, posicionales);
    if (v.salida !== undefined) pedido.docs = { dir: resolve(REPO, v.salida), prefijo: v.prefijo ?? '', escala: Number(v.escala ?? 2), encuadre: { width: Number(v.ancho ?? VIEWPORT.width), height: Number(v.alto ?? VIEWPORT.height) } };
    return pedido;
  }
  if (v.vista !== undefined || v.prototipo !== undefined) return fallar(`--vista y --prototipo van con --workspace.\n${USO}`);
  // La Vista, si se da, va al final: `pnpm capturas soft-card glass-chip cobertura`.
  const vista = VISTAS.includes(posicionales[posicionales.length - 1] as Vista) ? (posicionales.pop() as Vista) : 'abierto';
  const nombres = Object.keys(VARIANTE_DE_TEMA);
  let temas = posicionales;
  if (v.todos) {
    if (posicionales.length > 0) fallar(`Vista '${posicionales[0]}' desconocida. Usa: ${VISTAS.join(', ')}.`);
    temas = nombres;
  }
  if (temas.length === 0) return fallar(`${USO}\nTemas: ${nombres.join(', ')}`);
  const desconocido = temas.find((t) => !nombres.includes(t));
  if (desconocido !== undefined) return fallar(`Tema '${desconocido}' desconocido. Temas: ${nombres.join(', ')}`);
  return {
    workspace: GALERIA,
    temas,
    vistaDe: (t) => (vista === 'abierto' ? `${t}-referencia` : t),
    varianteDe: (t) => (vista === 'abierto' ? VARIANTE_DE_TEMA[t] : undefined),
    titulo: `Prototipo contra galeria (Vista ${vista})`,
    lado: 'galeria',
  };
}

function pedidoDeWorkspace(ruta: string, vista: string | undefined, variante: string | undefined, temas: string[]): Pedido {
  if (vista === undefined || temas.length === 0) return fallar(`Con --workspace hacen falta --vista y al menos un Tema.\n${USO}`);
  const variantes = Object.values(VARIANTE_DE_TEMA);
  if (variante !== undefined && !variantes.includes(variante)) return fallar(`Variante '${variante}' desconocida. Variantes: ${variantes.join(', ')}`);
  const copia = prepararWorkspace(resolve(REPO, ruta), vista, temas, process.env['CAPTURAS_DIR'] ?? '/tmp/rinthel-capturas');
  const comparada = variante === undefined ? '' : ` contra la variante ${variante} del prototipo`;
  return { workspace: copia.directorio, temas, vistaDe: copia.vistaDe, varianteDe: () => variante, titulo: `${ruta}, Vista ${vista}${comparada}`, lado: 'workspace' };
}

/** Chromium de la cache de Playwright (la revision instalada puede no ser la que espera la version de Playwright). */
function rutaDeChromium(): string {
  const configurada = process.env['CHROMIUM_PATH'];
  if (configurada !== undefined) return configurada;
  const cache = join(homedir(), '.cache/ms-playwright');
  const revisiones = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  const ultima = revisiones[revisiones.length - 1];
  if (ultima === undefined) return fallar(`No hay Chromium en ${cache}. Define CHROMIUM_PATH o ejecuta \`pnpm exec playwright install chromium\`.`);
  return join(cache, ultima, 'chrome-linux64/chrome');
}

async function capturarGaleria(navegador: Browser, url: string, vista: string, destino: string, escala = 2, encuadre = VIEWPORT): Promise<void> {
  const contexto = await navegador.newContext({ viewport: encuadre, deviceScaleFactor: escala, reducedMotion: 'reduce' });
  const pagina = await contexto.newPage();
  const listo = '.rd-vista[data-layout="listo"]';
  await pagina.goto(`${url}#p=${encodeURIComponent(vista)}`);
  await pagina.waitForSelector(`${listo}[data-vista="${vista}"]`, { timeout: 60_000 });
  await pagina.evaluate('document.fonts.ready');
  // Las fuentes pueden pedir un layout nuevo: se vuelve a esperar la senal antes de capturar.
  await pagina.waitForSelector(`${listo}[data-vista="${vista}"]`);
  // Fuera del cuadro lo que no es el diagrama: chrome del shell (migas, accesibilidad) y panel de issues de dev.
  await pagina.addStyleTag({ content: '.rd-chrome, [data-panel="issues"] { display: none !important }' });
  await pagina.locator('.rd-vista').screenshot({ path: destino, animations: 'disabled' });
  await contexto.close();
}

async function capturarPrototipo(navegador: Browser, url: string, variante: string, destino: string): Promise<void> {
  const contexto = await navegador.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const pagina = await contexto.newPage();
  await pagina.goto(`${url}?variant=${variante}&vista=abierto`, { waitUntil: 'load' });
  // El prototipo rellena `#st` tras medir el texto real contra las cajas del layout.
  await pagina.waitForFunction("(document.getElementById('st')?.textContent ?? '') !== ''", undefined, { timeout: 60_000 });
  await pagina.evaluate('document.fonts.ready');
  await pagina.addStyleTag({ content: '#bar{display:none !important}' });
  await pagina.locator('#vp').screenshot({ path: destino, animations: 'disabled' });
  await contexto.close();
}

function paginaDeComparacion(pedido: Pedido): string {
  const imagen = (tema: string, lado: string): string => `<figure><figcaption>${lado}</figcaption><img src="${tema}-${lado}.png" alt="${tema} ${lado}"></figure>`;
  const secciones = pedido.temas
    .map((t) => {
      const variante = pedido.varianteDe(t);
      const subtitulo = variante === undefined ? '' : ` <small>variante ${variante} del prototipo</small>`;
      return `<section id="${t}"><h2>${t}${subtitulo}</h2><div class="par">${variante === undefined ? '' : imagen(t, 'prototipo')}${imagen(t, pedido.lado)}</div></section>`;
    })
    .join('\n');
  const indice = pedido.temas.map((t) => `<a href="#${t}">${t}</a>`).join(' ');
  return `<!doctype html><meta charset="utf-8"><title>Capturas: ${pedido.titulo}</title>
<style>body{font:14px system-ui;margin:16px;background:#18181b;color:#e4e4e7}a{color:#93c5fd;margin-right:10px}h2{margin:28px 0 8px}small{opacity:.6;font-weight:400}
.par{display:flex;gap:12px;align-items:flex-start}figure{margin:0;flex:1;min-width:0}figcaption{margin-bottom:4px;opacity:.7}img{width:100%;display:block;border:1px solid #3f3f46}</style>
<h1>${pedido.titulo}</h1><nav>${indice}</nav>
${secciones}`;
}

async function principal(): Promise<void> {
  const pedido = leerArgumentos();
  const cache = process.env['CAPTURAS_DIR'] ?? '/tmp/rinthel-capturas';
  const salida = pedido.docs?.dir ?? join(cache, 'salida');
  mkdirSync(salida, { recursive: true });

  const prototipo = pedido.temas.some((t) => pedido.varianteDe(t) !== undefined) ? prepararPrototipo(cache, REPO) : undefined;
  const origen = await servirEstatico(cache);
  const galeria = await iniciarDevDeGaleria(REPO, pedido.workspace);
  const navegador = await chromium.launch({ executablePath: rutaDeChromium(), headless: true });
  try {
    for (const tema of pedido.temas) {
      const archivo = pedido.docs === undefined ? `${tema}-${pedido.lado}.png` : `${pedido.docs.prefijo}${tema}.png`;
      await capturarGaleria(navegador, galeria.url, pedido.vistaDe(tema), join(salida, archivo), pedido.docs?.escala, pedido.docs?.encuadre);
      const variante = pedido.varianteDe(tema);
      if (prototipo !== undefined && variante !== undefined) {
        const rutaDelPrototipo = `${origen}/${prototipo.directorio.split('/').pop()}/${prototipo.pagina}`;
        await capturarPrototipo(navegador, rutaDelPrototipo, variante, join(salida, `${tema}-prototipo.png`));
      }
      console.log(`capturado ${tema} (${pedido.vistaDe(tema)})`);
    }
  } finally {
    await navegador.close();
    galeria.detener();
  }
  if (pedido.docs !== undefined) return process.exit(0);
  writeFileSync(join(salida, 'index.html'), paginaDeComparacion(pedido));
  console.log(`\nComparacion: ${origen}/salida/`);
}

await principal();
