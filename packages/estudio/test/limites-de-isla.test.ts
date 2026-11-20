import { describe, expect, it } from 'vitest';

import { LIMITES_DE_ISLA, rangoDeIsla, tamanoPorTeclado, tamanoTrasArrastre } from '../navegador/marco/limites';

const lienzo = { ancho: 1400, alto: 900 };

describe('limites del redimensionado de las islas', () => {
  it('el ancho y el alto quedan entre los minimos y lo que deja el lienzo', () => {
    expect(rangoDeIsla(lienzo)).toEqual({ ancho: { min: 220, max: 640 }, alto: { min: 140, max: 836 } });
    // En un lienzo estrecho el maximo baja, pero nunca por debajo del minimo.
    expect(rangoDeIsla({ ancho: 500, alto: 100 })).toEqual({ ancho: { min: 220, max: 250 }, alto: { min: 140, max: 140 } });
    expect(LIMITES_DE_ISLA.anchoMin).toBe(220);
  });

  it('arrastrar el asa lateral de la isla izquierda hacia la derecha la ensancha; en la derecha la estrecha', () => {
    const inicio = { ancho: 300, alto: null, altoMedido: 400 };

    expect(tamanoTrasArrastre(inicio, { dx: 50, dy: 0 }, { lado: 'izquierda', eje: 'horizontal' }, lienzo)).toEqual({ ancho: 350, alto: null });
    expect(tamanoTrasArrastre(inicio, { dx: 50, dy: 0 }, { lado: 'derecha', eje: 'horizontal' }, lienzo)).toEqual({ ancho: 250, alto: null });
  });

  it('el arrastre vertical parte del alto medido del contenido y fija un alto en px', () => {
    const inicio = { ancho: 300, alto: null, altoMedido: 400 };

    expect(tamanoTrasArrastre(inicio, { dx: 99, dy: 60 }, { lado: 'izquierda', eje: 'vertical' }, lienzo)).toEqual({ ancho: 300, alto: 460 });
  });

  it('la esquina mueve los dos ejes y se recorta a los limites', () => {
    const inicio = { ancho: 300, alto: 300, altoMedido: 500 };

    expect(tamanoTrasArrastre(inicio, { dx: -40, dy: 20 }, { lado: 'derecha', eje: 'diagonal' }, lienzo)).toEqual({ ancho: 340, alto: 320 });
    expect(tamanoTrasArrastre(inicio, { dx: -2000, dy: -2000 }, { lado: 'derecha', eje: 'diagonal' }, lienzo)).toEqual({ ancho: 640, alto: 140 });
  });

  it('el teclado del separador ("window splitter"): flechas por pasos, Inicio al minimo y Fin al maximo', () => {
    const actual = { ancho: 300, alto: 300, altoMedido: 300 };

    expect(tamanoPorTeclado('ArrowRight', actual, { lado: 'izquierda', eje: 'horizontal' }, lienzo)).toEqual({ ancho: 316, alto: 300 });
    expect(tamanoPorTeclado('ArrowRight', actual, { lado: 'derecha', eje: 'horizontal' }, lienzo)).toEqual({ ancho: 284, alto: 300 });
    expect(tamanoPorTeclado('ArrowDown', actual, { lado: 'derecha', eje: 'vertical' }, lienzo)).toEqual({ ancho: 300, alto: 316 });
    expect(tamanoPorTeclado('Home', actual, { lado: 'izquierda', eje: 'horizontal' }, lienzo)).toEqual({ ancho: 220, alto: 300 });
    expect(tamanoPorTeclado('End', actual, { lado: 'izquierda', eje: 'vertical' }, lienzo)).toEqual({ ancho: 300, alto: 836 });
    expect(tamanoPorTeclado('a', actual, { lado: 'izquierda', eje: 'vertical' }, lienzo)).toBeUndefined();
  });
});
