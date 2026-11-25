import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { salidaDeValidateSchema } from 'canonico';
import { run } from 'cli';

const BASE = (tema: string, vista = ''): string => `specification {
  node servicio
}

model {
  servicio api "API"
}

view general {
  type architecture
  include **
${vista}}

${tema}
`;

async function validar(raiz: string) {
  const r = await run(['validate', '--workspace', raiz, '--json']);
  return { ...r, salida: salidaDeValidateSchema.parse(JSON.parse(r.stdout)) };
}

function workspace(contenido: string): string {
  const raiz = mkdtempSync(join(tmpdir(), 'validate-old-values-'));
  writeFileSync(join(raiz, 'main.dg'), contenido);
  return raiz;
}

const TEMA = (cuerpo: string, dentro = ''): string => `theme t {\n  palette { tinta "#1f2937" }\n  node {\n    layer forma rect { radius 4 }\n${cuerpo}${dentro}  }\n}`;
const USA_T = '  theme t\n';

/** Old catalog value -> the English one, per category; each snippet is a minimal Workspace using the old value. */
const CASOS: ReadonlyArray<{ categoria: string; viejo: string; nuevo: string; fuente: string; reemplazo?: string }> = [
  { categoria: 'motion', viejo: 'flujo', nuevo: 'stream', fuente: BASE(TEMA('    layer borde border { color tinta  motion flujo 2s }\n'), USA_T) },
  { categoria: 'motion', viejo: 'respiracion', nuevo: 'breathe', fuente: BASE(TEMA('    layer borde border { color tinta  motion respiracion 3s }\n'), USA_T) },
  { categoria: 'effect', viejo: 'deslizar', nuevo: 'slide', fuente: BASE(TEMA('', '  enter deslizar 300ms\n'), USA_T) },
  { categoria: 'effect', viejo: 'escala', nuevo: 'zoom', fuente: BASE(TEMA('', '  exit escala 200ms\n'), USA_T) },
  { categoria: 'state', viejo: 'seleccionado', nuevo: 'selected', fuente: BASE(TEMA('    state seleccionado { layer forma { radius 8 } }\n'), USA_T) },
  { categoria: 'state', viejo: 'en-ruta', nuevo: 'on-path', fuente: BASE(TEMA('    state en-ruta { layer forma { radius 8 } }\n'), USA_T) },
  { categoria: 'theme', viejo: 'alto-contraste', nuevo: 'high-contrast', fuente: BASE('', '  theme alto-contraste\n') },
  { categoria: 'theme', viejo: 'alto-contraste', nuevo: 'high-contrast', fuente: BASE('theme t extends alto-contraste { }', USA_T) },
  { categoria: 'layer', viejo: 'borde', nuevo: 'border', fuente: BASE('theme t extends neutral { node { state hover { layer borde { width 2 } } } }', USA_T) },
  { categoria: 'layer', viejo: 'forma', nuevo: 'shape', fuente: BASE('theme t extends neutral { node { layer marca solid after forma { color blue } } }', USA_T) },
  { categoria: 'palette', viejo: 'tinta', nuevo: 'ink', reemplazo: 'ink/0.5', fuente: BASE('theme t extends neutral { node { layer fill { color tinta/0.5 } } }', USA_T) },
  { categoria: 'palette', viejo: 'tinta', nuevo: 'ink', reemplazo: 'mix(ink,paper,0.5)', fuente: BASE('theme t extends neutral { node { layer fill { color mix(tinta, papel, 0.5) } } }', USA_T) },
  { categoria: 'color', viejo: 'ORIGEN', nuevo: 'ORIGIN', fuente: BASE('theme t extends neutral { edge { layer line { color ORIGEN } } }', USA_T) },
];

describe('validate: old catalog values', () => {
  it.each(CASOS)('$categoria: `$viejo` is an old-catalog-value error whose fix rewrites it to `$nuevo`, and the Workspace ends clean', async ({ viejo, nuevo, fuente, reemplazo }) => {
    const raiz = workspace(fuente);
    const { exitCode, salida } = await validar(raiz);

    expect(exitCode).toBe(1);
    const issue = salida.issues.find((i) => i.code === 'old-catalog-value');
    expect(issue, JSON.stringify(salida.issues)).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain(`'${viejo}'`);
    expect(issue?.message).toContain(`'${nuevo}'`);
    expect(issue?.fix?.replacement).toBe(reemplazo ?? nuevo);
    expect(salida.issues.filter((i) => i.code === 'old-catalog-value')).toHaveLength(1);

    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify([issue?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(raiz, 'main.dg'), 'utf8')).toContain(nuevo);
    expect((await validar(raiz)).salida.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a user Theme that declares its own `fondo` color and `borde` Layer is untouched', async () => {
    const raiz = workspace(BASE('theme t { palette { fondo "#ffffff" }  node { layer borde border { color fondo } }  edge { layer linea line { color fondo } } }', USA_T));
    expect((await validar(raiz)).salida.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('the new names validate clean', async () => {
    const raiz = workspace(BASE(TEMA('    layer borde border { color tinta  motion stream 2s }\n    state on-path { layer forma { radius 8 } }\n', '  enter zoom 300ms\n'), USA_T));
    expect((await validar(raiz)).salida.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
