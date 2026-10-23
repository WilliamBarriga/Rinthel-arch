import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

const base = 'specification { node servicio { color blue } }  model { servicio a }';
const tema = (cuerpo: string, cabecera = 'theme t') => compile({ 'main.dg': `${base}\n${cabecera} { ${cuerpo} }` });
const nodoDe = (resultado: ReturnType<typeof compile>, nombre = 't') => resultado.canonico?.themes.find((t) => t.name === nombre)?.['nodo'] as Record<string, any>;

const CAPAS = `
  layer forma rect
  layer acento border { color blue  width 2 }`;

describe('compile: animacion declarativa del Tema', () => {
  it('compila Movimientos de Capa, transition, enter, exit y stagger', () => {
    const resultado = tema(`palette { blue "#00f" }
      node {
        ${CAPAS.replace('width 2 }', `width 2  motion pulso 1.2s ease-in-out intensity 0.4 delay 100ms }`)}
        transition 120ms ease-out
        enter escala 300ms
        exit fundido 200ms reduced instant
        stagger 60ms
        state seleccionado { layer acento { motion aura }  transition 80ms }
      }`);
    const nodo = nodoDe(resultado);

    expect(resultado.issues).toEqual([]);
    expect(nodo['capas'][1].animacion).toEqual({ clase: 'movimiento', movimiento: 'pulso', duracionMs: 1200, easing: 'ease-in-out', intensidad: 0.4, retardoMs: 100, reducido: 'still' });
    expect(nodo['estados'].seleccionado[0].animacion).toMatchObject({ movimiento: 'aura', duracionMs: 2000 });
    expect(nodo['animacion']).toEqual({
      transicion: { duracionMs: 120, easing: 'ease-out', reducido: 'fade' },
      transicionesDeEstado: { seleccionado: { duracionMs: 80, easing: 'ease', reducido: 'fade' } },
      entrada: { efecto: 'escala', duracionMs: 300, easing: 'ease-out', retardoMs: 0, reducido: 'fade' },
      salida: { efecto: 'fundido', duracionMs: 200, easing: 'ease-out', retardoMs: 0, reducido: 'instant' },
      escalonadoMs: 60,
    });
  });

  it('keyframes minimos sobre una propiedad de la Capa, incluidos valores negativos', () => {
    const resultado = tema(`palette { blue "#00f" }
      node { ${CAPAS.replace('width 2 }', 'width 2  keyframes shift-x 2s { 0 0  50 -10  100 0 } }')} }`);

    expect(resultado.issues).toEqual([]);
    expect(nodoDe(resultado)['capas'][1].animacion).toMatchObject({
      clase: 'keyframes',
      propiedad: 'shift-x',
      duracionMs: 2000,
      pasos: [{ en: 0, valor: 0 }, { en: 50, valor: -10 }, { en: 100, valor: 0 }],
    });
  });

  it('motion none en un estado o en un hijo quita el Movimiento heredado', () => {
    const padre = `theme p { palette { blue "#00f" }  node { ${CAPAS.replace('width 2 }', 'width 2  motion respiracion }')} } }`;
    const resultado = compile({ 'main.dg': `${base}\n${padre}\ntheme h extends p { node { layer acento { motion none } } }` });

    expect(resultado.issues).toEqual([]);
    expect(nodoDe(resultado, 'p')['capas'][1].animacion).toMatchObject({ movimiento: 'respiracion' });
    expect(nodoDe(resultado, 'h')['capas'][1].animacion).toBeUndefined();
  });

  it('un hijo hereda la animacion del Nodo y puede cambiarla', () => {
    const padre = `theme p { node { transition 100ms  stagger 40ms } }`;
    const resultado = compile({ 'main.dg': `${base}\n${padre}\ntheme h extends p { node { stagger 90ms } }` });

    expect(resultado.issues).toEqual([]);
    expect(nodoDe(resultado, 'h')['animacion']).toEqual({ transicion: { duracionMs: 100, easing: 'ease', reducido: 'fade' }, escalonadoMs: 90 });
  });

  it('todos los errores a la vez, con codigo estable, posicion y sugerencia', () => {
    const { issues } = tema(`palette { blue "#00f" }
      node {
        ${CAPAS.replace('width 2 }', 'width 2  motion pulsso 1s }')}
        enter girar 300ms
        transition 120min
        stagger 9000ms
      }`);

    expect(issues.map((i) => i.code).sort()).toEqual(['E_THEME_INVALID_VALUE', 'E_THEME_INVALID_VALUE', 'E_THEME_UNKNOWN_MOTION', 'E_THEME_UNKNOWN_MOTION']);
    const motion = issues.find((i) => i.message.includes('pulsso'));
    expect(motion).toMatchObject({ file: 'main.dg', line: 6, hint: "quisiste decir 'pulso'" });
  });

  it('valores fuera de rango no se recortan', () => {
    const { issues } = tema(`palette { blue "#00f" }
      node { ${CAPAS.replace('width 2 }', 'width 2  motion pulso intensity 7 }')} }`);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'E_THEME_INVALID_VALUE', severity: 'error' });
  });

  it('dos transition en el mismo bloque es un error, no un ultimo-gana silencioso', () => {
    const { issues } = tema('node { transition 100ms  transition 200ms }');

    expect(issues.map((i) => i.code)).toEqual(['E_THEME_INVALID_VALUE']);
  });

  it('motion, delay y compania siguen siendo identificadores validos en el Modelo', () => {
    const { issues, canonico } = compile({ 'main.dg': 'specification { node motion }  model { motion delay  motion linear }' });

    expect(issues).toEqual([]);
    expect(canonico?.model.nodes.map((n) => n.id)).toEqual(['delay', 'linear']);
  });
});
