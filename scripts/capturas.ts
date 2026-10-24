/**
 * Capturas lado a lado: el prototipo aprobado (`prototype/render-hibrido`) contra la galeria de Temas en `dev`.
 * Uso (necesita `pnpm build`): `pnpm capturas <tema> [abierto|cobertura]`  o  `pnpm capturas --todos [vista]`.
 *   abierto (por defecto): Vista de referencia de la galeria (`<tema>-referencia`) contra la Vista `abierto` del prototipo.
 *   cobertura: solo la galeria (`<tema>`, el Modelo de cobertura); el prototipo no tiene Vista equivalente.
 * Salida: PNG y una pagina de comparacion en `$CAPTURAS_DIR` (por defecto `/tmp/rinthel-capturas`, fuera del repo),
 * servida por un mini server local que sigue vivo al terminar; imprime `http://localhost:<puerto>/salida/`.
 * Chromium: `$CHROMIUM_PATH` o la cache de Playwright (`~/.cache/ms-playwright/chromium-*`). Un solo motor fijo para
 * que las capturas sean comparables. No forma parte de `pnpm test`.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright';
import type { Browser } from 'playwright';

import { VARIANTE_DE_TEMA, prepararPrototipo } from './capturas/prototipo.ts';
import { iniciarDevDeGaleria, servirEstatico } from './capturas/servidores.ts';

const REPO = resolve(import.meta.dirname, '..');
const GALERIA = 'examples/temas/galeria';
const VIEWPORT = { width: 1600, height: 900 };
const VISTAS = ['abierto', 'cobertura'] as const;
type Vista = (typeof VISTAS)[number];

const fallar = (mensaje: string): never => {
  console.error(mensaje);
  return process.exit(1);
};

function leerArgumentos(): { temas: string[]; vista: Vista } {
  const args = process.argv.slice(2);
  const todos = args.includes('--todos');
  const posicionales = args.filter((a) => !a.startsWith('--'));
  const [tema, vista = 'abierto'] = todos ? [undefined, posicionales[0]] : posicionales;
  if (!VISTAS.includes(vista as Vista)) fallar(`Vista '${vista}' desconocida. Usa: ${VISTAS.join(', ')}.`);
  const nombres = Object.keys(VARIANTE_DE_TEMA);
  if (todos) return { temas: nombres, vista: vista as Vista };
  if (tema === undefined) return fallar(`Uso: pnpm capturas <tema> [${VISTAS.join('|')}]  o  pnpm capturas --todos\nTemas: ${nombres.join(', ')}`);
  if (!nombres.includes(tema)) return fallar(`Tema '${tema}' desconocido. Temas: ${nombres.join(', ')}`);
  return { temas: [tema], vista: vista as Vista };
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

async function capturarGaleria(navegador: Browser, url: string, vista: string, destino: string): Promise<void> {
  const contexto = await navegador.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: 'reduce' });
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

function paginaDeComparacion(vista: Vista, temas: string[]): string {
  const imagen = (tema: string, lado: string): string => `<figure><figcaption>${lado}</figcaption><img src="${tema}-${lado}.png" alt="${tema} ${lado}"></figure>`;
  const secciones = temas
    .map((t) => `<section id="${t}"><h2>${t} <small>variante ${VARIANTE_DE_TEMA[t]} del prototipo</small></h2><div class="par">${vista === 'abierto' ? imagen(t, 'prototipo') : ''}${imagen(t, 'galeria')}</div></section>`)
    .join('\n');
  const indice = temas.map((t) => `<a href="#${t}">${t}</a>`).join(' ');
  return `<!doctype html><meta charset="utf-8"><title>Capturas: prototipo contra galeria</title>
<style>body{font:14px system-ui;margin:16px;background:#18181b;color:#e4e4e7}a{color:#93c5fd;margin-right:10px}h2{margin:28px 0 8px}small{opacity:.6;font-weight:400}
.par{display:flex;gap:12px;align-items:flex-start}figure{margin:0;flex:1;min-width:0}figcaption{margin-bottom:4px;opacity:.7}img{width:100%;display:block;border:1px solid #3f3f46}</style>
<h1>Prototipo contra galeria (Vista ${vista})</h1><nav>${indice}</nav>
${secciones}`;
}

async function principal(): Promise<void> {
  const { temas, vista } = leerArgumentos();
  const cache = process.env['CAPTURAS_DIR'] ?? '/tmp/rinthel-capturas';
  const salida = join(cache, 'salida');
  mkdirSync(salida, { recursive: true });

  const prototipo = vista === 'abierto' ? prepararPrototipo(cache, REPO) : undefined;
  const origen = await servirEstatico(cache);
  const galeria = await iniciarDevDeGaleria(REPO, GALERIA);
  const navegador = await chromium.launch({ executablePath: rutaDeChromium(), headless: true });
  try {
    for (const tema of temas) {
      const vistaDeGaleria = vista === 'abierto' ? `${tema}-referencia` : tema;
      await capturarGaleria(navegador, galeria.url, vistaDeGaleria, join(salida, `${tema}-galeria.png`));
      if (prototipo !== undefined) {
        const rutaDelPrototipo = `${origen}/${prototipo.directorio.split('/').pop()}/${prototipo.pagina}`;
        await capturarPrototipo(navegador, rutaDelPrototipo, VARIANTE_DE_TEMA[tema]!, join(salida, `${tema}-prototipo.png`));
      }
      console.log(`capturado ${tema} (${vista})`);
    }
  } finally {
    await navegador.close();
    galeria.detener();
  }
  writeFileSync(join(salida, 'index.html'), paginaDeComparacion(vista, temas));
  console.log(`\nComparacion: ${origen}/salida/`);
}

await principal();
