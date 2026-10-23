import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO } from 'tema';

import { declaracionesDeCaja } from '../src/hoja';
import { resolverEstilo } from '../src/estilo';

const caja = (...capas: Array<[string, Record<string, string | number>]>) =>
  declaracionesDeCaja(
    resolverEstilo({ ...TEMA_NEUTRO, nodo: { ...TEMA_NEUTRO.nodo, capas: capas.map(([tipo, props], i) => ({ nombre: `c${i}`, primitiva: { tipo, props } })) } }),
  );

describe('pintores del catalogo de formas, rellenos y bordes', () => {
  it('las formas se traducen a su contorno CSS', () => {
    expect(caja(['pill', {}])['border-radius']).toBe('9999px');
    expect(caja(['circle', {}])['border-radius']).toBe('50%');
    expect(caja(['cut', { cut: 12 }])['clip-path']).toBe('polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)');
  });

  it('un relleno solido debajo de un patron no lo pisa, aunque venga despues', () => {
    const declaraciones = caja(['grid', { color: 'gray', size: 10, width: 1 }], ['solid', { color: 'blue' }]);

    expect(declaraciones['background']).toBe('#2563eb');
    expect(declaraciones['background-image']).toContain('linear-gradient(to right,#6b7280 1px');
    expect(declaraciones['background-size']).toBe('10px 10px,10px 10px');
  });

  it('varios patrones se acumulan en el orden de la pila', () => {
    const declaraciones = caja(['gradient', { from: 'blue', to: 'gray', angle: 90 }], ['dots', { color: 'red', size: 8, radius: 1 }]);

    expect(declaraciones['background-image']).toBe('linear-gradient(90deg,#2563eb,#6b7280),radial-gradient(circle,#dc2626 1px,transparent 1.5px)');
    expect(declaraciones['background-size']).toBe('auto,8px 8px');
  });

  it('bordes: discontinuo, punteado y contorno', () => {
    expect(caja(['dashed', { color: 'blue', width: 2 }])['border']).toBe('2px dashed var(--trazo, #2563eb)');
    expect(caja(['dotted', { color: 'blue', width: 3 }])['border']).toBe('3px dotted var(--trazo, #2563eb)');
    expect(caja(['outline', { color: 'blue', width: 2, offset: 3 }])).toMatchObject({ outline: '2px solid #2563eb', 'outline-offset': '3px' });
  });
});
