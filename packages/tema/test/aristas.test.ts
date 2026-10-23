import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, construirPrimitiva, estiloResuelto, metricasDe, resolverTema, tamanoDeEtiqueta, temaResueltoSchema } from 'tema';
import type { TemaResuelto } from 'tema';

const paleta = { blue: '#2563eb', paper: '#ffffff' };
const linea = (nombre: string, props: Record<string, string | number>) => ({ nombre, primitiva: { tipo: 'line', props } });

const conArista = (arista: Partial<TemaResuelto['arista']>): TemaResuelto => ({
  ...TEMA_NEUTRO,
  arista: { ...TEMA_NEUTRO.arista, ...arista },
});

const GLOW = conArista({
  capas: [
    linea('glow', { color: 'ORIGEN/0.3', width: 8, style: 'solid', corner: 'sharp', cut: 6 }),
    linea('principal', { color: 'ORIGEN', width: 2, style: 'solid', corner: 'sharp', cut: 6 }),
  ],
});

describe('Familia trazo', () => {
  it('rellena los defectos y acepta los cuatro estilos y la esquina chaflan', () => {
    for (const style of ['solid', 'dashed', 'dotted', 'pixel']) {
      expect(construirPrimitiva('line', [{ clave: 'color', valor: 'blue' }, { clave: 'style', valor: style }], paleta, 'capa-arista').errores).toEqual([]);
    }
    expect(construirPrimitiva('line', [{ clave: 'color', valor: 'blue' }, { clave: 'corner', valor: 'chamfer' }], paleta, 'capa-arista').primitiva?.props).toEqual({
      color: 'blue',
      width: 1.5,
      style: 'solid',
      corner: 'chamfer',
      cut: 6,
    });
  });

  it('rechaza un estilo desconocido con sugerencia y un grosor fuera de rango sin recortar', () => {
    const [estilo] = construirPrimitiva('line', [{ clave: 'color', valor: 'blue' }, { clave: 'style', valor: 'dashd' }], paleta, 'capa-arista').errores;
    const [grosor] = construirPrimitiva('line', [{ clave: 'color', valor: 'blue' }, { clave: 'width', valor: 99 }], paleta, 'capa-arista').errores;

    expect(estilo).toMatchObject({ codigo: 'E_THEME_INVALID_VALUE', hint: "quisiste decir 'dashed'" });
    expect(grosor?.codigo).toBe('E_THEME_INVALID_VALUE');
  });

  it('un trazo no vale como Capa de Nodo ni una Capa de Nodo como trazo', () => {
    expect(construirPrimitiva('line', [], paleta).errores[0]).toMatchObject({ codigo: 'E_THEME_UNKNOWN_PRIMITIVE' });
    expect(construirPrimitiva('solid', [], paleta, 'capa-arista').errores[0]).toMatchObject({ codigo: 'E_THEME_UNKNOWN_PRIMITIVE' });
    expect(temaResueltoSchema.safeParse(conArista({ capas: [{ nombre: 'x', primitiva: { tipo: 'solid', props: { color: 'blue' } } }] })).success).toBe(false);
  });

  it('ORIGEN vale en una Arista y no en un Nodo', () => {
    expect(construirPrimitiva('line', [{ clave: 'color', valor: 'ORIGEN' }], paleta, 'capa-arista').errores).toEqual([]);
    expect(construirPrimitiva('solid', [{ clave: 'color', valor: 'ORIGEN' }], paleta).errores).toHaveLength(1);
  });
});

describe('Familia marcador', () => {
  it('acepta los marcadores del catalogo, incluido via, con color opcional', () => {
    for (const tipo of ['arrow', 'dot', 'diamond', 'bar', 'via']) {
      expect(construirPrimitiva(tipo, [], paleta, 'marcador').primitiva).toEqual({ tipo, props: { size: 8 } });
    }
    expect(construirPrimitiva('arrow', [{ clave: 'size', valor: 1 }], paleta, 'marcador').errores).toHaveLength(1);
  });
});

describe('pintura de la Arista', () => {
  it('un segundo trazo ancho y translucido produce glow bajo el trazo principal', () => {
    const { capas } = estiloResuelto(GLOW).pintura.arista.origenes['blue']!;

    expect(capas.map((c) => c.nombre)).toEqual(['glow', 'principal']);
    expect(capas[0]?.props).toMatchObject({ color: 'rgba(37, 99, 235, 0.3)', width: 8 });
    expect(capas[1]?.props).toMatchObject({ color: '#2563eb', width: 2 });
  });

  it('ORIGEN toma el color del Nodo de origen; sin origen conocido, el borde del Tema', () => {
    const { arista } = estiloResuelto(GLOW).pintura;

    expect(arista.origenes['green']?.capas[1]?.props['color']).toBe(TEMA_NEUTRO.palette['green']);
    expect(arista.capas[1]?.props['color']).toBe(TEMA_NEUTRO.tokens.border);
  });

  it('sin trazos declarados hay una linea del color del borde, y el marcador sin color toma el del primer trazo', () => {
    const { arista } = estiloResuelto(TEMA_NEUTRO).pintura;

    expect(arista.capas).toHaveLength(1);
    expect(arista.fin).toEqual({ tipo: 'arrow', props: { size: 8, color: TEMA_NEUTRO.tokens.border } });
    expect(arista.origen).toBeUndefined();
  });

  it('el estilo de texto de un Slot llega a la pintura del Nodo', () => {
    const tema: TemaResuelto = {
      ...TEMA_NEUTRO,
      nodo: { ...TEMA_NEUTRO.nodo, textos: { title: { tipo: 'text', props: { weight: 700, style: 'normal', transform: 'none', color: 'blue' } } } },
    };

    expect(estiloResuelto(tema).pintura.nodo.textos.title?.props).toMatchObject({ weight: 700, color: '#2563eb' });
  });
});

describe('Metricas de la Arista', () => {
  it('solo la etiqueta cuenta: trazos, glow y marcadores no cambian las Metricas', () => {
    const decorada = conArista({ ...GLOW.arista, origen: { tipo: 'dot', props: { size: 12 } }, fin: { tipo: 'via', props: { size: 16 } } });

    expect(metricasDe(decorada)).toEqual(metricasDe(TEMA_NEUTRO));
    expect(estiloResuelto(decorada).metricas).toEqual(estiloResuelto(TEMA_NEUTRO).metricas);
  });

  it('la etiqueta cambia la caja que se reserva: escala y margen interior', () => {
    const ancha = conArista({ etiqueta: { tipo: 'label', props: { scale: 1.2, pad: 10, radius: 4 } } });
    const base = tamanoDeEtiqueta('conecta', metricasDe(TEMA_NEUTRO));
    const grande = tamanoDeEtiqueta('conecta', metricasDe(ancha));

    expect(metricasDe(ancha)).not.toEqual(metricasDe(TEMA_NEUTRO));
    expect(grande.width).toBeGreaterThan(base.width);
    expect(grande.height).toBeGreaterThan(base.height);
  });

  it('el relleno y el borde de la etiqueta son pintura: no cambian las Metricas', () => {
    const pintada = conArista({ etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 0, fill: 'blue', border: 'gray' } } });

    expect(metricasDe(pintada)).toEqual(metricasDe(TEMA_NEUTRO));
  });

  it('un Tema con una Arista invalida no cumple el contrato', () => {
    expect(() => resolverTema(conArista({ fin: { tipo: 'flecha', props: {} } }))).toThrow(/arista\.fin/);
  });
});
