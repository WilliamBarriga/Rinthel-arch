import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
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
  'soft-card', 'glass-chip', 'neobrutalist', 'blueprint', 'claro-suave', 'crt-terminal', 'synthwave',
  'editorial', 'bauhaus', 'sticky-notes', 'keycaps', 'metro-map', 'pcb', 'pixel-art',
];

describe('tutorial (examples/tutorial)', () => {
  for (const paso of [1, 2, 3, 4, 5, 6]) {
    it(`el paso ${paso} valida sin errores ni avisos y trae la Vista principal`, () => {
      const { canonico, issues } = compile(leerDg(`examples/tutorial/paso-${paso}`));
      expect(issues).toEqual([]);
      expect(canonico?.views.map((v) => v.id)).toContain('principal');
    });
  }
});

describe('tutorial paso 6: secuencia y ER', () => {
  it('trae una Vista sequence y una er sobre el mismo Modelo', () => {
    const { canonico } = compile(leerDg('examples/tutorial/paso-6'));
    expect(resolveView(canonico!, 'comprar-secuencia')?.type).toBe('sequence');
    expect(resolveView(canonico!, 'tablas')?.type).toBe('er');
  });
});

describe('mapa de rinthel-arch con los 14 Temas', () => {
  const archivos = leerDg('examples/rinthel-arch');
  const { canonico, issues } = compile(archivos);

  it('valida sin errores', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('tiene una Vista `abierto-<tema>` por Tema aprobado', () => {
    const ids = canonico!.views.map((v) => v.id);
    for (const t of TEMAS) expect(ids, t).toContain(`abierto-${t}`);
  });
});

describe('mapa de rinthel-arch: secuencia y ER', () => {
  const { canonico, issues } = compile(leerDg('examples/rinthel-arch'));

  it('la Vista ER de la Fuente canonica proyecta sus tablas y Aristas', () => {
    const er = resolveView(canonico!, 'fuente-er')!;
    expect(er.type).toBe('er');
    expect(er.nodes).toHaveLength(7);
    expect(er.edges.length).toBeGreaterThanOrEqual(8);
    expect(er.steps).toHaveLength(3);
  });

  it('la Interaccion editar-pin tiene Fragmento, ref, Pasos y link a arquitectura', () => {
    const vista = resolveView(canonico!, 'editar-pin')!;
    expect(vista.type).toBe('sequence');
    const fragmento = vista.interaction!.items.find((i) => i.type === 'fragment') as unknown as { operands: Array<{ items: Array<{ type: string }> }> };
    expect(fragmento.operands[0]!.items.map((i) => i.type)).toContain('ref');
    expect(vista.steps).toHaveLength(2);
    expect(canonico!.views.find((v) => v.id === 'editar-pin')!.links?.map((l) => l.view)).toEqual(['sesion-detalle', 'shell-detalle']);
    expect(canonico!.views.map((v) => v.id)).toContain('recompilar');
  });

  it('no agrega issues propios (solo los avisos deliberados de los Temas)', () => {
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.filter((i) => !i.code.startsWith('W_THEME_'))).toEqual([]);
  });
});

/** Bloques ```dg de las guias: cada uno es un Workspace completo de un archivo y debe compilar sin errores. */
describe('bloques .dg de las guias', () => {
  const GUIAS = ['docs/guia/referencia-dsl.md', 'docs/guia/personalizar-temas.md', 'docs/guia/tutorial.md', 'docs/guia/inicio-rapido.md', 'README.md'];
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
    const readme = readFileSync(resolve(RAIZ, 'README.md'), 'utf8');
    for (const tipo of ['architecture', 'flow', 'sequence', 'er']) expect(readme, tipo).toContain(`\`${tipo}\``);
    for (const img of ['tipos/secuencia-tienda.png', 'tipos/er-tienda.png']) expect(readme).toContain(`docs/img/${img}`);
  });
});

describe('documentacion publica', () => {
  it('hay capturas de secuencia y ER (tutorial paso 6 y README)', () => {
    for (const f of ['tutorial/paso-6-secuencia-tienda.png', 'tutorial/paso-6-er-tienda.png', 'tipos/secuencia-tienda.png', 'tipos/er-tienda.png']) {
      expect(existsSync(resolve(RAIZ, 'docs/img', f)), f).toBe(true);
    }
  });

  it('hay una captura por Tema y por paso del tutorial', () => {
    for (const t of TEMAS) expect(existsSync(resolve(RAIZ, `docs/img/temas/${t}.png`)), t).toBe(true);
    const pasos = readdirSync(resolve(RAIZ, 'docs/img/tutorial'));
    for (const n of [1, 2, 3, 4, 5]) expect(pasos.some((f) => f.startsWith(`paso-${n}-`)), `paso ${n}`).toBe(true);
  });

  it('los enlaces relativos de README, guias y CONTRIBUTING apuntan a archivos que existen', () => {
    const docs = ['README.md', 'CONTRIBUTING.md', ...readdirSync(resolve(RAIZ, 'docs/guia')).map((f) => `docs/guia/${f}`)];
    for (const doc of docs) {
      const texto = readFileSync(resolve(RAIZ, doc), 'utf8');
      for (const [, destino] of texto.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/.test(destino!)) continue;
        expect(existsSync(resolve(RAIZ, dirname(doc), destino!)), `${doc} -> ${destino}`).toBe(true);
      }
    }
  });
});
