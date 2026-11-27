import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo } }
model {
  servicio api
  servicio db
  api -> db
}
`;

const view = `view v {
  type architecture
  include **
  theme t
}
`;

const theme = (fonts: string) => `theme t {
  palette { rojo "#dc2626"  papel "#fefce8" }
  ${fonts}
  node {
    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    slots { title attrs }
  }
}
`;

const workspace = (fonts: string) => ({ 'main.dg': model + theme(fonts) + view });
const CAVEAT = ['fuentes/caveat-latin-400-normal.woff2', 'fuentes/caveat-latin-700-normal.woff2', 'fuentes/OFL-caveat.txt'];
const WITH_CAVEAT = 'fonts { body "Caveat"  mono "Caveat"  fallback "cursive" }';

describe('session seam: Workspace fonts', () => {
  it('a declared font without a file is an error with code and position in the Theme, and suggests the nearest one', async () => {
    const session = openSession(workspace('fonts { body "Cavet"  mono "monospace"  fallback "sans-serif" }'), { fontFiles: CAVEAT });

    const errors = (await session.diagnose()).filter((x) => x.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'theme-font-missing', file: 'main.dg', line: 7, column: 7 });
    expect(errors[0]!.message).toContain("'Cavet'");
    expect(errors[0]!.message).toContain('fonts.body');
    expect(errors[0]!.hint).toContain("'caveat'");
  });

  it('the error also comes out of build', async () => {
    const { issues } = await openSession(workspace('fonts { body "Caveat"  mono "monospace"  fallback "sans-serif" }'), { fontFiles: [] }).build();

    expect(issues.map((x) => x.code)).toContain('theme-font-missing');
  });

  it('with the file in the Workspace there is no error and the Resolved style carries the faces and the declared fallback', async () => {
    const session = openSession(workspace(WITH_CAVEAT), { fontFiles: CAVEAT });

    expect((await session.diagnose()).filter((x) => x.severity === 'error')).toEqual([]);
    const { fuentes } = session.style('v')!;
    expect(fuentes.cuerpo).toBe('"Caveat", cursive');
    expect(fuentes.caras.map((c) => [c.peso, c.ruta])).toEqual([
      [400, 'fuentes/caveat-latin-400-normal.woff2'],
      [700, 'fuentes/caveat-latin-700-normal.woff2'],
    ]);
  });

  it('generic families need no file', async () => {
    const session = openSession(workspace('fonts { body "sans-serif"  mono "ui-monospace" }'), { fontFiles: [] });

    expect((await session.diagnose()).filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('without the list of files (an adapter that does not know it) nothing is checked', async () => {
    const session = openSession(workspace(WITH_CAVEAT));

    expect((await session.diagnose()).filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('update keeps the list of files and accepts a new one', async () => {
    const without = openSession(workspace(WITH_CAVEAT), { fontFiles: [] });
    const withFiles = without.update(workspace(WITH_CAVEAT), { fontFiles: CAVEAT });

    expect((await without.diagnose()).map((x) => x.code)).toContain('theme-font-missing');
    expect((await withFiles.diagnose()).map((x) => x.code)).not.toContain('theme-font-missing');
    expect((await without.update(workspace(WITH_CAVEAT)).diagnose()).map((x) => x.code)).toContain('theme-font-missing');
  });
});
