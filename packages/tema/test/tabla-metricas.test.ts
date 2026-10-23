import { describe, expect, it } from 'vitest';

import type { Tema } from 'canonico';
import { TEMA_NEUTRO, claveDeMetricas, colocarNodo, metricasDeNodo, opTocaMetricas, tablaDeMetricas } from 'tema';
import type { OpDeCapa } from 'tema';

const forma = (props: Record<string, number> = {}) => ({ nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0, minWidth: 0, minHeight: 0, ...props } } });
const relleno = (color: string) => ({ nombre: 'relleno', primitiva: { tipo: 'solid', props: { color } } });
const op = (nombre: string, props: Record<string, number | string>): OpDeCapa => ({ nombre, props });

const tema = (capas: unknown[], tipos: Record<string, OpDeCapa[]> = {}): Tema =>
  ({ ...TEMA_NEUTRO, nodo: { ...TEMA_NEUTRO.nodo, capas, tipos } }) as Tema;

describe('tabla de Metricas por elemento', () => {
  it('un Tipo con caja minima propia tiene su entrada; un Tipo no mencionado usa la entrada base', () => {
    const tabla = tablaDeMetricas(tema([forma(), relleno('blue')], { db: [op('forma', { minWidth: 220, minHeight: 90 })] }));

    expect(colocarNodo('x', [], metricasDeNodo(tabla, 'db'))).toMatchObject({ width: 220, height: 90 });
    expect(colocarNodo('x', [], metricasDeNodo(tabla, 'servicio'))).toMatchObject({ width: 120 });
    expect(metricasDeNodo(tabla, 'servicio')).toBe(tabla.base);
  });

  it('un Tipo declarado cuyas Metricas coinciden con la base no cambia la clave', () => {
    const base = tema([forma(), relleno('blue')]);
    const conTipo = tema([forma(), relleno('blue')], { db: [op('relleno', { color: 'red' })] });

    expect(claveDeMetricas(tablaDeMetricas(conTipo))).toBe(claveDeMetricas(tablaDeMetricas(base)));
  });

  it('cambiar solo la pintura (Capas, colores, radio) no cambia la clave de Metricas', () => {
    const a = tema([forma({ radius: 0 }), relleno('blue')]);
    const b = tema([forma({ radius: 12 }), relleno('red'), { nombre: 'aura', primitiva: { tipo: 'border', props: { color: 'red', width: 3 } } }]);

    expect(claveDeMetricas(tablaDeMetricas(b))).toBe(claveDeMetricas(tablaDeMetricas(a)));
  });

  it('cambiar la caja minima cambia la clave', () => {
    const a = tema([forma()]);
    const b = tema([forma({ minWidth: 200 })]);

    expect(claveDeMetricas(tablaDeMetricas(b))).not.toBe(claveDeMetricas(tablaDeMetricas(a)));
  });

  it('la tabla trae Grupo abierto, Grupo colapsado y etiqueta de Arista', () => {
    const tabla = tablaDeMetricas(TEMA_NEUTRO);

    expect(tabla.grupoAbierto.paddingGrupo).toEqual({ top: 32, left: 16, bottom: 16, right: 16 });
    expect(tabla.grupoColapsado.slots).toEqual(['title', 'attrs']);
    expect(tabla.etiqueta.escalaEtiqueta).toBe(0.85);
  });
});

describe('parches de estado y Metricas', () => {
  const pilas = [[forma(), relleno('blue')] as never];

  it('un parche que toca la caja minima de una forma toca las Metricas; uno de pintura no', () => {
    expect(opTocaMetricas(op('forma', { minWidth: 300 }), pilas)).toBeDefined();
    expect(opTocaMetricas(op('forma', { radius: 8 }), pilas)).toBeUndefined();
    expect(opTocaMetricas(op('relleno', { color: 'red' }), pilas)).toBeUndefined();
  });

  it('el esquema rechaza un parche de estado que cambia la caja', () => {
    const malo = { ...tema([forma()]), nodo: { ...TEMA_NEUTRO.nodo, capas: [forma()], estados: { hover: [op('forma', { minWidth: 300 })] } } } as Tema;

    expect(() => tablaDeMetricas(malo)).toThrow(/Metricas/);
  });
});
