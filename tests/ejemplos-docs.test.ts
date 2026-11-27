import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import type { Node, GraphView, SequenceView } from 'canonical';
import { compile } from 'dsl';

/** Lo que la documentacion publica promete: el tutorial valida, el mapa trae los 14 Temas, las capturas y los enlaces existen. */
const RAIZ = resolve(import.meta.dirname, '..');
const leerDg = (dir: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(resolve(RAIZ, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.dg'))
      .map((e) => [resolve(e.parentPath, e.name).slice(resolve(RAIZ, dir).length + 1), readFileSync(resolve(e.parentPath, e.name), 'utf8')]),
  );

const TEMAS = [
  'soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'soft-light', 'crt-terminal', 'synthwave',
  'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art',
];

describe('tutorial (examples/tutorial)', () => {
  for (const paso of [1, 2, 3, 4, 5, 6]) {
    it(`el paso ${paso} valida sin errores ni avisos y trae la Vista principal`, () => {
      const { canonical: canonico, issues } = compile(leerDg(`examples/tutorial/step-${paso}`));
      expect(issues).toEqual([]);
      expect(canonico?.views.map((v) => v.id)).toContain('main');
    });
  }
});

describe('tutorial paso 6: secuencia y ER', () => {
  it('trae una Vista sequence y una er sobre el mismo Modelo', () => {
    const { canonical: canonico } = compile(leerDg('examples/tutorial/step-6'));
    expect(resolveView(canonico!, 'purchase-sequence')?.type).toBe('sequence');
    expect(resolveView(canonico!, 'tables')?.type).toBe('er');
  });
});

describe('mapa de rinthel-arch con los 14 Temas', () => {
  const archivos = leerDg('examples/rinthel-arch');
  const { canonical: canonico, issues } = compile(archivos);

  it('valida sin errores', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('tiene una Vista `open-<tema>` por Tema aprobado', () => {
    const ids = canonico!.views.map((v) => v.id);
    for (const t of TEMAS) expect(ids, t).toContain(`open-${t}`);
  });
});

describe('rinthel-arch map: regenerated from scan (the live demo)', () => {
  const { canonical: canonico, issues } = compile(leerDg('examples/rinthel-arch'));
  const vistas = canonico!.views;
  const todos = (nodos: Node[]): Node[] => nodos.flatMap((n) => [n, ...todos(n.children)]);

  it('every Node of the repo Group cites a scan unit as a Source path ref', () => {
    const repo = canonico!.model.nodes.find((n) => n.id === 'repo')!;
    expect(repo.source.map((s) => s.ref)).toEqual(['.']);
    const delRepo = todos(repo.children);
    expect(delRepo.length).toBeGreaterThanOrEqual(10);
    for (const n of delRepo) expect(n.source.some((s) => s.kind === 'path'), n.id).toBe(true);
  });

  it('opens on an architecture context View with Drill-down into existing Views', () => {
    const contexto = vistas.find((v) => v.id === 'context')!;
    expect(contexto.type).toBe('architecture');
    expect(contexto.links?.length).toBeGreaterThanOrEqual(2);
    for (const l of contexto.links ?? []) expect(vistas.map((v) => v.id)).toContain(l.view);
  });

  it('has a flow View with Steps, an er View over the scanned tables and a sequence View', () => {
    const flujo = vistas.find((v) => v.type === 'flow' && (resolveView(canonico!, v.id) as GraphView).steps.length >= 3);
    expect(flujo).toBeDefined();
    const er = resolveView(canonico!, 'tables') as GraphView;
    expect(er.type).toBe('er');
    expect(er.nodes).toHaveLength(3);
    expect(er.edges).toHaveLength(2);
    const secuencia = resolveView(canonico!, 'export-sequence') as SequenceView;
    expect(secuencia.type).toBe('sequence');
    expect(secuencia.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('no agrega issues propios (solo los avisos deliberados de los Temas)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.filter((i) => !(i.severity === 'warning' && i.code.startsWith('theme-')))).toEqual([]);
  });
});

/** Bloques ```dg de las guias: cada uno es un Workspace completo de un archivo y debe compilar sin errores. */
describe('bloques .dg de las guias', () => {
  const GUIAS = ['docs/guide/dsl-reference.md', 'docs/guide/themes.md', 'docs/guide/tutorial.md', 'docs/guide/quick-start.md', 'docs/guia/dsl-reference.md', 'docs/guia/themes.md', 'docs/guia/tutorial.md', 'docs/guia/quick-start.md', 'README.md', 'README.es.md'];
  const bloques = GUIAS.flatMap((guia) =>
    [...readFileSync(resolve(RAIZ, guia), 'utf8').matchAll(/```dg\n([\s\S]*?)```/g)].map(([, texto], i) => ({ nombre: `${guia}#${i + 1}`, texto: texto! })),
  );

  it('cada guia con DSL de secuencia, ER o Temas trae ejemplos completos', () => {
    for (const guia of GUIAS.slice(0, 3)) expect(bloques.filter((b) => b.nombre.startsWith(guia)).length, guia).toBeGreaterThanOrEqual(2);
  });

  for (const bloque of bloques) {
    it(`${bloque.nombre} compila sin errores`, () => {
      const { issues } = compile({ 'main.dg': bloque.texto });
      expect(issues.filter((i) => i.severity === 'error'), bloque.texto).toEqual([]);
    });
  }

  it('el README presenta los cuatro Tipos de diagrama con captura', () => {
    for (const path of ['README.md', 'README.es.md']) {
      const readme = readFileSync(resolve(RAIZ, path), 'utf8');
      for (const tipo of ['architecture', 'flow', 'sequence', 'er']) expect(readme, `${path} ${tipo}`).toContain(`\`${tipo}\``);
      for (const img of ['tipos/sequence-shop.png', 'tipos/er-shop.png']) expect(readme, path).toContain(`docs/img/${img}`);
    }
  });
});

describe('README pair', () => {
  const en = readFileSync(resolve(RAIZ, 'README.md'), 'utf8');
  const es = readFileSync(resolve(RAIZ, 'README.es.md'), 'utf8');
  const firstLink = (text: string) => /\]\(([^)]+)\)/.exec(text.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)|!\[[^\]]*\]\([^)]*\)/g, ''))?.[1];
  const headings = (text: string) => text.split('\n').filter((l) => l.startsWith('## ')).length;
  const sections = (text: string) => text.split(/^## /m);

  it('README.md is English, opens with the tagline and links the Spanish version and the Live demo first', () => {
    expect(existsSync(resolve(RAIZ, 'README.en.md'))).toBe(false);
    expect(en).toContain('**Architecture diagrams of your repo that your coding agent can read, write and keep up to date.**');
    expect(en).toContain('One text model, many views (architecture, flow, sequence, ER), with themes and step-by-step animation ready for talks and video.');
    expect(firstLink(en)).toBe('README.es.md');
    expect(firstLink(es)).toBe('README.md');
    for (const text of [en, es]) expect(text).toContain('https://williambarriga.github.io/Rinthel-arch/');
  });

  it('both READMEs share the section order and mention LikeC4 only in the License section', () => {
    expect(headings(es)).toBe(headings(en));
    expect(en.split('\n').filter((l) => l.startsWith('## '))).toEqual(['## Quick start', '## Why', '## What you get', '## Themes', '## The DSL at a glance', '## Docs', '## Status', '## Contributing', '## License']);
    for (const text of [en, es]) {
      const withLikeC4 = sections(text).filter((s) => /likec4/i.test(s));
      expect(withLikeC4.map((s) => s.split('\n')[0])).toEqual([text === en ? 'License' : 'Licencia']);
      expect(text).toContain('npx rinthel-arch dev');
      expect(text).toContain('docs/gallery.md');
    }
  });
});

