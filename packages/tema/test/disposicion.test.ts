import { describe, expect, it } from 'vitest';
import { CODIGOS } from 'canonico';
import { colocarDisposicion, construirDisposicion, medirDisposicion } from 'tema';
import type { CajaDeSlots, EntradaDeCaja, MedidaDeSlot, NombreDeSlot } from 'tema';

/** Medidas fijas: icon 20x20, title 100x30 (elastico), attrs 80x40 (elastico). */
const medida =
  (ausentes: NombreDeSlot[] = []): MedidaDeSlot =>
  (slot) =>
    ausentes.includes(slot) ? undefined : ({ icon: { width: 20, height: 20 }, title: { width: 100, height: 30 }, attrs: { width: 80, height: 40 } } as Partial<Record<NombreDeSlot, { width: number; height: number }>>)[slot];

const caja = (direccion: 'row' | 'column', hijos: CajaDeSlots['hijos'], resto: Partial<CajaDeSlots> = {}): CajaDeSlots => ({ direccion, gap: 0, pad: 0, hijos, ...resto });

describe('colocacion de la disposicion de Slots', () => {
  it('una columna apila los Slots y cada uno ocupa todo el ancho', () => {
    const { slots, alto } = colocarDisposicion(caja('column', [{ slot: 'title' }, { slot: 'attrs' }]), medida(), 200);

    expect(slots.title).toEqual({ x: 0, y: 0, width: 200, height: 30 });
    expect(slots.attrs).toEqual({ x: 0, y: 30, width: 200, height: 40 });
    expect(alto).toBe(70);
  });

  it('una fila deja el icono en su lado y el titulo elastico ocupa el resto, centrado en vertical', () => {
    const { slots, alto } = colocarDisposicion(caja('row', [{ slot: 'icon' }, { slot: 'title' }], { gap: 6 }), medida(), 200);

    expect(slots.icon).toEqual({ x: 0, y: 5, width: 20, height: 20 });
    expect(slots.title).toEqual({ x: 26, y: 0, width: 174, height: 30 });
    expect(alto).toBe(30);
  });

  it('gap y pad reservan espacio y se descuentan del ancho de los hijos', () => {
    const { slots, alto } = colocarDisposicion(caja('column', [{ slot: 'title' }, { slot: 'attrs' }], { gap: 4, pad: 10 }), medida(), 200);

    expect(slots.title).toEqual({ x: 10, y: 10, width: 180, height: 30 });
    expect(slots.attrs).toEqual({ x: 10, y: 44, width: 180, height: 40 });
    expect(alto).toBe(10 + 30 + 4 + 40 + 10);
  });

  it('anidado: una fila dentro de una columna, con el tamano natural del conjunto', () => {
    const arbol = caja('column', [caja('row', [{ slot: 'icon' }, { slot: 'title' }], { gap: 6 }), { slot: 'attrs' }], { pad: 8 });

    expect(medirDisposicion(arbol, medida())).toEqual({ width: 2 * 8 + 126, height: 2 * 8 + 30 + 40 });
    const { slots } = colocarDisposicion(arbol, medida(), 200);
    expect(slots.icon).toEqual({ x: 8, y: 13, width: 20, height: 20 });
    expect(slots.title).toEqual({ x: 34, y: 8, width: 158, height: 30 });
    expect(slots.attrs).toEqual({ x: 8, y: 38, width: 184, height: 40 });
  });

  it('align coloca un Slot con su tamano natural al inicio, centro o final del eje cruzado', () => {
    const en = (align: 'start' | 'center' | 'end') => colocarDisposicion(caja('column', [{ slot: 'icon', align }]), medida(), 100).slots.icon;

    expect(en('start')).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(en('center')).toEqual({ x: 40, y: 0, width: 20, height: 20 });
    expect(en('end')).toEqual({ x: 80, y: 0, width: 20, height: 20 });
  });

  it('un Slot sin contenido no reserva espacio ni deja hueco de gap, y una caja vacia desaparece', () => {
    const arbol = caja('column', [caja('row', [{ slot: 'icon' }], { pad: 5 }), { slot: 'title' }, { slot: 'attrs' }], { gap: 10 });
    const { slots, alto } = colocarDisposicion(arbol, medida(['icon', 'attrs']), 100);

    expect(slots).toEqual({ title: { x: 0, y: 0, width: 100, height: 30 } });
    expect(alto).toBe(30);
  });

  it('un Slot que el arbol no lista no se coloca', () => {
    expect(Object.keys(colocarDisposicion(caja('column', [{ slot: 'title' }]), medida(), 100).slots)).toEqual(['title']);
  });
});

describe('validacion de la disposicion', () => {
  const entrada = (hijos: EntradaDeCaja<string>['hijos'], props: EntradaDeCaja<string>['props'] = [], direccion = 'column'): EntradaDeCaja<string> => ({ ref: 'raiz', direccion, props, hijos });

  it('un arbol valido devuelve la disposicion con defectos', () => {
    const { disposicion, errores } = construirDisposicion(
      entrada([{ ref: 'f', direccion: 'row', props: [{ clave: 'gap', valor: '6', ref: 'gap' }], hijos: [{ ref: 'i', slot: 'icon' }, { ref: 't', slot: 'title', align: { clave: 'align', valor: 'end', ref: 'a' } }] }, { ref: 'x', slot: 'attrs' }]),
    );

    expect(errores).toEqual([]);
    expect(disposicion).toEqual(
      caja('column', [caja('row', [{ slot: 'icon' }, { slot: 'title', align: 'end' }], { gap: 6 }), { slot: 'attrs' }]),
    );
  });

  it('todos los errores a la vez, con codigo, referencia y "quisiste decir"', () => {
    const { errores } = construirDisposicion(
      entrada(
        [
          { ref: 'h1', slot: 'titl' },
          { ref: 'h2', slot: 'title', align: { clave: 'align', valor: 'centro', ref: 'a2' } },
          { ref: 'h3', slot: 'title' },
          { ref: 'f', direccion: 'rown', props: [], hijos: [] },
        ],
        [{ clave: 'gapp', valor: 8, ref: 'p1' }, { clave: 'pad', valor: 999, ref: 'p2' }],
      ),
    );

    expect(errores.map((e) => [e.codigo, e.ref])).toEqual([
      [CODIGOS.E_THEME_UNKNOWN_PROPERTY, 'p1'],
      [CODIGOS.E_THEME_INVALID_VALUE, 'p2'],
      [CODIGOS.E_THEME_UNKNOWN_SLOT, 'h1'],
      [CODIGOS.E_THEME_INVALID_VALUE, 'a2'],
      [CODIGOS.E_THEME_UNKNOWN_SLOT, 'h3'],
      [CODIGOS.E_THEME_INVALID_VALUE, 'f'],
    ]);
    expect(errores[0]!.hint).toBe("quisiste decir 'gap'");
    expect(errores[2]!.hint).toBe("quisiste decir 'title'");
    expect(errores[3]!.hint).toBe("quisiste decir 'center'");
    expect(errores[5]!.hint).toBe("quisiste decir 'row'");
  });
});
