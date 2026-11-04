import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { SECCIONES_README, revisarIndiceDeAdrs, revisarReadmes } from '../scripts/check-docs';

const raizDelRepo = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const temporales: string[] = [];

afterAll(() => {
  for (const carpeta of temporales) {
    rmSync(carpeta, { force: true, recursive: true });
  }
});

/** Repo temporal con los archivos dados (ruta relativa -> contenido). Lo reutilizan los chequeos de indices. */
function crearRepo(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'check-docs-'));
  temporales.push(raiz);
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const destino = join(raiz, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  }
  return raiz;
}

/** README que cumple la plantilla; `sin` quita secciones y `entrada` cambia el archivo de entrada. */
function readmeValido(nombre: string, opciones: { sin?: string[]; entrada?: string } = {}): string {
  const entrada = opciones.entrada ?? `packages/${nombre}/src/index.ts`;
  const cuerpos: Record<string, string> = {
    'Que hace': 'Hace algo.',
    'Que NO hace': 'No hace otra cosa.',
    'Depende de': 'Nada.',
    'Archivo de entrada': `\`${entrada}\``,
    'ADR relacionado': '`docs/adr/0001-x.md`',
    Probar: `\`pnpm --filter ${nombre} test\``,
  };
  const secciones = SECCIONES_README.filter((s) => !opciones.sin?.includes(s))
    .map((s) => `## ${s}\n\n${cuerpos[s]}\n`)
    .join('\n');
  return `# ${nombre}\n\nResumen.\n\n${secciones}`;
}

function repoConPaquete(readme?: string): Record<string, string> {
  return {
    'packages/canonico/src/index.ts': 'export const a = 1;\n',
    ...(readme === undefined ? {} : { 'packages/canonico/README.md': readme }),
  };
}

describe('revisarReadmes', () => {
  it('fija la plantilla de secciones', () => {
    expect(SECCIONES_README).toEqual([
      'Que hace',
      'Que NO hace',
      'Depende de',
      'Archivo de entrada',
      'ADR relacionado',
      'Probar',
    ]);
  });

  it('acepta un README que cumple la plantilla', () => {
    const raiz = crearRepo(repoConPaquete(readmeValido('canonico')));

    expect(revisarReadmes(raiz)).toEqual([]);
  });

  it('no exige que todos los paquetes tengan README', () => {
    const raiz = crearRepo(repoConPaquete());

    expect(revisarReadmes(raiz)).toEqual([]);
  });

  it('falla si un README pierde una seccion', () => {
    const raiz = crearRepo(repoConPaquete(readmeValido('canonico', { sin: ['Que NO hace'] })));

    expect(revisarReadmes(raiz)).toContainEqual(
      expect.objectContaining({ archivo: 'packages/canonico/README.md', regla: 'seccion' }),
    );
  });

  it('falla si el archivo de entrada nombrado no existe', () => {
    const raiz = crearRepo(
      repoConPaquete(readmeValido('canonico', { entrada: 'packages/canonico/src/falta.ts' })),
    );

    expect(revisarReadmes(raiz)).toContainEqual(
      expect.objectContaining({ archivo: 'packages/canonico/README.md', regla: 'entrada' }),
    );
  });

  it('falla si la seccion de entrada no nombra ningun archivo', () => {
    const readme = readmeValido('canonico').replace(/`packages\/canonico\/src\/index\.ts`/, 'el index');
    const raiz = crearRepo(repoConPaquete(readme));

    expect(revisarReadmes(raiz)).toContainEqual(expect.objectContaining({ regla: 'entrada' }));
  });

  it('falla si la seccion Probar no da el comando del paquete', () => {
    const readme = readmeValido('canonico').replace('pnpm --filter canonico test', 'pnpm test');
    const raiz = crearRepo(repoConPaquete(readme));

    expect(revisarReadmes(raiz)).toContainEqual(expect.objectContaining({ regla: 'probar' }));
  });

  it('los READMEs de este repo cumplen la plantilla', () => {
    expect(revisarReadmes(raizDelRepo)).toEqual([]);
  });
});

describe('revisarIndiceDeAdrs', () => {
  const indice = '# ADRs\n\n- `0001-uno.md`: vigente.\n- `0002-dos.md`: vigente.\n';

  it('acepta un indice que lista todos los ADRs', () => {
    const raiz = crearRepo({
      'docs/adr/README.md': indice,
      'docs/adr/0001-uno.md': '# Uno\n',
      'docs/adr/0002-dos.md': '# Dos\n',
    });

    expect(revisarIndiceDeAdrs(raiz)).toEqual([]);
  });

  it('falla si un ADR no aparece en el indice', () => {
    const raiz = crearRepo({
      'docs/adr/README.md': indice,
      'docs/adr/0001-uno.md': '# Uno\n',
      'docs/adr/0002-dos.md': '# Dos\n',
      'docs/adr/0003-tres.md': '# Tres\n',
    });

    expect(revisarIndiceDeAdrs(raiz)).toContainEqual(
      expect.objectContaining({ archivo: 'docs/adr/0003-tres.md', regla: 'indice' }),
    );
  });

  it('falla si hay ADRs y falta el indice', () => {
    const raiz = crearRepo({ 'docs/adr/0001-uno.md': '# Uno\n' });

    expect(revisarIndiceDeAdrs(raiz)).toContainEqual(expect.objectContaining({ regla: 'indice' }));
  });

  it('el indice de este repo lista todos los ADRs', () => {
    expect(revisarIndiceDeAdrs(raizDelRepo)).toEqual([]);
  });
});
