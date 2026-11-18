import { describe, expect, it } from 'vitest';

import { leerGeometriasDeDev } from '../navegador/geometria';

const buena = { view: 'v', theme: 't', layoutKey: 'k', geometry: { kind: 'grafo', nodes: { a: { x: 0, y: 0, width: 1, height: 1 } }, edges: {}, pinsSolapados: [], width: 1, height: 1 } };

describe('geometria que recibe la pagina de dev', () => {
  it('acepta Geometrias validas por Vista', () => {
    const r = leerGeometriasDeDev({ v: buena });

    expect(r.errores).toEqual([]);
    expect(r.porVista?.['v']?.geometry.kind).toBe('grafo');
  });

  it('reporta como error la Geometria malformada en vez de entregarla', () => {
    const r = leerGeometriasDeDev({ v: buena, w: { ...buena, geometry: { kind: 'grafo', nodes: 3 } } });

    expect(r.porVista).toBeUndefined();
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain('w');
  });
});
