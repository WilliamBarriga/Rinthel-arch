import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, construirMovimiento, estiloResuelto, temaResueltoSchema } from 'tema';

const p = (clave: string, valor: string | number) => ({ clave, valor });

describe('animacion en el Estilo resuelto', () => {
  const pulso = construirMovimiento('pulso', [p('duration', 1200)]).animacion!;
  const aura = construirMovimiento('aura', []).animacion!;
  const conAnimacion = {
    ...TEMA_NEUTRO,
    palette: { blue: '#00f' },
    nodo: {
      capas: [
        { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 4 } } },
        { nombre: 'acento', primitiva: { tipo: 'border', props: { color: 'blue', width: 2 } }, animacion: pulso },
      ],
      slots: ['title'],
      tipos: {},
      estados: { seleccionado: [{ nombre: 'acento', props: {}, animacion: aura }], hover: [{ nombre: 'acento', props: {}, animacion: null }] },
      animacion: { transicion: { duracionMs: 120, easing: 'ease-out', reducido: 'fade' }, escalonadoMs: 60 },
    },
  };
  const sinAnimacion = {
    ...conAnimacion,
    nodo: {
      capas: conAnimacion.nodo.capas.map(({ animacion: _a, ...capa }) => capa),
      slots: conAnimacion.nodo.slots,
      tipos: {},
      estados: { seleccionado: [{ nombre: 'acento', props: {} }] },
    },
  };

  it('la pintura lleva el Movimiento de la Capa y el de cada estado (el parche lo cambia o lo quita)', () => {
    const { pintura } = estiloResuelto(conAnimacion);

    expect(pintura.nodo.capas.find((c) => c.nombre === 'acento')?.animacion).toEqual(pulso);
    expect(pintura.nodo.estados.seleccionado?.find((c) => c.nombre === 'acento')?.animacion).toEqual(aura);
    expect(pintura.nodo.estados.hover?.find((c) => c.nombre === 'acento')?.animacion).toBeUndefined();
    expect(pintura.nodo.animacion).toEqual({ transicion: { duracionMs: 120, easing: 'ease-out', reducido: 'fade' }, escalonadoMs: 60 });
  });

  it('nada animado afecta a las Metricas: iguales con y sin animacion', () => {
    expect(estiloResuelto(conAnimacion).metricas).toEqual(estiloResuelto(sinAnimacion).metricas);
  });

  it('el esquema rechaza un Movimiento fuera de catalogo o con rango invalido', () => {
    const malo = (animacion: unknown) => ({ ...conAnimacion, nodo: { ...conAnimacion.nodo, capas: [{ nombre: 'f', primitiva: { tipo: 'rect', props: {} }, animacion }] } });

    expect(temaResueltoSchema.safeParse(conAnimacion).success).toBe(true);
    expect(temaResueltoSchema.safeParse(malo({ ...pulso, movimiento: 'salto' })).success).toBe(false);
    expect(temaResueltoSchema.safeParse(malo({ ...pulso, intensidad: 3 })).success).toBe(false);
  });
});
