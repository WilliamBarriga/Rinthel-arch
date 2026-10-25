import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  for (const paso of [1, 2, 3, 4, 5]) {
    it(`el paso ${paso} valida sin errores ni avisos y trae la Vista principal`, () => {
      const { canonico, issues } = compile(leerDg(`examples/tutorial/paso-${paso}`));
      expect(issues).toEqual([]);
      expect(canonico?.views.map((v) => v.id)).toContain('principal');
    });
  }
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

  it('los archivos de Tema son los mismos de la galeria', () => {
    for (const t of TEMAS) {
      expect(archivos[`temas/${t}.dg`], t).toBe(readFileSync(resolve(RAIZ, `examples/temas/galeria/${t}.dg`), 'utf8'));
    }
  });
});

describe('documentacion publica', () => {
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
