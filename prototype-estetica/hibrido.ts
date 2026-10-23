/**
 * PROTOTIPO DESECHABLE (wipe me) del ticket "Prototipo: render hibrido con tres Temas muy distintos".
 * Nodos y Grupos = HTML/CSS; Aristas = capa SVG; todo bajo UN solo transform (pan/zoom).
 * Los Temas A, D y G son datos declarativos (pilas de Capas sobre Primitivas), sin CSS crudo ni hex fuera de la Paleta.
 * Uso: pnpm -r build && node prototype-estetica/hibrido.ts
 * Servir: python3 -m http.server 8732 -d prototype-estetica/out  -> /hibrido.html?variant=A|D|G&vista=<id>
 * Teclas: flechas = Tema, v = siguiente Vista, d = overlay de alineacion (cajas de ELK en el SVG + desbordes de texto).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { combineIconProviders, fuenteCanonicaSchema, genericIcons, idDeArista, resolveView, workspaceIcons } from '../packages/canonico/dist/index.js';
import { layoutView, metricasDe } from '../packages/layout/dist/index.js';

const raiz = 'examples/rinthel-arch';
const fuente = fuenteCanonicaSchema.parse(JSON.parse(readFileSync(`${raiz}/.diagrams/canonico.json`, 'utf8')));
// Vista sintetica con Grupos abiertos: el ejemplo no trae ninguna y el ticket pregunta por Grupos + Aristas.
const p = fuente.views.find((v: any) => v.id === 'paquetes')!;
const abiertos = ['render', 'sesion', 'layout'];
fuente.views.push({ ...p, id: 'abierto', include: [...p.include, ...abiertos.map((a) => `${a}.**`), 'elk', 'react'], expanded: abiertos, links: p.links.filter((l: any) => !abiertos.includes(l.node)) });
const vistas = ['abierto', 'paquetes', 'exportacion', 'flujo-export'];
const base = fuente.themes.find((t: any) => t.name === 'diagrams')!;
const ws: Record<string, string> = {};
for (const f of readdirSync(raiz, { recursive: true }) as string[]) if (/\.(dg|svg)$/.test(f)) ws[f] = readFileSync(`${raiz}/${f}`, 'utf8');
const icons = combineIconProviders(workspaceIcons(ws), genericIcons());

// ---- Temas declarativos -------------------------------------------------------------------
// Color: nombre de Paleta + modificador "/alfa" ("blue/0.3"); COLOR = color del Nodo. Nunca hex fuera de `paleta`.
// Capa: { n, forma: 'pastilla' | {radio} | {corte}, relleno, borde, sombra[], glow, vidrio, desplaza, deco, sobre }.
// deco (Primitiva decoracion): { tipo: 'barra'|'esquina'|'linea', lado, ancho, color }.
// Variacion: porTipo / estados (hover, colapsado) son parches por nombre de Capa:
//   { <Capa>: {campos} | 'ninguna', '+<nueva>': { antes|despues: <Capa>, ...Capa } }.
// Slots: icono, titulo, tipo (insignia), contador (solo Grupo colapsado). Mini-layout fila.
const T: Record<string, any> = {
  A: {
    nombre: 'A - Tarjeta sobria (tipo Linear/Vercel)',
    fuente: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#09090b', texto: '#fafafa', blue: '#60a5fa', purple: '#a78bfa', green: '#34d399', amber: '#fbbf24', red: '#f87171', gray: '#a1a1aa' },
    metricas: { anchoMinimo: 160, paddingHorizontal: 84, cabecera: 54, paddingGrupo: { top: 44, left: 20, bottom: 20, right: 20 } },
    pagina: [{ n: 'base', relleno: 'fondo' }, { n: 'puntos', relleno: { patron: 'puntos', color: 'texto/0.1', paso: 22 } }],
    nodo: {
      capas: [{ n: 'caja', forma: { radio: 10 }, relleno: 'texto/0.045', borde: { color: 'texto/0.13', ancho: 1 } }],
      slots: { gap: 10, pad: 10, icono: { caja: { lado: 28, radio: 7, relleno: 'COLOR/0.14', borde: 'COLOR/0.45' } }, titulo: { peso: 600 }, tipo: { alfa: 0.5 }, contador: { relleno: 'texto/0.08', borde: 'texto/0.15' } },
      porTipo: {
        paquete: { '+acento': { despues: 'caja', forma: { radio: 10 }, deco: { tipo: 'barra', lado: 'izq', ancho: 3, color: 'COLOR' } } },
        externo: { caja: { relleno: 'fondo', borde: { color: 'texto/0.22', ancho: 1, trazo: 'discontinuo' } } },
      },
      estados: {
        hover: { caja: { borde: { color: 'COLOR/0.7', ancho: 1 } } },
        colapsado: { '+pila': { antes: 'caja', forma: { radio: 10 }, desplaza: { x: 5, y: 5 }, relleno: 'fondo', borde: { color: 'texto/0.1', ancho: 1 } } },
      },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 16 }, relleno: 'texto/0.025', borde: { color: 'texto/0.14', ancho: 1, trazo: 'discontinuo' } }], cabecera: { punto: true, mayus: true, alfa: 0.6, size: 0.8, tracking: '0.1em' } },
    arista: { trazos: [{ color: 'texto/0.32', ancho: 1.2 }], radio: 6, fin: 'v', origen: 'punto', etiqueta: { forma: { radio: 99 }, relleno: 'fondo', borde: 'texto/0.16' } },
  },
  D: {
    nombre: 'D - Chip de vidrio (tipo Raycast/Arc)',
    fuente: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#0a0a14', texto: '#eef0ff', blanco: '#ffffff', profundo: '#1b1850', blue: '#818cf8', purple: '#c084fc', green: '#2dd4bf', amber: '#fbbf24', red: '#fb7185', gray: '#94a3b8' },
    metricas: { anchoMinimo: 130, paddingHorizontal: 68, cabecera: 40, paddingGrupo: { top: 48, left: 22, bottom: 22, right: 22 } },
    pagina: [{ n: 'base', relleno: { gradiente: 'radial', desde: 'profundo', hasta: 'fondo', en: '25% 0%' } }],
    nodo: {
      capas: [
        { n: 'glow', forma: 'pastilla', glow: { color: 'COLOR/0.35', blur: 14 } },
        { n: 'vidrio', forma: 'pastilla', vidrio: { blur: 10 }, relleno: { gradiente: 'lineal', desde: 'COLOR/0.30', hasta: 'COLOR/0.07', ang: 135 } },
        { n: 'borde', forma: 'pastilla', borde: { color: 'blanco/0.2', ancho: 1 } },
        { n: 'brillo', forma: 'pastilla', sobre: true, relleno: { gradiente: 'lineal', desde: 'blanco/0.10', hasta: 'blanco/0', ang: 180 } },
      ],
      slots: { gap: 10, pad: 14, icono: { punto: true }, titulo: { peso: 500 }, tipo: null, contador: { relleno: 'COLOR/0.35', borde: 'blanco/0.25' } },
      porTipo: {
        externo: { glow: 'ninguna', vidrio: { relleno: 'blanco/0.04' }, borde: { borde: { color: 'blanco/0.25', ancho: 1, trazo: 'discontinuo' } } },
        actor: { '+halo': { antes: 'glow', forma: 'pastilla', desplaza: { x: -4, y: -4, crece: 8 }, borde: { color: 'COLOR/0.4', ancho: 1 } } },
      },
      estados: {
        hover: { glow: { glow: { color: 'COLOR/0.7', blur: 22 } } },
        colapsado: { borde: { borde: { color: 'COLOR/0.6', ancho: 1 } } },
      },
    },
    grupo: { capas: [
      { n: 'vidrio', forma: { radio: 24 }, relleno: 'COLOR/0.08', vidrio: { blur: 4 } },
      { n: 'borde', forma: { radio: 24 }, borde: { color: 'blanco/0.16', ancho: 1 } },
    ], cabecera: { chip: true, punto: true, size: 0.85 } },
    arista: { trazos: [{ color: 'texto/0.08', ancho: 6 }, { color: 'texto/0.55', ancho: 1.5 }], radio: 20, fin: 'triangulo', origen: 'anillo', etiqueta: { forma: { radio: 99 }, relleno: 'fondo', borde: 'texto/0.22' } },
  },
  G: {
    nombre: 'G - Neobrutalista (tipo Gumroad)',
    fuente: 'Inter, system-ui, sans-serif', mono: '"Space Mono", "JetBrains Mono", ui-monospace, monospace',
    paleta: { fondo: '#f3eee1', texto: '#111111', blue: '#93c5fd', purple: '#c4b5fd', green: '#86efac', amber: '#fdba74', red: '#fca5a5', gray: '#d4d4d8', papel: '#ffffff', sticker: '#fde047' },
    metricas: { anchoMinimo: 170, paddingHorizontal: 96, cabecera: 56, paddingGrupo: { top: 48, left: 22, bottom: 22, right: 22 } },
    pagina: [{ n: 'base', relleno: 'fondo' }, { n: 'puntos', relleno: { patron: 'puntos', color: 'texto/0.2', paso: 22 } }],
    nodo: {
      capas: [{ n: 'caja', forma: { radio: 6 }, sombra: [{ x: 4, y: 4, blur: 0, color: 'texto' }], relleno: 'papel', borde: { color: 'texto', ancho: 2 } }],
      slots: { gap: 10, pad: 10, icono: { caja: { lado: 30, radio: 5, relleno: 'COLOR', borde: 'texto', anchoBorde: 2, iconoColor: 'texto' } }, titulo: { peso: 800 }, tipo: { alfa: 0.6, mayus: true, mono: true, size: 0.66, tracking: '0.08em' }, contador: { relleno: 'sticker', borde: 'texto', anchoBorde: 2, mono: true } },
      porTipo: {
        externo: { caja: { forma: { corte: 12 }, relleno: 'COLOR/0.35' } },
        artefacto: { '+doblez': { despues: 'caja', sobre: true, deco: { tipo: 'esquina', lado: 'sup-der', ancho: 14, color: 'COLOR' } } },
        salida: { '+cinta': { despues: 'caja', sobre: true, deco: { tipo: 'linea', lado: 'inf', ancho: 5, color: 'COLOR' } } },
      },
      estados: {
        hover: { caja: { sombra: [{ x: 7, y: 7, blur: 0, color: 'texto' }] } },
        colapsado: { caja: { sombra: [{ x: 4, y: 4, blur: 0, color: 'papel' }, { x: 6, y: 6, blur: 0, color: 'texto' }, { x: 10, y: 10, blur: 0, color: 'papel' }, { x: 12, y: 12, blur: 0, color: 'texto' }] } },
      },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 8 }, relleno: 'COLOR/0.3', borde: { color: 'texto', ancho: 2, trazo: 'discontinuo' } }], cabecera: { etiqueta: true, mayus: true, mono: true, size: 0.8, tracking: '0.06em' } },
    arista: { trazos: [{ color: 'texto', ancho: 2 }], radio: 2, fin: 'triangulo', origen: 'cuadrado', etiqueta: { forma: { radio: 3 }, relleno: 'sticker', borde: 'texto', sombra: { x: 2, y: 2, color: 'texto' }, rot: -2, mono: true } },
  },
  H: {
    nombre: 'H - Plano tecnico (blueprint)',
    fuente: '"JetBrains Mono", ui-monospace, monospace', mono: '"JetBrains Mono", ui-monospace, monospace',
    paleta: { fondo: '#0d3b73', texto: '#e6f0ff', blue: '#bfe0ff', purple: '#d9ccff', green: '#c4f5df', amber: '#ffe3a8', red: '#ffc2c2', gray: '#cfdcef', papel: '#0d3b73' },
    metricas: { anchoMinimo: 170, paddingHorizontal: 96, cabecera: 54, paddingGrupo: { top: 46, left: 22, bottom: 22, right: 22 } },
    pagina: [{ n: 'base', relleno: 'fondo' }, { n: 'fina', relleno: { patron: 'cuadricula', color: 'texto/0.06', paso: 20 } }, { n: 'gruesa', relleno: { patron: 'cuadricula', color: 'texto/0.13', paso: 100 } }],
    nodo: {
      capas: [
        { n: 'caja', forma: { radio: 0 }, relleno: 'fondo', borde: { color: 'texto/0.9', ancho: 1.5 } },
        { n: 'interior', forma: { radio: 0 }, desplaza: { x: 4, y: 4, crece: -8 }, borde: { color: 'texto/0.3', ancho: 1 } },
      ],
      slots: { gap: 10, pad: 12, icono: { caja: { lado: 26, radio: 0, relleno: 'COLOR/0.12', borde: 'COLOR' } }, titulo: { peso: 600, mayus: true, size: 0.86, tracking: '0.06em' }, tipo: { alfa: 0.6, mono: true, size: 0.7, prefijo: '' }, contador: { relleno: 'fondo', borde: 'texto', mono: true } },
      porTipo: { externo: { caja: { borde: { color: 'texto/0.8', ancho: 1.5, trazo: 'discontinuo' } }, interior: 'ninguna' } },
      estados: { hover: { caja: { relleno: 'texto/0.08' } }, colapsado: { '+cota': { despues: 'caja', sobre: true, deco: { tipo: 'barra', lado: 'der', ancho: 6, color: 'COLOR/0.6' } } } },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 0 }, borde: { color: 'texto/0.6', ancho: 1, trazo: 'discontinuo' } }], cabecera: { etiqueta: true, etiquetaBorde: 1, mayus: true, mono: true, size: 0.75, tracking: '0.12em' } },
    arista: { trazos: [{ color: 'texto/0.85', ancho: 1 }], radio: 0, fin: 'v', origen: 'punto', etiqueta: { forma: { radio: 0 }, relleno: 'fondo', borde: 'texto/0.7', mono: true } },
  },
  I: {
    nombre: 'I - Claro suave (tipo Stripe/Apple)',
    fuente: 'Inter, "SF Pro Display", system-ui, sans-serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#f5f6fa', texto: '#0f172a', blanco: '#ffffff', blue: '#4f46e5', purple: '#9333ea', green: '#059669', amber: '#d97706', red: '#e11d48', gray: '#64748b' },
    metricas: { anchoMinimo: 180, paddingHorizontal: 100, cabecera: 60, paddingGrupo: { top: 52, left: 24, bottom: 24, right: 24 } },
    pagina: [{ n: 'base', relleno: 'fondo' }, { n: 'luz', relleno: { gradiente: 'radial', desde: 'blue/0.10', hasta: 'fondo/0', en: '15% 10%' } }],
    nodo: {
      capas: [{ n: 'tarjeta', forma: { radio: 16 }, relleno: 'blanco', borde: { color: 'texto/0.06', ancho: 1 }, sombra: [{ x: 0, y: 1, blur: 2, color: 'texto/0.06' }, { x: 0, y: 10, blur: 28, color: 'texto/0.08' }] }],
      slots: { gap: 12, pad: 12, icono: { caja: { lado: 34, radio: 10, relleno: 'COLOR/0.1', borde: 'COLOR/0' } }, titulo: { peso: 600 }, tipo: { alfa: 0.5 }, contador: { relleno: 'COLOR/0.1', borde: 'COLOR/0' } },
      porTipo: { externo: { tarjeta: { relleno: 'fondo', sombra: [], borde: { color: 'texto/0.15', ancho: 1, trazo: 'discontinuo' } } } },
      estados: {
        hover: { tarjeta: { sombra: [{ x: 0, y: 2, blur: 4, color: 'texto/0.06' }, { x: 0, y: 18, blur: 40, color: 'COLOR/0.25' }] } },
        colapsado: { '+hoja': { antes: 'tarjeta', forma: { radio: 16 }, desplaza: { x: 6, y: 6 }, relleno: 'blanco', borde: { color: 'texto/0.06', ancho: 1 }, sombra: [{ x: 0, y: 4, blur: 12, color: 'texto/0.06' }] } },
      },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 22 }, relleno: 'COLOR/0.05' }], cabecera: { chip: true, size: 0.85 } },
    arista: { trazos: [{ color: 'texto/0.22', ancho: 1.5 }], radio: 14, fin: 'triangulo', origen: 'ninguno', etiqueta: { forma: { radio: 99 }, relleno: 'blanco', borde: 'texto/0.08' } },
  },
  J: {
    nombre: 'J - Terminal de fosforo (CRT)',
    fuente: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace', mono: '"JetBrains Mono", ui-monospace, monospace',
    paleta: { fondo: '#020a04', texto: '#7dff9b', blue: '#5cf2ff', purple: '#c49bff', green: '#7dff9b', amber: '#ffcc55', red: '#ff6b6b', gray: '#7dff9b', papel: '#020a04' },
    metricas: { anchoMinimo: 170, paddingHorizontal: 80, cabecera: 46, paddingGrupo: { top: 44, left: 20, bottom: 20, right: 20 } },
    pagina: [{ n: 'base', relleno: { gradiente: 'radial', desde: 'green/0.10', hasta: 'fondo', en: '50% 50%' } }, { n: 'scan', relleno: { patron: 'lineas', color: 'texto/0.05', paso: 3 } }],
    nodo: {
      capas: [{ n: 'caja', forma: { radio: 0 }, relleno: 'COLOR/0.05', borde: { color: 'COLOR/0.8', ancho: 1 }, glow: { color: 'COLOR/0.35', blur: 10 } }],
      slots: { gap: 8, pad: 12, icono: null, titulo: { peso: 700, mayus: true, tracking: '0.04em', glow: 'COLOR/0.8', prefijo: '> ' }, tipo: { alfa: 0.55, mono: true, size: 0.72 }, contador: { relleno: 'fondo', borde: 'COLOR', mono: true } },
      porTipo: { externo: { caja: { relleno: 'fondo', glow: null, borde: { color: 'COLOR/0.6', ancho: 1, trazo: 'discontinuo' } } } },
      estados: { hover: { caja: { relleno: 'COLOR/0.2', glow: { color: 'COLOR/0.7', blur: 18 } } }, colapsado: { '+cursor': { despues: 'caja', sobre: true, deco: { tipo: 'barra', lado: 'der', ancho: 4, color: 'COLOR' } } } },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 0 }, borde: { color: 'texto/0.45', ancho: 1, trazo: 'discontinuo' } }], cabecera: { etiqueta: true, etiquetaBorde: 1, mayus: true, mono: true, size: 0.8, tracking: '0.1em' } },
    arista: { trazos: [{ color: 'texto/0.12', ancho: 5 }, { color: 'texto/0.8', ancho: 1.2, trazo: 'punteado' }], radio: 0, fin: 'v', origen: 'cuadrado', etiqueta: { forma: { radio: 0 }, relleno: 'fondo', borde: 'texto/0.6', mono: true } },
  },
  K: {
    nombre: 'K - Synthwave neon',
    fuente: '"Outfit", "Inter", system-ui, sans-serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#13001f', texto: '#fdf4ff', rosa: '#ff2bd6', cian: '#22e4ff', blue: '#22e4ff', purple: '#b36bff', green: '#3dffb5', amber: '#ffb13d', red: '#ff2b6a', gray: '#c9a6ff' },
    metricas: { anchoMinimo: 160, paddingHorizontal: 84, cabecera: 50, paddingGrupo: { top: 48, left: 22, bottom: 22, right: 22 } },
    pagina: [{ n: 'base', relleno: { gradiente: 'radial', desde: 'rosa/0.28', hasta: 'fondo', en: '50% 115%' } }, { n: 'rejilla', relleno: { patron: 'cuadricula', color: 'rosa/0.10', paso: 44 } }],
    nodo: {
      capas: [
        { n: 'neon', forma: { radio: 12 }, relleno: { gradiente: 'lineal', desde: 'rosa', hasta: 'cian', ang: 100 }, glow: { color: 'rosa/0.55', blur: 18 } },
        { n: 'interior', forma: { radio: 10 }, desplaza: { x: 2, y: 2, crece: -4 }, relleno: { gradiente: 'lineal', desde: 'fondo', hasta: 'COLOR/0.25', ang: 160 } },
      ],
      slots: { gap: 10, pad: 14, icono: { punto: true }, titulo: { peso: 700, glow: 'rosa/0.7' }, tipo: { alfa: 0.6, mayus: true, size: 0.66, tracking: '0.18em' }, contador: { relleno: 'rosa', borde: 'cian' } },
      porTipo: { externo: { neon: { relleno: 'cian/0.6', glow: { color: 'cian/0.4', blur: 12 } } } },
      estados: { hover: { neon: { glow: { color: 'cian/0.8', blur: 28 } } }, colapsado: { '+eco': { antes: 'neon', forma: { radio: 12 }, desplaza: { x: 6, y: 6 }, borde: { color: 'cian/0.5', ancho: 1 } } } },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 18 }, relleno: 'cian/0.04', borde: { color: 'cian/0.5', ancho: 1 }, glow: { color: 'cian/0.15', blur: 20 } }], cabecera: { chip: true, punto: true, mayus: true, size: 0.75, tracking: '0.18em' } },
    arista: { trazos: [{ color: 'rosa/0.18', ancho: 8 }, { color: 'cian', ancho: 1.8 }], radio: 14, fin: 'triangulo', origen: 'anillo', etiqueta: { forma: { radio: 99 }, relleno: 'fondo', borde: 'rosa/0.7' } },
  },
  L: {
    nombre: 'L - Editorial (tipo Stripe Press)',
    fuente: 'Georgia, "Iowan Old Style", "Times New Roman", serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#fbf8f1', texto: '#1c1917', blue: '#1d4ed8', purple: '#7e22ce', green: '#15803d', amber: '#b45309', red: '#b91c1c', gray: '#57534e' },
    metricas: { anchoMinimo: 170, paddingHorizontal: 70, cabecera: 58, paddingGrupo: { top: 52, left: 26, bottom: 26, right: 26 } },
    pagina: [{ n: 'base', relleno: 'fondo' }],
    nodo: {
      capas: [
        { n: 'regla-sup', deco: { tipo: 'linea', lado: 'sup', ancho: 1, color: 'texto' } },
        { n: 'regla-inf', deco: { tipo: 'linea', lado: 'inf', ancho: 1, color: 'texto/0.35' } },
      ],
      slots: { gap: 10, pad: 14, icono: null, titulo: { peso: 400, size: 1.25 }, tipo: { alfa: 0.6, italica: true, size: 0.8, tracking: '0' }, contador: { relleno: 'fondo', borde: 'texto/0.4' } },
      porTipo: { paquete: { 'regla-sup': { deco: { tipo: 'linea', lado: 'sup', ancho: 3, color: 'COLOR' } } }, externo: { 'regla-sup': { deco: { tipo: 'linea', lado: 'sup', ancho: 1, color: 'texto/0.35' } } } },
      estados: { hover: { 'regla-inf': { deco: { tipo: 'linea', lado: 'inf', ancho: 2, color: 'COLOR' } } }, colapsado: {} },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 0 }, borde: { color: 'texto/0.8', ancho: 1 } }], cabecera: { mayus: true, size: 0.72, tracking: '0.22em' } },
    arista: { trazos: [{ color: 'texto/0.75', ancho: 0.8 }], radio: 0, fin: 'v', origen: 'ninguno', etiqueta: { forma: { radio: 0 }, relleno: 'fondo', borde: 'fondo', italica: true } },
  },
  M: {
    nombre: 'M - Bauhaus',
    fuente: 'Futura, "Century Gothic", "Avenir Next", "Jost", sans-serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#efe8d8', texto: '#141414', papel: '#fbf7ee', blue: '#1f4fbf', purple: '#141414', green: '#1f4fbf', amber: '#f2b705', red: '#d6301f', gray: '#141414', rojo: '#d6301f', amarillo: '#f2b705', azul: '#1f4fbf' },
    metricas: { anchoMinimo: 180, paddingHorizontal: 96, cabecera: 58, paddingGrupo: { top: 52, left: 26, bottom: 26, right: 26 } },
    pagina: [{ n: 'base', relleno: 'fondo' }, { n: 'formas', relleno: { disco: [{ color: 'amarillo/0.9', en: '88% 18%', r: 170 }, { color: 'rojo/0.85', en: '8% 92%', r: 110 }, { color: 'azul/0.12', en: '55% 60%', r: 320 }] } }],
    nodo: {
      capas: [
        { n: 'bloque', forma: { radio: 0 }, desplaza: { x: -7, y: -7 }, relleno: 'COLOR' },
        { n: 'caja', forma: { radio: 0 }, relleno: 'papel', borde: { color: 'texto', ancho: 3 } },
      ],
      slots: { gap: 12, pad: 14, icono: { caja: { lado: 26, radio: 99, relleno: 'COLOR', borde: 'texto', anchoBorde: 0, iconoColor: 'papel' } }, titulo: { peso: 800, mayus: true, tracking: '0.04em' }, tipo: { alfa: 0.7, mayus: true, size: 0.62, tracking: '0.25em' }, contador: { relleno: 'amarillo', borde: 'texto', anchoBorde: 2 } },
      porTipo: {
        actor: { bloque: { forma: 'pastilla' }, caja: { forma: 'pastilla' } },
        externo: { bloque: 'ninguna', caja: { forma: { corte: 18 }, relleno: 'COLOR/0.25', borde: { color: 'texto', ancho: 3 } } },
      },
      estados: { hover: { bloque: { desplaza: { x: -11, y: -11 } } }, colapsado: { '+franja': { despues: 'caja', sobre: true, deco: { tipo: 'barra', lado: 'der', ancho: 12, color: 'COLOR' } } } },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 0 }, relleno: 'COLOR/0.1', borde: { color: 'texto', ancho: 3 } }], cabecera: { etiqueta: true, etiquetaBorde: 3, mayus: true, size: 0.8, tracking: '0.2em' } },
    arista: { trazos: [{ color: 'texto', ancho: 3 }], radio: 0, fin: 'triangulo', origen: 'cuadrado', etiqueta: { forma: { radio: 0 }, relleno: 'amarillo', borde: 'texto', mono: false } },
  },
  N: {
    nombre: 'N - Pizarra con post-its (mano alzada)',
    fuente: '"Caveat", "Patrick Hand", "Comic Neue", "Comic Sans MS", "Segoe Print", cursive', mono: '"Caveat", "Comic Sans MS", cursive',
    paleta: { fondo: '#fcfcf8', texto: '#2b2b2b', cinta: '#d8d2c0', blue: '#bfe3ff', purple: '#e4d0ff', green: '#c8f2c2', amber: '#fff3a0', red: '#ffc9d6', gray: '#fff3a0', papel: '#fcfcf8', tinta: '#2456c9' },
    metricas: { anchoMinimo: 170, paddingHorizontal: 90, cabecera: 62, paddingGrupo: { top: 56, left: 26, bottom: 26, right: 26 } },
    pagina: [{ n: 'base', relleno: 'fondo' }, { n: 'cuadros', relleno: { patron: 'cuadricula', color: 'tinta/0.07', paso: 26 } }],
    nodo: {
      giro: { max: 3 },
      capas: [
        { n: 'nota', forma: { radio: 2 }, relleno: { gradiente: 'lineal', desde: 'COLOR', hasta: 'mezcla(COLOR,texto,0.92)', ang: 170 }, sombra: [{ x: 1, y: 10, blur: 14, color: 'texto/0.18' }] },
        { n: 'cinta', sobre: true, deco: { tipo: 'cinta', ancho: 54, color: 'cinta/0.7' } },
      ],
      slots: { gap: 8, pad: 14, icono: null, titulo: { peso: 700, size: 1.45 }, tipo: { alfa: 0.55, size: 0.95, tracking: '0' }, contador: { relleno: 'papel', borde: 'texto' } },
      porTipo: {
        actor: { nota: { relleno: 'papel', sombra: [], borde: { color: 'texto', ancho: 2 }, forma: 'pastilla', mano: true }, cinta: 'ninguna' },
        externo: { nota: { relleno: 'papel', sombra: [], borde: { color: 'tinta', ancho: 2, trazo: 'discontinuo' }, mano: true }, cinta: 'ninguna' },
      },
      estados: { hover: { nota: { sombra: [{ x: 2, y: 18, blur: 24, color: 'texto/0.25' }] } }, colapsado: { '+debajo': { antes: 'nota', forma: { radio: 2 }, desplaza: { x: 6, y: 5 }, relleno: 'mezcla(COLOR,texto,0.85)', sombra: [{ x: 1, y: 6, blur: 10, color: 'texto/0.15' }] } } },
    },
    grupo: { capas: [{ n: 'caja', forma: { radio: 14 }, borde: { color: 'tinta/0.7', ancho: 2.5 }, mano: true }], cabecera: { size: 1.4 } },
    arista: { mano: true, trazos: [{ color: 'tinta', ancho: 2 }], radio: 18, fin: 'v', origen: 'ninguno', etiqueta: { forma: { radio: 0 }, relleno: 'fondo/0', borde: 'fondo/0', texto: 'tinta', size: 17 } },
  },
  O: {
    nombre: 'O - Teclas 3D',
    fuente: '"Nunito", "Inter", system-ui, sans-serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#2b2d3a', texto: '#1b1c24', luz: '#ffffff', blue: '#8ab4ff', purple: '#c7a6ff', green: '#86e3b5', amber: '#ffd27a', red: '#ff9a9a', gray: '#d9dce6', papel: '#d9dce6' },
    metricas: { anchoMinimo: 160, paddingHorizontal: 84, cabecera: 56, paddingGrupo: { top: 52, left: 24, bottom: 30, right: 24 } },
    pagina: [{ n: 'base', relleno: { gradiente: 'radial', desde: 'mezcla(fondo,luz,0.85)', hasta: 'fondo', en: '50% 30%' } }],
    nodo: {
      capas: [{ n: 'tecla', forma: { radio: 12 }, relleno: { gradiente: 'lineal', desde: 'mezcla(COLOR,luz,0.7)', hasta: 'COLOR', ang: 180 }, borde: { color: 'luz/0.5', ancho: 1 },
        sombra: [{ x: 0, y: 2, blur: 0, color: 'mezcla(COLOR,texto,0.6)' }, { x: 0, y: 4, blur: 0, color: 'mezcla(COLOR,texto,0.55)' }, { x: 0, y: 6, blur: 0, color: 'mezcla(COLOR,texto,0.5)' }, { x: 0, y: 8, blur: 0, color: 'mezcla(COLOR,texto,0.45)' }, { x: 0, y: 14, blur: 16, color: 'texto/0.55' }] }],
      slots: { gap: 10, pad: 12, icono: { caja: { lado: 30, radio: 9, relleno: 'luz/0.45', borde: 'luz/0.6', iconoColor: 'texto' } }, titulo: { peso: 800 }, tipo: { alfa: 0.55, size: 0.7 }, contador: { relleno: 'luz/0.6', borde: 'texto/0.3' } },
      porTipo: { externo: { tecla: { relleno: 'papel/0.15', borde: { color: 'papel/0.5', ancho: 2, trazo: 'discontinuo' }, sombra: [] } } },
      estados: {
        hover: { tecla: { sombra: [{ x: 0, y: 2, blur: 0, color: 'mezcla(COLOR,texto,0.6)' }, { x: 0, y: 4, blur: 8, color: 'texto/0.5' }] } },
        colapsado: { '+base': { antes: 'tecla', forma: { radio: 14 }, desplaza: { x: -4, y: -4, crece: 8 }, relleno: 'texto/0.35' } },
      },
    },
    grupo: { capas: [{ n: 'bandeja', forma: { radio: 20 }, relleno: 'texto/0.35', sombra: [{ x: 0, y: 2, blur: 0, color: 'luz/0.08' }], borde: { color: 'texto/0.6', ancho: 1 } }], cabecera: { chip: true, punto: true, size: 0.8 } },
    arista: { trazos: [{ color: 'texto/0.6', ancho: 7 }, { color: 'papel/0.85', ancho: 2.5 }], radio: 16, fin: 'triangulo', origen: 'anillo', etiqueta: { forma: { radio: 8 }, relleno: 'papel', borde: 'texto/0.5' } },
  },
  P: {
    nombre: 'P - Mapa de metro',
    fuente: '"Helvetica Neue", "Inter", Arial, sans-serif', mono: 'JetBrains Mono, monospace',
    paleta: { fondo: '#ffffff', texto: '#111111', blanco: '#ffffff', blue: '#0067b1', purple: '#8a3ffc', green: '#00953b', amber: '#f5a300', red: '#e3001b', gray: '#7a7a7a' },
    metricas: { anchoMinimo: 150, paddingHorizontal: 76, cabecera: 52, paddingGrupo: { top: 50, left: 26, bottom: 26, right: 26 } },
    pagina: [{ n: 'base', relleno: 'fondo' }],
    nodo: {
      capas: [{ n: 'estacion', forma: 'pastilla', relleno: 'blanco', borde: { color: 'texto', ancho: 4 } }],
      slots: { gap: 10, pad: 12, icono: { caja: { lado: 22, radio: 99, relleno: 'COLOR', borde: 'texto', anchoBorde: 3, iconoColor: 'blanco' } }, titulo: { peso: 700 }, tipo: null, contador: { relleno: 'blanco', borde: 'texto', anchoBorde: 2 } },
      porTipo: { externo: { estacion: { borde: { color: 'texto', ancho: 4, trazo: 'discontinuo' } } } },
      estados: { hover: { estacion: { relleno: 'COLOR/0.12', borde: { color: 'COLOR', ancho: 4 } } }, colapsado: { estacion: { borde: { color: 'texto', ancho: 7 } } } },
    },
    grupo: { capas: [{ n: 'zona', forma: { radio: 36 }, relleno: 'COLOR/0.07' }], cabecera: { mayus: true, size: 0.75, tracking: '0.18em' } },
    arista: { trazos: [{ color: 'blanco', ancho: 11 }, { color: 'ORIGEN', ancho: 6 }], radio: 22, fin: 'ninguno', origen: 'ninguno', etiqueta: { forma: { radio: 3 }, relleno: 'texto', borde: 'texto', texto: 'blanco', peso: 700 } },
  },
  Q: {
    nombre: 'Q - Circuito impreso',
    fuente: '"JetBrains Mono", ui-monospace, monospace', mono: '"JetBrains Mono", ui-monospace, monospace',
    paleta: { fondo: '#0c4a2f', texto: '#f2f2ea', placa: '#0c4a2f', chip: '#16171a', cobre: '#d8a24a', estano: '#c9ccd1', serigrafia: '#f2f2ea', blue: '#6fb7ff', purple: '#c49bff', green: '#7be38f', amber: '#ffcc55', red: '#ff7a6b', gray: '#c9ccd1' },
    metricas: { anchoMinimo: 170, paddingHorizontal: 90, cabecera: 54, paddingGrupo: { top: 50, left: 26, bottom: 30, right: 26 } },
    pagina: [{ n: 'placa', relleno: 'placa' }, { n: 'fibra', relleno: { ruido: { alfa: 0.07, escala: 0.8 } } }, { n: 'rejilla', relleno: { patron: 'puntos', color: 'serigrafia/0.08', paso: 16 } }],
    nodo: {
      capas: [
        { n: 'patas', forma: { radio: 2 }, deco: { tipo: 'pines', color: 'estano', ancho: 4, paso: 11, largo: 6, margen: 10 } },
        { n: 'chip', forma: { radio: 3 }, relleno: { gradiente: 'lineal', desde: 'chip', hasta: 'mezcla(chip,serigrafia,0.9)', ang: 160 }, sombra: [{ x: 0, y: 3, blur: 6, color: 'chip/0.6' }] },
        { n: 'muesca', sobre: true, deco: { tipo: 'muesca', color: 'serigrafia/0.25' } },
      ],
      slots: { gap: 10, pad: 18, icono: { caja: { lado: 22, radio: 2, relleno: 'COLOR/0.15', borde: 'COLOR/0.6' } }, titulo: { peso: 700, mayus: true, size: 0.86, tracking: '0.05em' }, tipo: { alfa: 0.5, mono: true, mayus: true, size: 0.62, tracking: '0.15em' }, contador: { relleno: 'cobre', borde: 'cobre', mono: true } },
      porTipo: {
        actor: { patas: 'ninguna', muesca: 'ninguna', chip: { forma: 'pastilla', relleno: 'cobre/0.15', borde: { color: 'cobre', ancho: 2 }, sombra: [] } },
        externo: { patas: { deco: { tipo: 'pines', color: 'cobre', ancho: 6, paso: 16, largo: 8, margen: 14 } }, chip: { relleno: 'placa', borde: { color: 'serigrafia/0.8', ancho: 1.5, trazo: 'discontinuo' }, sombra: [] }, muesca: 'ninguna' },
        artefacto: { chip: { forma: { radio: 2 }, relleno: { gradiente: 'lineal', desde: 'mezcla(estano,chip,0.35)', hasta: 'mezcla(estano,chip,0.2)', ang: 180 } } },
      },
      estados: { hover: { chip: { glow: { color: 'COLOR/0.6', blur: 14 } } }, colapsado: { '+disipador': { despues: 'chip', sobre: true, forma: { radio: 2 }, desplaza: { x: 0, y: 0 }, relleno: { patron: 'lineas', color: 'serigrafia/0.06', paso: 4 } } } },
    },
    grupo: { capas: [{ n: 'serigrafia', forma: { radio: 0 }, borde: { color: 'serigrafia/0.75', ancho: 1.5 } }, { n: 'zona', forma: { radio: 0 }, desplaza: { x: 5, y: 5, crece: -10 }, borde: { color: 'serigrafia/0.25', ancho: 1, trazo: 'discontinuo' } }], cabecera: { mayus: true, mono: true, size: 0.75, tracking: '0.2em' } },
    arista: { trazos: [{ color: 'cobre/0.25', ancho: 7 }, { color: 'cobre', ancho: 3 }], radio: 10, esquina: 'chaflan', origen: 'via', fin: 'via', via: 'cobre', etiqueta: { forma: { radio: 0 }, relleno: 'placa', borde: 'serigrafia/0.7', mono: true, texto: 'serigrafia', size: 10.5 } },
  },
  R: {
    nombre: 'R - Pixel art 8 bits',
    fuente: '"Press Start 2P", "VT323", ui-monospace, monospace', mono: '"Press Start 2P", ui-monospace, monospace',
    paleta: { fondo: '#1b1135', texto: '#ffffff', negro: '#0d0a1f', luz: '#ffffff', blue: '#3fa9f5', purple: '#b26bff', green: '#5ee65e', amber: '#ffd23f', red: '#ff4d6d', gray: '#c0c0d0', estrella: '#ffe9a8' },
    metricas: { anchoMinimo: 170, paddingHorizontal: 92, cabecera: 58, factorDeAncho: 0.8, paddingGrupo: { top: 52, left: 26, bottom: 26, right: 26 } },
    pagina: [{ n: 'cielo', relleno: { gradiente: 'lineal', desde: 'fondo', hasta: 'mezcla(fondo,purple,0.7)', ang: 180 } }, { n: 'estrellas', relleno: { patron: 'puntos', color: 'estrella/0.5', paso: 37 } }],
    nodo: {
      colorTexto: 'negro',
      capas: [{ n: 'bloque', forma: { radio: 0 }, relleno: 'COLOR', sombra: [
        { x: 4, y: 4, blur: 0, dentro: true, color: 'luz/0.45' }, { x: -4, y: -4, blur: 0, dentro: true, color: 'negro/0.35' },
        { x: 0, y: -4, blur: 0, color: 'negro' }, { x: 0, y: 4, blur: 0, color: 'negro' }, { x: -4, y: 0, blur: 0, color: 'negro' }, { x: 4, y: 0, blur: 0, color: 'negro' },
        { x: 8, y: 8, blur: 0, color: 'negro/0.45' }] }],
      slots: { gap: 10, pad: 12, icono: { caja: { lado: 24, radio: 0, relleno: 'negro/0.2', borde: 'negro/0', anchoBorde: 0, iconoColor: 'negro' } }, titulo: { peso: 400, mayus: true, size: 0.68 }, tipo: { alfa: 0.65, size: 0.5, mayus: true, tracking: '0' }, contador: { relleno: 'luz', borde: 'negro', anchoBorde: 3 } },
      porTipo: { externo: { bloque: { relleno: { patron: 'cuadricula', color: 'negro/0.25', paso: 4 } } } },
      estados: {
        hover: { bloque: { relleno: 'mezcla(COLOR,luz,0.75)' } },
        colapsado: { '+monedas': { despues: 'bloque', sobre: true, deco: { tipo: 'barra', lado: 'der', ancho: 8, color: 'amber' } } },
      },
    },
    grupo: { capas: [{ n: 'marco', forma: { radio: 0 }, relleno: 'negro/0.35', sombra: [{ x: 0, y: -4, blur: 0, color: 'luz/0.8' }, { x: 0, y: 4, blur: 0, color: 'luz/0.8' }, { x: -4, y: 0, blur: 0, color: 'luz/0.8' }, { x: 4, y: 0, blur: 0, color: 'luz/0.8' }] }], cabecera: { etiqueta: true, etiquetaRelleno: 'amber', etiquetaBorde: 3, mayus: true, size: 0.6 } },
    arista: { trazos: [{ color: 'negro/0.6', ancho: 8 }, { color: 'luz', ancho: 4, trazo: 'pixel' }], radio: 0, fin: 'triangulo', origen: 'cuadrado', etiqueta: { forma: { radio: 0 }, relleno: 'luz', borde: 'negro', texto: 'negro', size: 8, peso: 400 } },
  },
};

// ---- Geometria por Tema y Vista (cada Tema trae sus Metricas) -----------------------------
const salida: any[] = [];
for (const vistaId of vistas) {
  const view = resolveView(fuente, vistaId)!;
  const hijosDe = new Set(view.nodes.flatMap((n: any) => n.children.map((c: any) => c.id)));
  const raices = view.nodes.filter((n: any) => !hijosDe.has(n.id));
  for (const k of Object.keys(T)) {
    const t = T[k];
    const tema = { ...base, fonts: { body: t.fuente, mono: t.mono }, palette: { ...base.palette }, tokens: { ...base.tokens }, nodeStyles: {}, edgeStyles: {} };
    const metricas = { ...metricasDe(tema), ...t.metricas };
    const g = await layoutView(view, tema, { metricas });
    // Las cajas de ELK son relativas al Grupo padre; las Aristas, al lienzo. Capas planas (Grupo < Arista < Nodo) => absolutas.
    const rec = (n: any, dx = 0, dy = 0): any => {
      const c = g.nodes[n.id];
      const caja = { ...c, x: c.x + dx, y: c.y + dy };
      return { id: n.id, tipo: n.type, label: n.label, colapsado: n.collapsed, cuenta: n.childCount, color: n.color ?? null, icon: n.icon ? (icons.resolve(n.icon) ?? null) : null, caja, hijos: n.children.map((h: any) => rec(h, caja.x, caja.y)) };
    };
    const colorDe = new Map(view.nodes.map((n: any) => [n.id, n.color ?? null]));
    const aristas = view.edges.map((a: any) => ({ desde: colorDe.get(a.from.node) ?? null, id: idDeArista(a), puntos: g.edges[idDeArista(a)]?.points ?? [], label: a.label ?? null, caja: g.labels[idDeArista(a)] ?? null }));
    salida.push({ vista: vistaId, k, ancho: g.width, alto: g.height, arboles: raices.map((n: any) => rec(n)), aristas });
  }
}

const cliente = `
const DATOS=__DATOS__, TEMAS=__TEMAS__;
const ks=Object.keys(TEMAS), vs=[...new Set(DATOS.map(d=>d.vista))];
const q=new URLSearchParams(location.search);
let cur=Math.max(0,ks.indexOf(q.get('variant'))), vcur=Math.max(0,vs.indexOf(q.get('vista'))), debug=q.get('debug')==='1';
const NS='http://www.w3.org/2000/svg';
const h=(tag,css,hijos,attrs)=>{const e=document.createElement(tag);Object.assign(e.style,css||{});for(const k in attrs||{})e.setAttribute(k,attrs[k]);(hijos||[]).forEach(c=>e.append(c));return e};
const s=(tag,attrs,hijos)=>{const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);(hijos||[]).forEach(c=>e.append(c));return e};
// Color: "blue/0.3" | "COLOR/0.3" | "texto". Solo nombres de Paleta (o COLOR).
function col(T,spec,COLOR){if(spec==null)return 'transparent';
 const m=/^mezcla\\((.+?),(.+?),([0-9.]+)\\)$/.exec(String(spec));if(m)return 'color-mix(in srgb,'+col(T,m[1],COLOR)+' '+(+m[3]*100)+'%,'+col(T,m[2],COLOR)+')';
 let [n,a]=String(spec).split('/');let c=n==='COLOR'||n==='ORIGEN'?COLOR:T.paleta[n];if(!c){console.warn('color fuera de Paleta',spec);c='magenta'}if(a===undefined)return c;
 let x=c.slice(1);if(x.length===3)x=[...x].map(q=>q+q).join('');
 return 'rgba('+parseInt(x.slice(0,2),16)+','+parseInt(x.slice(2,4),16)+','+parseInt(x.slice(4,6),16)+','+a+')'}
const radio=(f,hh)=>f==='pastilla'?hh/2+'px':f&&f.radio!=null?f.radio+'px':'0';
function relleno(T,r,COLOR){if(r==null)return {};if(typeof r==='string')return {background:col(T,r,COLOR)};
 if(r.gradiente==='lineal')return {background:'linear-gradient('+r.ang+'deg,'+col(T,r.desde,COLOR)+','+col(T,r.hasta,COLOR)+')'};
 if(r.gradiente==='radial')return {background:'radial-gradient(circle at '+r.en+','+col(T,r.desde,COLOR)+','+col(T,r.hasta,COLOR)+' 110%)'};
 if(r.patron==='puntos')return {backgroundImage:'radial-gradient('+col(T,r.color,COLOR)+' 1px,transparent 1.2px)',backgroundSize:r.paso+'px '+r.paso+'px'};
 if(r.patron==='cuadricula'){const c=col(T,r.color,COLOR);return {backgroundImage:'linear-gradient('+c+' 1px,transparent 1px),linear-gradient(90deg,'+c+' 1px,transparent 1px)',backgroundSize:r.paso+'px '+r.paso+'px'}}
 if(r.ruido){const a=r.ruido.alfa,f=r.ruido.escala||0.9;const svg="<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='"+f+"' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 "+a+" 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>";return {backgroundImage:'url("data:image/svg+xml;utf8,'+svg+'")'}}
 if(r.disco)return {backgroundImage:r.disco.map(q=>'radial-gradient(circle at '+q.en+','+col(T,q.color,COLOR)+' 0 '+q.r+'px,transparent '+(q.r+1)+'px)').join(',')};
 if(r.patron==='lineas')return {backgroundImage:'repeating-linear-gradient(0deg,'+col(T,r.color,COLOR)+' 0 1px,transparent 1px '+r.paso+'px)'};return {}}
// Aplica parches por nombre de Capa: cambiar campos, 'ninguna' quita, '+nombre' anade antes/despues de otra Capa.
function parchear(capas,parches){let r=capas.map(c=>({...c}));for(const p of parches){if(!p)continue;for(const k in p){const v=p[k];
 if(k[0]==='+'){const n=k.slice(1);const c={...v,n};delete c.antes;delete c.despues;r=r.filter(x=>x.n!==n);const ref=v.antes||v.despues;let i=r.findIndex(x=>x.n===ref);if(i<0)i=v.antes?0:r.length-1;r.splice(v.antes?i:i+1,0,c)}
 else if(v==='ninguna')r=r.filter(x=>x.n!==k);else r=r.map(x=>x.n===k?{...x,...v}:x)}}return r}
// Una Capa -> un div absoluto que cubre la caja (Primitivas). Formas no rectangulares -> SVG dentro del div.
function capa(T,l,w,hh,COLOR){const d=l.desplaza||{};const g=d.crece||0;
 const css={position:'absolute',left:(d.x||0)+'px',top:(d.y||0)+'px',width:(w+g)+'px',height:(hh+g)+'px',borderRadius:radio(l.forma,hh+g),pointerEvents:'none',boxSizing:'border-box',zIndex:l.sobre?2:0};
 if(w===0){css.width='100%';css.height='100%'}
 const sh=[];(l.sombra||[]).forEach(q=>sh.push((q.dentro?'inset ':'')+q.x+'px '+q.y+'px '+q.blur+'px '+(q.exp||0)+'px '+col(T,q.color,COLOR)));if(l.glow)sh.push('0 0 '+l.glow.blur+'px '+col(T,l.glow.color,COLOR));
 const e=h('div',css,[],{'data-capa':l.n});
 if(l.forma&&l.forma.corte!=null){const k=l.forma.corte,b=l.borde?l.borde.ancho:0,o=b/2;
  const pts=[[k,o],[w-o,o],[w-o,hh-k],[w-k,hh-o],[o,hh-o],[o,k]].map(p=>p.join(',')).join(' ');
  const sv=s('svg',{width:w,height:hh,viewBox:'0 0 '+w+' '+hh},[s('polygon',{points:pts,fill:typeof l.relleno==='string'?col(T,l.relleno,COLOR):'none',stroke:l.borde?col(T,l.borde.color,COLOR):'none','stroke-width':b,'stroke-linejoin':'round'})]);
  sv.style.overflow='visible';e.append(sv);
  // sombra dura sobre forma no rectangular: drop-shadow (sigue el alfa del poligono), no box-shadow.
  if(l.sombra)e.style.filter=l.sombra.map(q=>'drop-shadow('+q.x+'px '+q.y+'px '+q.blur+'px '+col(T,q.color,COLOR)+')').join(' ');
  if(typeof l.relleno==='string'&&l.relleno.startsWith('COLOR')){const base=s('polygon',{points:pts,fill:col(T,'papel'),stroke:'none'});sv.prepend(base)}
  return e}
 Object.assign(css,relleno(T,l.relleno,COLOR));Object.assign(e.style,relleno(T,l.relleno,COLOR));
 if(l.borde)e.style.border=(l.borde.ancho||1)+'px '+(l.borde.trazo==='discontinuo'?'dashed':'solid')+' '+col(T,l.borde.color,COLOR);
 if(sh.length)e.style.boxShadow=sh.join(',');
 if(l.mano)e.style.filter='url(#mano)';
 if(l.vidrio){e.style.backdropFilter='blur('+l.vidrio.blur+'px)';e.style.webkitBackdropFilter=e.style.backdropFilter}
 if(l.deco){const D=l.deco,c=col(T,D.color,COLOR);e.style.overflow='hidden';
  if(D.tipo==='barra')e.append(h('div',{position:'absolute',top:0,bottom:0,[D.lado==='izq'?'left':'right']:0,width:D.ancho+'px',background:c}));
  if(D.tipo==='linea')e.append(h('div',{position:'absolute',left:0,right:0,[D.lado==='inf'?'bottom':'top']:0,height:D.ancho+'px',background:c,...(D.filete?{borderTop:D.filete+'px solid '+col(T,'texto')}:{})}));
  if(D.tipo==='pines'){e.style.overflow='visible';const peine={position:'absolute',left:D.margen+'px',right:D.margen+'px',height:D.largo+'px',backgroundImage:'repeating-linear-gradient(90deg,'+c+' 0 '+D.ancho+'px,transparent '+D.ancho+'px '+D.paso+'px)'};
   e.append(h('div',{...peine,top:-D.largo+'px'}),h('div',{...peine,bottom:-D.largo+'px'}))}
  if(D.tipo==='muesca'){e.append(h('div',{position:'absolute',left:'6px',top:'6px',width:'6px',height:'6px',borderRadius:'50%',background:c}))}
  if(D.tipo==='cinta'){e.style.overflow='visible';e.append(h('div',{position:'absolute',top:'-9px',left:'50%',width:D.ancho+'px',height:'18px',marginLeft:-D.ancho/2+'px',background:c,transform:'rotate(-4deg)'}))}
  if(D.tipo==='esquina'){e.style.overflow='visible';e.append(h('div',{position:'absolute',top:'-2px',right:'-2px',width:0,height:0,borderStyle:'solid',borderWidth:'0 '+D.ancho+'px '+D.ancho+'px 0',borderColor:'transparent '+col(T,'fondo')+' '+c+' transparent',boxShadow:'-2px 2px 0 '+col(T,'texto')}))}}
 return e}
function iconoSvg(raw,px,color){const d=h('div',{width:px+'px',height:px+'px',color,display:'flex'});d.innerHTML=(raw||'').replace(/<svg\\b([^>]*)>/,(m,a)=>'<svg width="'+px+'" height="'+px+'"'+a.replace(/\\s(?:width|height)\\s*=\\s*("[^"]*"|'[^']*')/g,'')+'>');return d}
function contador(T,S,n,COLOR){const C=S.contador;return h('div',{marginLeft:'auto',flex:'none',fontSize:'11px',fontWeight:700,padding:'1px 7px',borderRadius:'99px',background:col(T,C.relleno,COLOR),border:(C.anchoBorde||1)+'px solid '+col(T,C.borde,COLOR),fontFamily:C.mono?T.mono:'inherit'},[String(n.cuenta)])}
function nodoHtml(T,n){const c=n.caja,w=c.width,hh=c.height;const COLOR=T.paleta[n.color]||T.paleta.gray;const N=T.nodo,S=N.slots;
 const raiz=h('div',{position:'absolute',left:c.x+'px',top:c.y+'px',width:w+'px',height:hh+'px',font:'14px '+T.fuente,color:col(T,N.colorTexto||'texto',COLOR),contain:'layout style',transition:'transform .15s'},[],{'data-id':n.id});
 const pila=(hover)=>parchear(N.capas,[(N.porTipo||{})[n.tipo],n.colapsado?N.estados.colapsado:null,hover?N.estados.hover:null]);
 // La pila va de abajo a arriba antes de la fila de Slots; las Capas "sobre" suben con z-index.
 const pintar=(hover)=>{raiz.querySelectorAll(':scope>[data-capa]').forEach(e=>e.remove());const f=raiz.querySelector(':scope>.fila');pila(hover).forEach(L=>raiz.insertBefore(capa(T,L,w,hh,COLOR),f))};
 const fila=h('div',{position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:S.gap+'px',padding:'0 '+S.pad+'px',height:'100%',boxSizing:'border-box'},[],{class:'fila'});
 const I=S.icono||{};
 if(I.caja){const b=h('div',{width:I.caja.lado+'px',height:I.caja.lado+'px',flex:'none',borderRadius:I.caja.radio+'px',background:col(T,I.caja.relleno,COLOR),border:(I.caja.anchoBorde||1)+'px solid '+col(T,I.caja.borde,COLOR),display:'flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box'});
  b.append(n.icon?iconoSvg(n.icon,16,col(T,I.caja.iconoColor||'COLOR',COLOR)):h('div',{width:'7px',height:'7px',borderRadius:'50%',background:COLOR}));fila.append(b)}
 else if(I.punto){const r=h('div',{width:'18px',height:'18px',flex:'none',borderRadius:'50%',background:col(T,'COLOR/0.25',COLOR),display:'flex',alignItems:'center',justifyContent:'center'});r.append(h('div',{width:'8px',height:'8px',borderRadius:'50%',background:COLOR}));fila.append(r)}
 const txt=h('div',{display:'flex',flexDirection:'column',lineHeight:'1.25',flex:'none'},[],{class:'txt'});
 const Ti=S.titulo;txt.append(h('div',{fontWeight:Ti.peso,whiteSpace:'nowrap',fontSize:(Ti.size||1)*14+'px',textTransform:Ti.mayus?'uppercase':'none',letterSpacing:Ti.tracking||'normal',fontFamily:Ti.mono?T.mono:'inherit',fontStyle:Ti.italica?'italic':'normal',textShadow:Ti.glow?'0 0 8px '+col(T,Ti.glow,COLOR):'none'},[Ti.prefijo?Ti.prefijo+n.label:n.label]));
 if(S.tipo){const t=S.tipo;txt.append(h('div',{fontSize:(t.size||0.74)*14+'px',opacity:t.alfa,textTransform:t.mayus?'uppercase':'none',fontFamily:t.mono?T.mono:'inherit',letterSpacing:t.tracking||'0.02em',whiteSpace:'nowrap',fontStyle:t.italica?'italic':'normal'},[n.tipo]))}
 fila.append(txt);if(n.colapsado)fila.append(contador(T,S,n,COLOR));raiz.append(fila);pintar(false);
 let giro='';if(N.giro){let x=0;for(const ch of n.id)x=(x*31+ch.charCodeAt(0))>>>0;giro=' rotate('+(((x%1000)/500-1)*N.giro.max).toFixed(2)+'deg)';raiz.style.transform=giro}
 raiz.addEventListener('mouseenter',()=>{pintar(true);raiz.style.transform='translateY(-1px)'+(N.giro?'':giro)});raiz.addEventListener('mouseleave',()=>{pintar(false);raiz.style.transform=giro});
 return raiz}
function grupoHtml(T,n){const c=n.caja,w=c.width,hh=c.height;const COLOR=T.paleta[n.color]||T.paleta.gray;const G=T.grupo,C=G.cabecera;
 const raiz=h('div',{position:'absolute',left:c.x+'px',top:c.y+'px',width:w+'px',height:hh+'px',font:'14px '+T.fuente,color:col(T,'texto')},[],{'data-id':n.id});
 G.capas.forEach(L=>raiz.append(capa(T,L,w,hh,COLOR)));
 const cab=h('div',{position:'absolute',left:'12px',top:'9px',display:'flex',alignItems:'center',gap:'8px',fontSize:14*(C.size||0.9)+'px',fontWeight:600,padding:C.chip||C.etiqueta?'3px 10px':'0 6px',
   borderRadius:C.chip?'99px':C.etiqueta?'4px':'0',background:C.chip?col(T,'COLOR/0.2',COLOR):C.etiqueta?col(T,C.etiquetaRelleno||'papel',COLOR):'none',border:C.chip?'1px solid '+col(T,'COLOR/0.5',COLOR):C.etiqueta?(C.etiquetaBorde||2)+'px solid '+col(T,'texto',COLOR):'none',
   textTransform:C.mayus?'uppercase':'none',fontFamily:C.mono?T.mono:'inherit',letterSpacing:C.tracking||'0',opacity:C.alfa||1});
 if(C.punto)cab.append(h('div',{width:'7px',height:'7px',borderRadius:'50%',background:COLOR}));cab.append(n.label);raiz.append(cab);return raiz}
function ruta(p,r,chaflan){let d='M '+p[0].x+' '+p[0].y;for(let i=1;i<p.length-1;i++){const a=p[i-1],b=p[i],c=p[i+1];const l1=Math.hypot(b.x-a.x,b.y-a.y)||1,l2=Math.hypot(c.x-b.x,c.y-b.y)||1,k=Math.min(r,l1/2,l2/2);
 d+=' L '+(b.x-(b.x-a.x)/l1*k)+' '+(b.y-(b.y-a.y)/l1*k)+(chaflan?' L ':' Q '+b.x+' '+b.y+' ')+(b.x+(c.x-b.x)/l2*k)+' '+(b.y+(c.y-b.y)/l2*k)}const u=p[p.length-1];return d+' L '+u.x+' '+u.y}
function render(){const D=DATOS.find(d=>d.vista===vs[vcur]&&d.k===ks[cur]),T=TEMAS[ks[cur]];const esc=document.getElementById('esc');esc.replaceChildren();document.body.style.background=T.paleta.fondo;
 // Fondo de pagina: pila de Capas fija al viewport (no escala con el zoom).
 const pag=h('div',{position:'absolute',inset:0});T.pagina.forEach(L=>pag.append(capa(T,L,0,0,T.paleta.gray)));esc.append(pag);
 const capaGrupos=h('div',{position:'absolute',inset:'0'});const capaAristas=s('svg',{width:D.ancho,height:D.alto,viewBox:'0 0 '+D.ancho+' '+D.alto},[]);capaAristas.style.cssText='position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
 const capaNodos=h('div',{position:'absolute',inset:'0'});
 const defs=s('defs',{},[]);const A=T.arista;const fc=col(T,A.trazos[A.trazos.length-1].color);const mid='fin-'+ks[cur];
 defs.append(s('marker',{id:mid,viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:A.fin==='v'?9:11,markerHeight:A.fin==='v'?9:11,markerUnits:'userSpaceOnUse',orient:'auto'},[A.fin==='v'?s('path',{d:'M 1.5 1.5 L 8 5 L 1.5 8.5',fill:'none',stroke:fc,'stroke-width':1.4,'stroke-linecap':'round'}):s('path',{d:'M 0 1 L 9 5 L 0 9 z',fill:fc})]));capaAristas.append(defs);
 const cajas=[];const rec=n=>{cajas.push(n);if(n.hijos.length){capaGrupos.append(grupoHtml(T,n));n.hijos.forEach(rec)}else capaNodos.append(nodoHtml(T,n))};D.arboles.forEach(rec);
 D.aristas.forEach(a=>{if(a.puntos.length<2)return;const d=ruta(a.puntos,A.radio,A.esquina==='chaflan');const g=s('g',{},[]);
  const CO=T.paleta[a.desde]||T.paleta.gray;
  A.trazos.forEach((z,j)=>g.append(s('path',{d,fill:'none',stroke:col(T,z.color,CO),...(A.mano?{filter:'url(#mano)'}:{}),'stroke-width':z.ancho,'stroke-linecap':z.trazo==='punteado'||z.trazo==='pixel'||A.radio===0&&A.origen==='cuadrado'&&z.ancho>=4?'butt':'round','stroke-linejoin':'round',...(z.trazo?{'stroke-dasharray':z.trazo==='punteado'?'2 4':z.trazo==='pixel'?'4 4':'7 5'}:{}),...(j===A.trazos.length-1&&A.fin!=='ninguno'&&A.fin!=='via'?{'marker-end':'url(#'+mid+')'}:{})})));
  const p0=a.puntos[0];const o=A.origen;if(o==='punto')g.append(s('circle',{cx:p0.x,cy:p0.y,r:2.2,fill:col(T,'texto/0.5')}));
  if(o==='anillo')g.append(s('circle',{cx:p0.x,cy:p0.y,r:3.5,fill:col(T,'fondo'),stroke:col(T,'texto/0.7')}));
  const via=p=>{g.append(s('circle',{cx:p.x,cy:p.y,r:5,fill:col(T,A.via||'texto')}));g.append(s('circle',{cx:p.x,cy:p.y,r:2,fill:col(T,'fondo')}))};
  if(o==='via')via(p0);if(A.fin==='via')via(a.puntos[a.puntos.length-1]);
  if(o==='cuadrado')g.append(s('rect',{x:p0.x-4,y:p0.y-4,width:8,height:8,fill:col(T,'texto')}));capaAristas.append(g);
  if(debug){a.puntos.forEach((p,i)=>capaAristas.append(s('circle',{cx:p.x,cy:p.y,r:i===0||i===a.puntos.length-1?3:1.5,fill:'#ff00aa'})))}
  if(a.label){const E=A.etiqueta;const cx=a.caja?a.caja.x+a.caja.width/2:(a.puntos[0].x+a.puntos[a.puntos.length-1].x)/2,cy=a.caja?a.caja.y+a.caja.height/2:(a.puntos[0].y+a.puntos[a.puntos.length-1].y)/2;
   const css={position:'absolute',left:cx+'px',top:cy+'px',transform:'translate(-50%,-50%)'+(E.rot?' rotate('+E.rot+'deg)':''),padding:'3px 9px',fontSize:'11.5px',whiteSpace:'nowrap',background:col(T,E.relleno),border:(E.mono?1.5:1)+'px solid '+col(T,E.borde),borderRadius:E.forma.radio+'px',fontFamily:E.mono?T.mono:T.fuente,fontWeight:E.mono?700:400,fontStyle:E.italica?'italic':'normal',color:col(T,E.texto||'texto/0.8'),fontWeight:E.peso||(E.mono?700:400),fontSize:(E.size||11.5)+'px',zIndex:3};
   if(E.sombra)css.boxShadow=E.sombra.x+'px '+E.sombra.y+'px 0 '+col(T,E.sombra.color);
   capaNodos.append(h('div',css,[a.label]));if(debug&&a.caja)capaAristas.append(s('rect',{x:a.caja.x,y:a.caja.y,width:a.caja.width,height:a.caja.height,fill:'none',stroke:'#00e5ff','stroke-dasharray':'2 2'}))}});
 // Overlay de alineacion: la caja de ELK dibujada en el SVG de Aristas; debe coincidir con el Nodo HTML a cualquier zoom.
 if(debug)cajas.forEach(n=>capaAristas.append(s('rect',{x:n.caja.x,y:n.caja.y,width:n.caja.width,height:n.caja.height,fill:'none',stroke:'#ff00aa','stroke-width':1,'stroke-dasharray':'4 3'})));
 capaAristas.style.zIndex=1;capaNodos.style.zIndex=2;
 const cont=h('div',{position:'absolute',left:0,top:0,width:D.ancho+'px',height:D.alto+'px',transformOrigin:'0 0'},[capaGrupos,capaAristas,capaNodos],{id:'cont'});esc.append(cont);
 // Metricas vs HTML: el texto real cabe en la caja que reservo el layout?
 requestAnimationFrame(()=>{let malos=0;capaNodos.querySelectorAll('[data-id]').forEach(e=>{const f=e.querySelector('.fila');if(f.scrollWidth>e.clientWidth+1){malos++;if(debug)e.style.outline='2px solid red'}});
  document.getElementById('st').textContent=cajas.length+' cajas, '+D.aristas.length+' aristas, desbordes: '+malos});
 aplicar()}
let tx=40,ty=40,z=1;function aplicar(){const c=document.getElementById('cont');if(c)c.style.transform='translate('+tx+'px,'+ty+'px) scale('+z+')';document.getElementById('z').textContent=Math.round(z*100)+'%'}
function ajustar(){const D=DATOS.find(d=>d.vista===vs[vcur]&&d.k===ks[cur]);z=Math.min((innerWidth-80)/D.ancho,(innerHeight-140)/D.alto);tx=(innerWidth-D.ancho*z)/2;ty=(innerHeight-D.alto*z)/2-24;aplicar()}
function show(fit){render();document.getElementById('l').textContent=ks[cur]+' ('+TEMAS[ks[cur]].nombre+')';document.getElementById('vv').textContent='Vista: '+vs[vcur];document.getElementById('d').style.background=debug?'#ff00aa':'#eee';
 const u=new URL(location);u.searchParams.set('variant',ks[cur]);u.searchParams.set('vista',vs[vcur]);u.searchParams.set('debug',debug?'1':'0');history.replaceState(0,'',u);if(fit)ajustar()}
const go=d=>{cur=(cur+d+ks.length)%ks.length;show(true)};const gv=()=>{vcur=(vcur+1)%vs.length;show(true)};const gd=()=>{debug=!debug;show(false)};
document.getElementById('p').onclick=()=>go(-1);document.getElementById('n').onclick=()=>go(1);document.getElementById('f').onclick=ajustar;document.getElementById('vv').onclick=gv;document.getElementById('d').onclick=gd;
addEventListener('keydown',e=>{if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1);if(e.key==='v')gv();if(e.key==='d')gd()});
const vp=document.getElementById('vp');let drag=null;
vp.addEventListener('pointerdown',e=>{drag={x:e.clientX-tx,y:e.clientY-ty};vp.setPointerCapture(e.pointerId)});vp.addEventListener('pointermove',e=>{if(drag){tx=e.clientX-drag.x;ty=e.clientY-drag.y;aplicar()}});vp.addEventListener('pointerup',()=>drag=null);
vp.addEventListener('wheel',e=>{e.preventDefault();const f=Math.exp(-e.deltaY*0.0015),nz=Math.min(6,Math.max(0.15,z*f));tx=e.clientX-(e.clientX-tx)*nz/z;ty=e.clientY-(e.clientY-ty)*nz/z;z=nz;aplicar()},{passive:false});
show(true);
`;
const html = `<!doctype html><meta charset=utf-8><title>PROTOTIPO render hibrido</title>
<link rel=stylesheet href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Caveat:wght@500;700&family=Space+Mono:wght@400;700&family=JetBrains+Mono:wght@400;700&family=Outfit:wght@400;700&family=Nunito:wght@600;800&family=Inter:wght@400;500;600;800&display=swap">
<style>body{margin:0;height:100vh;overflow:hidden}#vp{position:fixed;inset:0;touch-action:none;cursor:grab;overflow:hidden}#esc{position:absolute;inset:0}
#bar{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#fff;color:#111;border-radius:999px;padding:6px 14px;font:13px system-ui;box-shadow:0 4px 24px #0008;display:flex;gap:10px;align-items:center;z-index:9;white-space:nowrap}
#bar button{border:0;background:#eee;border-radius:99px;min-width:28px;height:28px;cursor:pointer;padding:0 10px}#st{opacity:.6}</style>
<svg width=0 height=0 style="position:absolute"><filter id=mano x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type=fractalNoise baseFrequency=0.035 numOctaves=2 seed=7 /><feDisplacementMap in=SourceGraphic scale=3.5 /></filter></svg>
<div id=vp><div id=esc></div></div>
<div id=bar><button id=p>&larr;</button><span id=l></span><button id=n>&rarr;</button><button id=vv></button><button id=d>alineacion (d)</button><button id=f>ajustar</button><span id=z></span><span id=st></span></div>
<script>${cliente.replace('__DATOS__', JSON.stringify(salida)).replace('__TEMAS__', JSON.stringify(T))}</script>`;
mkdirSync('prototype-estetica/out', { recursive: true });
writeFileSync('prototype-estetica/out/hibrido.html', html);
console.log('ok hibrido.html', salida.map((s) => `${s.vista}/${s.k}:${Math.round(s.ancho)}x${Math.round(s.alto)}`).join(' '));
