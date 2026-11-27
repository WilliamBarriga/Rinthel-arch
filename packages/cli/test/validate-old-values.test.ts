import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateOutputSchema } from 'canonical';
import { run } from 'cli';

const BASE = (theme: string, view = ''): string => `specification {
  node servicio
}

model {
  servicio api "API"
}

view general {
  type architecture
  include **
${view}}

${theme}
`;

async function validateCommand(root: string) {
  const r = await run(['validate', '--workspace', root, '--json']);
  return { ...r, output: validateOutputSchema.parse(JSON.parse(r.stdout)) };
}

function workspace(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-old-values-'));
  writeFileSync(join(root, 'main.dg'), contents);
  return root;
}

const THEME = (body: string, inside = ''): string => `theme t {\n  palette { tinta "#1f2937" }\n  node {\n    layer forma rect { radius 4 }\n${body}${inside}  }\n}`;
const USES_T = '  theme t\n';

/** Old catalog value -> the English one, per category; each snippet is a minimal Workspace using the old value. */
const CASES: ReadonlyArray<{ category: string; oldName: string; newName: string; source: string; replacementText?: string }> = [
  { category: 'motion', oldName: 'flujo', newName: 'stream', source: BASE(THEME('    layer borde border { color tinta  motion flujo 2s }\n'), USES_T) },
  { category: 'motion', oldName: 'respiracion', newName: 'breathe', source: BASE(THEME('    layer borde border { color tinta  motion respiracion 3s }\n'), USES_T) },
  { category: 'effect', oldName: 'deslizar', newName: 'slide', source: BASE(THEME('', '  enter deslizar 300ms\n'), USES_T) },
  { category: 'effect', oldName: 'escala', newName: 'zoom', source: BASE(THEME('', '  exit escala 200ms\n'), USES_T) },
  { category: 'state', oldName: 'seleccionado', newName: 'selected', source: BASE(THEME('    state seleccionado { layer forma { radius 8 } }\n'), USES_T) },
  { category: 'state', oldName: 'en-ruta', newName: 'on-path', source: BASE(THEME('    state en-ruta { layer forma { radius 8 } }\n'), USES_T) },
  { category: 'theme', oldName: 'alto-contraste', newName: 'high-contrast', source: BASE('', '  theme alto-contraste\n') },
  { category: 'theme', oldName: 'alto-contraste', newName: 'high-contrast', source: BASE('theme t extends alto-contraste { }', USES_T) },
  { category: 'layer', oldName: 'borde', newName: 'border', source: BASE('theme t extends neutral { node { state hover { layer borde { width 2 } } } }', USES_T) },
  { category: 'layer', oldName: 'forma', newName: 'shape', source: BASE('theme t extends neutral { node { layer marca solid after forma { color blue } } }', USES_T) },
  { category: 'palette', oldName: 'tinta', newName: 'ink', replacementText: 'ink/0.5', source: BASE('theme t extends neutral { node { layer fill { color tinta/0.5 } } }', USES_T) },
  { category: 'palette', oldName: 'tinta', newName: 'ink', replacementText: 'mix(ink,paper,0.5)', source: BASE('theme t extends neutral { node { layer fill { color mix(tinta, papel, 0.5) } } }', USES_T) },
  { category: 'color', oldName: 'ORIGEN', newName: 'ORIGIN', source: BASE('theme t extends neutral { edge { layer line { color ORIGEN } } }', USES_T) },
];

describe('validate: old catalog values', () => {
  it.each(CASES)('$category: `$oldName` is an old-catalog-value error whose fix rewrites it to `$newName`, and the Workspace ends clean', async ({ oldName, newName, source, replacementText }) => {
    const root = workspace(source);
    const { exitCode, output } = await validateCommand(root);

    expect(exitCode).toBe(1);
    const issue = output.issues.find((i) => i.code === 'old-catalog-value');
    expect(issue, JSON.stringify(output.issues)).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain(`'${oldName}'`);
    expect(issue?.message).toContain(`'${newName}'`);
    expect(issue?.fix?.replacement).toBe(replacementText ?? newName);
    expect(output.issues.filter((i) => i.code === 'old-catalog-value')).toHaveLength(1);

    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify([issue?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(root, 'main.dg'), 'utf8')).toContain(newName);
    expect((await validateCommand(root)).output.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a user Theme that declares its own `fondo` color and `borde` Layer is untouched', async () => {
    const root = workspace(BASE('theme t { palette { fondo "#ffffff" }  node { layer borde border { color fondo } }  edge { layer linea line { color fondo } } }', USES_T));
    expect((await validateCommand(root)).output.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('the new names validate clean', async () => {
    const root = workspace(BASE(THEME('    layer borde border { color tinta  motion stream 2s }\n    state on-path { layer forma { radius 8 } }\n', '  enter zoom 300ms\n'), USES_T));
    expect((await validateCommand(root)).output.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
