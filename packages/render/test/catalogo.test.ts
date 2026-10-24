import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO } from 'tema';

import { declaracionesDeCaja } from '../src/hoja';
import { resolverEstilo } from '../src/estilo';

const caja = (...capas: Array<[string, Record<string, string | number>]>) => {
  const estilo = resolverEstilo({ ...TEMA_NEUTRO, nodo: { ...TEMA_NEUTRO.nodo, capas: capas.map(([tipo, props], i) => ({ nombre: `c${i}`, primitiva: { tipo, props } })) } });
  return declaracionesDeCaja(estilo, estilo.pintura.nodo);
};

describe('pintores del catalogo de formas, rellenos y bordes', () => {
  it('las formas se traducen a su contorno CSS', () => {
    expect(caja(['pill', {}])['border-radius']).toBe('9999px');
    expect(caja(['circle', {}])['border-radius']).toBe('50%');
    // Corte simetrico arriba a la izquierda y abajo a la derecha; el borde y la sombra siguen el corte (sin clip-path).
    expect(caja(['cut', { cut: 12 }])).toEqual({ 'border-radius': '12px 0 12px 0', 'corner-shape': 'bevel' });
  });

  it('un relleno solido debajo de un patron no lo pisa, aunque venga despues', () => {
    const declaraciones = caja(['grid', { color: 'gray', size: 10, width: 1 }], ['solid', { color: 'blue' }]);

    expect(declaraciones['background']).toBe('#2563eb');
    expect(declaraciones['background-image']).toContain('linear-gradient(to right,#6b7280 1px');
    expect(declaraciones['background-size']).toBe('10px 10px,10px 10px');
  });

  it('varios patrones se apilan como la pila: la ultima Capa queda encima (primera en CSS)', () => {
    const declaraciones = caja(['gradient', { from: 'blue', to: 'gray', angle: 90 }], ['dots', { color: 'red', size: 8, radius: 1 }]);

    expect(declaraciones['background-image']).toBe('radial-gradient(circle,#dc2626 1px,transparent 1.5px),linear-gradient(90deg,#2563eb,#6b7280)');
    expect(declaraciones['background-size']).toBe('8px 8px,auto');
  });

  it('bordes: discontinuo, punteado y contorno', () => {
    expect(caja(['dashed', { color: 'blue', width: 2 }])['border']).toBe('2px dashed #2563eb');
    expect(caja(['dotted', { color: 'blue', width: 3 }])['border']).toBe('3px dotted #2563eb');
    expect(caja(['outline', { color: 'blue', width: 2, offset: 3 }])).toMatchObject({ outline: '2px solid #2563eb', 'outline-offset': '3px' });
  });
});
