import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import type { VistaDeGrafo, VistaDeSecuencia } from 'canonico';
import { compile } from 'dsl';
import { abrirSesion } from 'sesion';
import { CATALOGO, ESTADOS, estiloResuelto, resolverTema } from 'tema';
import type { TemaResuelto } from 'tema';

/** Galeria de los 14 Temas de ejemplo: un `.dg` por Tema sobre un Modelo comun. */
const RAIZ = resolve(import.meta.dirname, '../examples/themes/gallery');
/** Los 14 Temas y sus fuentes tienen una sola copia, en `examples/rinthel-arch/themes/`; la galeria los toma con `--theme-path`. */
const CARPETA_DE_TEMAS = resolve(import.meta.dirname, '../examples/rinthel-arch/themes');
const leerDg = (raiz: string): [string, string][] => readdirSync(raiz).filter((f) => f.endsWith('.dg')).map((f) => [f, readFileSync(resolve(raiz, f), 'utf8')]);
const leer = (): Record<string, string> => Object.fromEntries([...leerDg(CARPETA_DE_TEMAS), ...leerDg(RAIZ)]);

const TEMAS = [
  'soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'soft-light', 'crt-terminal', 'synthwave',
  'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art',
];

const archivos = leer();
const { canonico, issues } = compile(archivos);
/** Nodos del Modelo en orden, con los hijos de cada Grupo aplanados. */
type NodoPlano = { title: string; type: string; children: NodoPlano[] };
const aplanar = (nodos: NodoPlano[]): NodoPlano[] => nodos.flatMap((n) => [n, ...aplanar(n.children)]);
const todosLosNodos = (): NodoPlano[] => aplanar(canonico!.model.nodes as NodoPlano[]);
const errores = issues.filter((i) => i.severity === 'error');

/** Todas las Primitivas que usa un Tema (pila base, parches de Tipo y de estado, Aristas y texto). */
const primitivasDe = (t: TemaResuelto): Set<string> => {
  const usadas = new Set<string>();
  for (const c of [...t.nodo.capas, ...t.arista.capas]) usadas.add(c.primitiva.tipo);
  for (const ops of [...Object.values(t.nodo.tipos), ...Object.values(t.nodo.estados)]) for (const op of ops) if (op.primitiva !== undefined) usadas.add(op.primitiva);
  for (const p of [t.arista.origen, t.arista.fin, t.arista.etiqueta, ...Object.values(t.nodo.textos)]) if (p !== undefined) usadas.add(p.tipo);
  return usadas;
};