describe('documentacion publica', () => {
  it('hay capturas de secuencia y ER (tutorial paso 6 y README)', () => {
    for (const f of ['tutorial/step-6-sequence-shop.png', 'tutorial/step-6-er-shop.png', 'tipos/sequence-shop.png', 'tipos/er-shop.png']) {
      expect(existsSync(resolve(RAIZ, 'docs/img', f)), f).toBe(true);
    }
  });

  it('hay una captura por Tema y por paso del tutorial', () => {
    for (const t of TEMAS) expect(existsSync(resolve(RAIZ, `docs/img/temas/${t}.png`)), t).toBe(true);
    const pasos = readdirSync(resolve(RAIZ, 'docs/img/tutorial'));
    for (const n of [1, 2, 3, 4, 5]) expect(pasos.some((f) => f.startsWith(`step-${n}-`)), `paso ${n}`).toBe(true);
  });

  it('los enlaces relativos de README, guias y CONTRIBUTING apuntan a archivos que existen', () => {
    const guias = ['docs/guide', 'docs/guia'].flatMap((dir) => readdirSync(resolve(RAIZ, dir)).map((f) => `${dir}/${f}`));
    const docs = ['README.md', 'README.es.md', 'CONTRIBUTING.md', 'docs/gallery.md', ...guias];
    for (const doc of docs) {
      const texto = readFileSync(resolve(RAIZ, doc), 'utf8');
      for (const [, destino] of texto.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/.test(destino!)) continue;
        expect(existsSync(resolve(RAIZ, dirname(doc), destino!)), `${doc} -> ${destino}`).toBe(true);
      }
    }
  });
});
