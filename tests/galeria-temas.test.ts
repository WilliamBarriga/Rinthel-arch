import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import { compile } from 'dsl';
import { abrirSesion } from 'sesion';
import { CATALOGO, ESTADOS, estiloResuelto, resolverTema } from 'tema';
import type { TemaResuelto } from 'tema';

/** Galeria de los 14 Temas de ejemplo (ADR 0008): un `.dg` por Tema sobre un Modelo comun. */
const RAIZ = resolve(import.meta.dirname, '../examples/temas/galeria');
const leer = (): Record<string, string> =>
  Object.fromEntries(readdirSync(RAIZ).filter((f) => f.endsWith('.dg')).map((f) => [f, readFileSync(resolve(RAIZ, f), 'utf8')]));

const TEMAS = [
  'soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'claro-suave', 'crt-terminal', 'synthwave',
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

  it('hay una Vista de cobertura y una Vista de referencia por Tema', () => {
    const esperadas = [...TEMAS, ...TEMAS.map((t) => `${t}-referencia`)];
    expect(canonico?.views.map((v) => v.id).sort()).toEqual(esperadas.sort());
  });

  it('las Vistas de cobertura no muestran el Modelo de referencia', () => {
    for (const tema of TEMAS) {
      const ids = resolveView(canonico!, tema)!.nodes.map((n) => n.id);
      expect(ids.filter((id) => id.startsWith('referencia')), tema).toEqual([]);
    }
  });

  it.each(TEMAS)('la Vista de referencia de %s equivale a la Vista abierto del prototipo', (tema) => {
    const vista = resolveView(canonico!, `${tema}-referencia`)!;
    const abierto = (id: string) => vista.nodes.find((n) => n.id === `referencia.${id}`)!;
    // Grupos abiertos con sus modulos y Grupos colapsados con contador (4 raices, 3 abiertos).
    for (const id of ['render', 'sesion', 'layout']) expect(abierto(id).collapsed, id).toBe(false);
    for (const [id, hijos] of [['canonico', 6], ['dsl', 4], ['shell', 4], ['cli', 5]] as const) {
      expect(abierto(id).collapsed, id).toBe(true);
      expect(abierto(id).childCount, id).toBe(hijos);
    }
    expect(vista.nodes.map((n) => n.id)).not.toContain('referencia');
    expect(vista.nodes).toHaveLength(22);
    expect(vista.edges).toHaveLength(36);
    expect(vista.edges.some((a) => a.label === 'memoiza por Vista')).toBe(true);
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
    expect(JSON.stringify(estiloResuelto(tema))).toBe(JSON.stringify(estiloResuelto(otro)));
  });

  it('los warnings de cada ejemplo son exactamente los declarados en su cabecera, y no hay otros', async () => {
    const warnings = (await abrirSesion(archivos).diagnosticar()).filter((i) => i.severity === 'warning');
    const deTema = (nombre: string) => warnings.filter((i) => i.message.startsWith(`Tema '${nombre}'`) || i.message.startsWith(`En la Vista '${nombre}'`));
    for (const nombre of TEMAS) {
      const cabecera = /^\/\/ Contraste:\s*(.+)$/m.exec(archivos[`${nombre}.dg`]!)?.[1]?.replace(/\.$/, '').trim();
      expect(cabecera, `${nombre}: falta la linea "// Contraste: ..." al inicio`).toBeDefined();
      const listados = cabecera === 'ninguno' ? [] : cabecera!.split(',').map((t) => t.trim()).sort();
      const contraste = deTema(nombre).filter((i) => i.code === 'W_THEME_LOW_CONTRAST');
      const reales = [...new Set(contraste.map((i) => /Tipo '([^']+)'/.exec(i.message)![1]!))].sort();
      expect(reales, nombre).toEqual(listados);
      // Cualquier otro warning del Tema (p. ej. W_THEME_COLOR_ONLY) no esta declarado en la cabecera: es un defecto del ejemplo.
      expect(deTema(nombre).filter((i) => i.code !== 'W_THEME_LOW_CONTRAST').map((i) => `${i.code}: ${i.message}`), nombre).toEqual([]);
    }
    expect(warnings.filter((i) => !TEMAS.some((n) => i.message.startsWith(`Tema '${n}'`) || i.message.startsWith(`En la Vista '${n}'`))).map((i) => `${i.code}: ${i.message}`), 'warnings sin Tema').toEqual([]);
  });

  it('las fuentes incluidas son archivos OFL del Workspace, sin CDN', () => {
    const fuentes = readdirSync(resolve(RAIZ, 'fuentes'));
    expect(fuentes.some((f) => /\.woff2$/.test(f))).toBe(true);
    expect(fuentes.some((f) => /^LICENCIA/.test(f))).toBe(true);
    for (const texto of Object.values(archivos)) expect(texto).not.toMatch(/https?:\/\//);
  });
});