describe('galeria de Temas de ejemplo', () => {
  it('toda Primitiva del catalogo (sin fijar su cantidad) aparece en al menos un Tema de ejemplo', () => {
    const usadas = new Set<string>();
    const sueltos = ['shape-catalog.dg', 'code.dg'].map((f) => compile({ [f]: readFileSync(resolve(import.meta.dirname, '../examples/themes', f), 'utf8') }).canonico!);
    for (const tema of [...canonico!.themes, ...sueltos.flatMap((c) => c.themes)]) for (const p of primitivasDe(resolverTema(tema))) usadas.add(p);
    expect(Object.keys(CATALOGO).filter((p) => !usadas.has(p))).toEqual([]);
  });

  it('cada Tema vive en su propio archivo y estan los 14', () => {
    for (const nombre of TEMAS) {
      expect(archivos[`${nombre}.dg`], nombre).toBeDefined();
      expect(archivos[`${nombre}.dg`]).toMatch(new RegExp(`^theme ${nombre}\\b`, 'm'));
    }
    expect(canonico?.themes.map((t) => t.name).filter((n) => TEMAS.includes(n)).sort()).toEqual([...TEMAS].sort());
  });

  it('el Workspace valida sin errores', () => {
    expect(errores).toEqual([]);
  });

  it('hay una Vista de cobertura, una de referencia, una de secuencia y una ER por Tema', () => {
    const esperadas = [...TEMAS, ...TEMAS.map((t) => `${t}-reference`), ...TEMAS.map((t) => `${t}-sequence`), ...TEMAS.map((t) => `${t}-er`)];
    expect(canonico?.views.map((v) => v.id).sort()).toEqual(esperadas.sort());
  });

  it('las Vistas de cobertura no muestran el Modelo de referencia', () => {
    for (const tema of TEMAS) {
      const ids = resolveView(canonico!, tema)!.nodes.map((n) => n.id);
      expect(ids.filter((id) => id.startsWith('reference')), tema).toEqual([]);
    }
  });

  it.each(TEMAS)('la Vista de referencia de %s equivale a la Vista abierto del prototipo', (tema) => {
    const vista = resolveView(canonico!, `${tema}-reference`) as VistaDeGrafo;
    const abierto = (id: string) => vista.nodes.find((n) => n.id === `reference.${id}`)!;
    // Grupos abiertos con sus modulos y Grupos colapsados con contador (4 raices, 3 abiertos).
    for (const id of ['render', 'session', 'layout']) expect(abierto(id).collapsed, id).toBe(false);
    for (const [id, hijos] of [['canonical', 6], ['dsl', 4], ['shell', 4], ['cli', 5]] as const) {
      expect(abierto(id).collapsed, id).toBe(true);
      expect(abierto(id).childCount, id).toBe(hijos);
    }
    expect(vista.nodes.map((n) => n.id)).not.toContain('reference');
    expect(vista.nodes).toHaveLength(22);
    expect(vista.edges).toHaveLength(36);
    expect(vista.edges.some((a) => a.label === 'memoizes per View')).toBe(true);
  });

  it.each(TEMAS)('%s tiene Vistas de secuencia (con Fragmento y Nota) y ER (con tres tablas) con su Tema', (tema) => {
    const secuencia = resolveView(canonico!, `${tema}-sequence`) as VistaDeSecuencia;
    expect(secuencia.type).toBe('sequence');
    expect(secuencia.nodes.map((n) => n.id).sort()).toEqual(['client', 'gateway', 'platform.events', 'platform.orders', 'platform.payments', 'provider']);
    expect(secuencia.interaction.items.map((i) => i.type)).toEqual(expect.arrayContaining(['fragment', 'note']));
    const er = resolveView(canonico!, `${tema}-er`) as VistaDeGrafo;
    expect(er.type).toBe('er');
    expect(er.nodes.map((n) => n.id).sort()).toEqual(['data.customers', 'data.lines', 'data.orders-table']);
    expect(er.edges).toHaveLength(2);
    expect(canonico!.views.find((v) => v.id === `${tema}-er`)?.theme).toBe(tema);
  });

  it('el Modelo cubre Grupo abierto y colapsado, Aristas con y sin etiqueta y un Nodo por estado', () => {
    const texto = Object.values(archivos).join('\n');
    expect(texto).toMatch(/\bexpanded\b/);
    expect(texto).toMatch(/\bcollapsed\b/);
    const aristas = canonico!.model.edges;
    expect(aristas.some((a) => a.label !== undefined && a.label !== '')).toBe(true);
    expect(aristas.some((a) => a.label === undefined || a.label === '')).toBe(true);
    const titulos = todosLosNodos().map((n) => n.title.toLowerCase());
    for (const estado of ESTADOS) expect(titulos, estado).toContain(estado);
  });

  it('el Modelo usa todos los Tipos de nodo declarados', () => {
    const usados = new Set(todosLosNodos().map((n) => n.type));
    for (const tipo of canonico!.specification.nodeTypes) expect(usados.has(tipo.name), tipo.name).toBe(true);
  });

  it('entre todos cubren las Familias del catalogo', () => {
    const usadas = new Set<string>();
    for (const tema of canonico!.themes.filter((t) => TEMAS.includes(t.name))) for (const p of primitivasDe(resolverTema(tema))) usadas.add(CATALOGO[p as keyof typeof CATALOGO].familia);
    const todas = new Set(Object.values(CATALOGO).map((d) => d.familia as string).filter((f) => f !== 'codigo'));
    expect([...todas].filter((f) => !usadas.has(f))).toEqual([]);
  });

  it.each(TEMAS)('%s resuelve su Estilo de forma determinista', (nombre) => {
    const tema = canonico!.themes.find((t) => t.name === nombre)!;
    const otro = compile(leer()).canonico!.themes.find((t) => t.name === nombre)!;
    expect(JSON.stringify(estiloResuelto(tema, { diagrama: 'architecture' }))).toBe(JSON.stringify(estiloResuelto(otro, { diagrama: 'architecture' })));
  });

  it('los warnings de cada ejemplo son exactamente los declarados en su cabecera, y no hay otros', async () => {
    const warnings = (await abrirSesion(archivos).diagnosticar()).filter((i) => i.severity === 'warning');
    const vistasDe = (nombre: string) => ['', '-reference', '-sequence', '-er'].map((sufijo) => `In View '${nombre}${sufijo}'`);
    const deTema = (nombre: string) => warnings.filter((i) => i.message.startsWith(`Theme '${nombre}'`) || vistasDe(nombre).some((v) => i.message.startsWith(v)));
    const lista = (nombre: string, linea: string): string[] => {
      const valor = new RegExp(`^// ${linea}:\\s*(.+)$`, 'm').exec(archivos[`${nombre}.dg`]!)?.[1]?.replace(/\.$/, '').trim();
      return valor === undefined || valor === 'none' ? [] : valor.split(',').map((t) => t.trim()).sort();
    };
    for (const nombre of TEMAS) {
      expect(archivos[`${nombre}.dg`], `${nombre}: missing the "// Contrast: ..." line at the top`).toMatch(/^\/\/ Contrast:/);
      const contraste = deTema(nombre).filter((i) => i.code === 'theme-low-contrast');
      const reales = [...new Set(contraste.map((i) => /of kind '([^']+)'/.exec(i.message)![1]!))].sort();
      expect(reales, nombre).toEqual(lista(nombre, 'Contrast'));
      // `// Solo color: a/b, ...` declara los pares de Tipos que el Tema distingue solo por color (como el prototipo).
      const soloColor = deTema(nombre).filter((i) => i.code === 'theme-color-only').map((i) => /kinds '([^']+)' and '([^']+)'/.exec(i.message)!.slice(1).join('/'));
      expect([...new Set(soloColor)].sort(), nombre).toEqual(lista(nombre, 'Color only'));
      // Cualquier otro warning del Tema no esta declarado en la cabecera: es un defecto del ejemplo.
      expect(deTema(nombre).filter((i) => i.code !== 'theme-low-contrast' && i.code !== 'theme-color-only').map((i) => `${i.code}: ${i.message}`), nombre).toEqual([]);
    }
    expect(warnings.filter((i) => !TEMAS.some((n) => i.message.startsWith(`Theme '${n}'`) || vistasDe(n).some((v) => i.message.startsWith(v)))).map((i) => `${i.code}: ${i.message}`), 'warnings sin Tema').toEqual([]);
  });

  it('las fuentes incluidas son archivos OFL del Workspace, cada familia con su licencia, sin CDN', () => {
    const fuentes = readdirSync(resolve(CARPETA_DE_TEMAS, 'fonts'));
    const familias = new Set(fuentes.filter((f) => f.endsWith('.woff2')).map((f) => f.replace(/-latin-\d{3}-(?:normal|italic)\.woff2$/, '')));
    expect([...familias].sort()).toEqual(['caveat', 'gelasio', 'inter', 'jetbrains-mono', 'nunito', 'outfit', 'press-start-2p', 'space-mono']);
    for (const familia of familias) expect(fuentes, familia).toContain(`OFL-${familia}.txt`);
    for (const texto of Object.values(archivos)) expect(texto).not.toMatch(/https?:\/\//);
  });

  it('toda fuente que declara un Tema de la galeria tiene archivo en el Workspace', async () => {
    const archivosDeFuente = readdirSync(resolve(CARPETA_DE_TEMAS, 'fonts')).map((f) => `fonts/${f}`);
    const faltantes = (await abrirSesion(archivos, { archivosDeFuente }).diagnosticar()).filter((i) => i.code === 'theme-font-missing');
    expect(faltantes.map((i) => i.message)).toEqual([]);
  });
});
