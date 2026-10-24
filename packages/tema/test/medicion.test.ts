import { describe, expect, it } from 'vitest';

import type { Tema } from 'canonico';
import { TEMA_NEUTRO, claveDeMetricas, claveDeTexto, colocarNodo, hashDeFuente, metricasDe, tablaDeMetricas, tamanoDeEtiqueta, textosAMedir } from 'tema';
import type { MedidasDeTexto } from 'tema';

const tema = TEMA_NEUTRO as unknown as Tema;
const medidas = (anchos: Record<string, number>, fuentes: Record<string, string> = { sans: 'aaaa' }): MedidasDeTexto => ({ nivel: 'medido', fuentes, anchos });

describe('medicion de texto', () => {
  it('sin medidas el nivel es estimado y el ancho sale de la estimacion por caracter', () => {
    const m = metricasDe(tema);

    expect(m.medicion).toEqual({ nivel: 'estimado', fuentes: {} });
    expect(colocarNodo({ titulo: 'abcd', atributos: [], icono: false }, m).width).toBe(Math.max(m.anchoMinimo, Math.ceil(4 * m.fontSize * m.factorDeAncho + m.paddingHorizontal)));
  });

  it('con medidas el ancho del Slot sale de la medida, no de la estimacion', () => {
    const m = tablaDeMetricas(tema).base;
    const clave = claveDeTexto(TEMA_NEUTRO.fonts.body, m.fontSize, 'abcd');
    const medido = tablaDeMetricas(tema, medidas({ [clave]: 500 })).base;

    expect(colocarNodo({ titulo: 'abcd', atributos: [], icono: false }, medido).width).toBe(500 + m.paddingHorizontal);
  });

  it('un texto sin medida cae a la estimacion', () => {
    const medido = tablaDeMetricas(tema, medidas({})).base;

    expect(colocarNodo({ titulo: 'abcd', atributos: [], icono: false }, medido).width).toBe(colocarNodo({ titulo: 'abcd', atributos: [], icono: false }, metricasDe(tema)).width);
  });

  it('la caja de una etiqueta usa la medida', () => {
    const m = tablaDeMetricas(tema).base;
    const clave = claveDeTexto(TEMA_NEUTRO.fonts.body, m.fontSize * m.escalaEtiqueta, 'lee');
    const medido = tablaDeMetricas(tema, medidas({ [clave]: 40 })).base;

    expect(tamanoDeEtiqueta('lee', medido).width).toBe(40 + m.holguraDeEtiqueta);
  });

  it('la clave de estructura cambia con el nivel y con el hash de fuente, no con los anchos', () => {
    const estimada = claveDeMetricas(tablaDeMetricas(tema));
    const a = claveDeMetricas(tablaDeMetricas(tema, medidas({ x: 1 })));
    const otraFuente = claveDeMetricas(tablaDeMetricas(tema, medidas({ x: 1 }, { sans: 'bbbb' })));
    const otrosAnchos = claveDeMetricas(tablaDeMetricas(tema, medidas({ x: 2 })));

    expect(a).not.toBe(estimada);
    expect(otraFuente).not.toBe(a);
    expect(otrosAnchos).toBe(a);
  });

  it('hashDeFuente es determinista y distingue contenidos', () => {
    expect(hashDeFuente(new Uint8Array([1, 2, 3]))).toBe(hashDeFuente(new Uint8Array([1, 2, 3])));
    expect(hashDeFuente(new Uint8Array([1, 2, 3]))).not.toBe(hashDeFuente(new Uint8Array([1, 2, 4])));
  });

  it('textosAMedir lista cada texto con su familia y tamano, sin repetidos', () => {
    const m = tablaDeMetricas(tema);
    const nodo = { id: 'a', type: 't', label: 'abcd', collapsed: false, children: [], source: [], attributes: [{ name: 'id', type: 'uuid' }] };
    const textos = textosAMedir({ nodes: [nodo, { ...nodo, id: 'b' }], edges: [{ label: 'lee' }] } as never, m);

    expect(textos).toContainEqual({ familia: TEMA_NEUTRO.fonts.body, tamano: m.base.fontSize, texto: 'abcd' });
    expect(textos).toContainEqual({ familia: TEMA_NEUTRO.fonts.body, tamano: m.base.fontSize * m.etiqueta.escalaEtiqueta, texto: 'lee' });
    expect(textos.filter((t) => t.texto === 'abcd')).toHaveLength(1);
  });
});
