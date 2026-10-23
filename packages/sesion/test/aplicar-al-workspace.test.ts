import { describe, expect, it } from 'vitest';

import { aplicarAlWorkspace, hashDeContenido } from 'sesion';
import type { Intencion, PuertoDeWorkspace } from 'sesion';

const texto = `specification { node servicio }
model { servicio a }
view v {
  type architecture
  include **
}
`;

/** Fake en memoria del Workspace: `propios` son los archivos escribibles; `temas` solo se leen. */
function fake(propios: Record<string, string>, temas: Record<string, string> = {}) {
  let actuales = { ...propios };
  const escrituras: string[] = [];
  const puerto: PuertoDeWorkspace = {
    leer: () => ({ disco: { ...temas, ...actuales }, propios: { ...actuales } }),
    escribir: (ruta, nuevo) => {
      escrituras.push(ruta);
      actuales = { ...actuales, [ruta]: nuevo };
    },
  };
  return { puerto, escrituras, texto: (ruta: string) => actuales[ruta] };
}

const mover = (t: string, extra: Partial<Intencion> = {}): Intencion => ({
  tipo: 'mover-pin',
  vista: 'v',
  nodo: 'a',
  x: 4,
  y: 6,
  hash: hashDeContenido(t),
  ...extra,
});

describe('aplicarAlWorkspace', () => {
  it('escribe solo los archivos cambiados y los informa', () => {
    const ws = fake({ 'main.dg': texto, 'otro.dg': '' });
    const r = aplicarAlWorkspace(ws.puerto, mover(texto));
    expect(r).toEqual({ ok: true, cambiados: ['main.dg'] });
    expect(ws.escrituras).toEqual(['main.dg']);
    expect(ws.texto('main.dg')).toContain('node a { pin 4,6 }');
  });

  it('rechaza con motivo y no escribe nada', () => {
    const ws = fake({ 'main.dg': texto });
    const r = aplicarAlWorkspace(ws.puerto, mover(texto, { hash: 'viejo' }));
    expect(r).toMatchObject({ ok: false, motivo: 'hash-desactualizado' });
    expect(ws.escrituras).toEqual([]);
  });

  it('no escribe un archivo que no es del Workspace (viene de un tema)', () => {
    const ws = fake({}, { 'main.dg': texto });
    const r = aplicarAlWorkspace(ws.puerto, mover(texto));
    expect(r).toMatchObject({ ok: false, motivo: 'archivo-desconocido', file: 'main.dg' });
    expect(ws.escrituras).toEqual([]);
  });
});
