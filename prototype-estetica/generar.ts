/**
 * PROTOTIPO DESECHABLE (wipe me): 3 anatomias de dibujo reales (packages/render/src/prototipo.ts).
 * Uso: pnpm -r build && node prototype-estetica/generar.ts [vista] -> prototype-estetica/out/index.html
 * Servir: python3 -m http.server 8731 -d prototype-estetica/out  (?variant=A|B|C, flechas del teclado)
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { combineIconProviders, fuenteCanonicaSchema, genericIcons, resolveView, workspaceIcons } from '../packages/canonico/dist/index.js';
import { layoutView, metricasDe } from '../packages/layout/dist/index.js';
import { renderToSvgString, resolverEstilo } from '../packages/render/dist/index.js';

const vistaId = process.argv[2] ?? 'paquetes';
const raiz = 'examples/rinthel-arch';
const fuente = fuenteCanonicaSchema.parse(JSON.parse(readFileSync(`${raiz}/.diagrams/canonico.json`, 'utf8')));
const view = resolveView(fuente, vistaId)!;
const base = fuente.themes.find((t: any) => t.name === 'diagrams')!;
const ws: Record<string, string> = {};
for (const f of readdirSync(raiz, { recursive: true }) as string[]) if (/\.(dg|svg)$/.test(f)) ws[f] = readFileSync(`${raiz}/${f}`, 'utf8');
const icons = combineIconProviders(workspaceIcons(ws), genericIcons());

const sans = 'Inter, "Helvetica Neue", system-ui, sans-serif';
const variantes = [
  { k: 'A' as const, nombre: 'Tarjeta sobria', bg: '#09090b', fg: '#fafafa', pal: { blue: '#60a5fa', purple: '#a78bfa', green: '#34d399', amber: '#fbbf24', red: '#f87171', gray: '#a1a1aa' },
    m: { anchoMinimo: 160, paddingHorizontal: 84, cabecera: 54, paddingGrupo: { top: 44, left: 20, bottom: 20, right: 20 } } },
  { k: 'B' as const, nombre: 'Glass', bg: '#0a0a14', fg: '#eef0ff', pal: { blue: '#818cf8', purple: '#c084fc', green: '#2dd4bf', amber: '#fbbf24', red: '#fb7185', gray: '#94a3b8' },
    m: { anchoMinimo: 170, paddingHorizontal: 92, cabecera: 58, paddingGrupo: { top: 48, left: 24, bottom: 24, right: 24 } } },
  { k: 'C' as const, nombre: 'Compacta', bg: '#0c0c0f', fg: '#f4f4f5', pal: { blue: '#38bdf8', purple: '#c4b5fd', green: '#4ade80', amber: '#fcd34d', red: '#fca5a5', gray: '#a1a1aa' },
    m: { anchoMinimo: 120, paddingHorizontal: 64, cabecera: 38, paddingGrupo: { top: 44, left: 18, bottom: 18, right: 18 } } },
  { k: 'D' as const, nombre: 'Chip de vidrio (B + C)', bg: '#0a0a14', fg: '#eef0ff', pal: { blue: '#818cf8', purple: '#c084fc', green: '#2dd4bf', amber: '#fbbf24', red: '#fb7185', gray: '#94a3b8' },
    m: { anchoMinimo: 130, paddingHorizontal: 68, cabecera: 40, paddingGrupo: { top: 48, left: 22, bottom: 22, right: 22 } } },
  { k: 'E' as const, nombre: 'Tarjeta de vidrio (A + D)', bg: '#0a0a14', fg: '#eef0ff', pal: { blue: '#818cf8', purple: '#c084fc', green: '#2dd4bf', amber: '#fbbf24', red: '#fb7185', gray: '#94a3b8' },
    m: { anchoMinimo: 160, paddingHorizontal: 84, cabecera: 54, paddingGrupo: { top: 48, left: 22, bottom: 22, right: 22 } } },
  { k: 'F' as const, nombre: 'Pildora con tipo (A + D)', bg: '#09090b', fg: '#fafafa', pal: { blue: '#60a5fa', purple: '#a78bfa', green: '#34d399', amber: '#fbbf24', red: '#f87171', gray: '#a1a1aa' },
    m: { anchoMinimo: 170, paddingHorizontal: 96, cabecera: 52, paddingGrupo: { top: 44, left: 20, bottom: 20, right: 20 } } },
  { k: 'G' as const, nombre: 'Neobrutalista: papel, bordes duros, stickers', bg: '#f3eee1', fg: '#111111', pal: { blue: '#93c5fd', purple: '#c4b5fd', green: '#86efac', amber: '#fdba74', red: '#fca5a5', gray: '#d4d4d8' },
    m: { anchoMinimo: 170, paddingHorizontal: 96, cabecera: 56, paddingGrupo: { top: 48, left: 22, bottom: 22, right: 22 } } },
];

const svgs: string[] = [];
for (const v of variantes) {
  const tema = { ...base, fonts: { body: sans, mono: v.k === 'G' ? '"Space Mono", "JetBrains Mono", ui-monospace, monospace' : 'JetBrains Mono, monospace' }, palette: { ...base.palette, ...v.pal },
    tokens: { ...base.tokens, background: v.bg, foreground: v.fg, border: '#52525b' }, nodeStyles: {}, edgeStyles: {} };
  const metricas = { ...metricasDe(tema), ...v.m };
  const geometry = await layoutView(view, tema, { metricas });
  const estilo = { ...resolverEstilo(tema, metricas), variante: v.k };
  svgs.push(renderToSvgString({ view, geometry, theme: tema, icons, width: geometry.width, height: geometry.height, estilo, metricas }));
}

const html = `<!doctype html><meta charset=utf-8><title>PROTOTIPO estetica</title>
<style>body{margin:0;height:100vh;overflow:hidden;background:#000}.v{display:none;width:100vw;height:100vh}.v svg{width:100%;height:100%}
#bar{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#fff;color:#111;border-radius:999px;padding:6px 14px;font:14px system-ui;box-shadow:0 4px 24px #0008;display:flex;gap:12px;align-items:center;z-index:9}
#bar button{border:0;background:#eee;border-radius:50%;width:28px;height:28px;cursor:pointer}</style>
${svgs.map((s, i) => `<div class=v id=v${variantes[i]!.k} style="background:${variantes[i]!.bg}">${s}</div>`).join('\n')}
<div id=bar><button id=p>&larr;</button><span id=l></span><button id=n>&rarr;</button></div>
<script>
const ks=${JSON.stringify(variantes.map((v) => v.k))},ns=${JSON.stringify(variantes.map((v) => v.nombre))};
let i=Math.max(0,ks.indexOf(new URLSearchParams(location.search).get('variant')));
function show(){ks.forEach((k,j)=>document.getElementById('v'+k).style.display=j===i?'block':'none');l.textContent=ks[i]+' ('+ns[i]+')';
 const u=new URL(location);u.searchParams.set('variant',ks[i]);history.replaceState(0,'',u)}
const go=d=>{i=(i+d+ks.length)%ks.length;show()};p.onclick=()=>go(-1);n.onclick=()=>go(1);
addEventListener('keydown',e=>{if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)});show();
</script>`;
mkdirSync('prototype-estetica/out', { recursive: true });
writeFileSync(`prototype-estetica/out/${vistaId}.html`, html);
if (vistaId === 'paquetes') writeFileSync('prototype-estetica/out/index.html', html);
console.log('ok', vistaId);
